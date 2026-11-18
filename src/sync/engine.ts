import { db } from '../db/database';
import { indexMetaRepo } from '../db/indexMetaRepo';
import { DEFAULT_CATEGORY } from '../domain/color';
import type { Note } from '../domain/types';
import type { SyncGateway } from './gatewayTypes';
import { PasswordSyncError } from './gatewayTypes';
import { isDeleted, isDeletedColor, type SyncConfig, type NoteDocument, type RemoteDocument, type ColorDocument } from './types';
import { compareDocuments, equivalent, mergeColors, sameNote } from './serialize';
import { localDocument, expireTrash, queueNote, marker, discardRemovedBytes, scheduleCleanup, unchanged } from './local';
import { cleanupPublished } from './cleanup';
import { sessionToken, sessionActive } from './session';
import type { SyncProgress } from '../state/syncStore';
import { accessStore, selectAccessMode } from '../state/accessStore';
import { cryptoStore } from '../state/cryptoStore';

let serial: Promise<unknown> = Promise.resolve();
export function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const next = serial.catch(() => {}).then(operation); serial = next.catch(() => {}); return next;
}
export type SyncResult = { kind: 'ok' | 'readonly'; downloaded: number; uploaded: number; deleted: number; migrated: boolean; deferred: number; maintenanceDeferred?: true };
function guard(token: number) { if (!sessionActive(token)) throw new DOMException('Account session ended', 'AbortError'); }
async function colors(): Promise<ColorDocument[]> {
  const removed = (await db.kv.get('deleted-colors'))?.value as ColorDocument[] ?? [];
  return [...await db.colors.toArray(), ...removed];
}
async function setColors(values: ColorDocument[]) {
  await db.colors.clear();
  await db.colors.bulkPut(values.filter(c => !isDeletedColor(c)) as import('../domain/types').Color[]);
  await db.kv.put({ key: 'deleted-colors', value: values.filter(isDeletedColor) });
}
async function backupView(gw: SyncGateway, folder: string | null, check: () => void): Promise<SyncResult> {
  await selectAccessMode('readonly', check); check();
  const backup = folder ? await gw.readLegacy(folder) : null; check();
  // Snapshot tables are separate from editable notes and their durable outbox.
  // Opening an old backup must never turn that snapshot into pending uploads.
  await db.transaction('rw', db.backupNotes, db.backupColors, db.kv, async () => {
    await db.backupNotes.clear(); await db.backupColors.clear();
    if (backup) {
      await db.backupNotes.bulkPut(backup.notes);
      await db.backupColors.bulkPut(backup.colors);
    }
    await db.kv.put({ key: 'backup-keys', value: backup?.salt && backup.checker ? { salt: backup.salt, checker: backup.checker } : null });
  });
  check();
  const crypto = cryptoStore.getState();
  if (crypto.salt !== backup?.salt || crypto.checker !== backup?.checker) crypto.lock();
  return { kind: 'readonly', downloaded: backup?.notes.length ?? 0, uploaded: 0, deleted: 0, migrated: false, deferred: 0 };
}
async function configuration(gw: SyncGateway, folder: string, active: boolean, check: () => void, remote: RemoteDocument<SyncConfig>): Promise<RemoteDocument<SyncConfig>> {
  const configThrough = (await db.outbox.where('noteId').equals('@config').toArray()).reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
  const params = await indexMetaRepo.get();
  const snapshot = await colors();
  const merged = mergeColors(snapshot, remote.value.colors);
  const value = { ...remote.value, colors: merged };
  // Only initial encryption setup may install local parameters. A rotation uses its own protocol.
  if (!value.salt && params?.salt && !value.keyRotation) { value.salt = params.salt; value.checker = params.checker; }
  if (!equivalent(value, remote.value)) {
    check();
    const file = await gw.writeConfig(folder, value, remote.file); check(); remote = { value, file };
  }
  if (active) {
    await db.transaction('rw', db.colors, db.kv, db.indexMeta, db.outbox, async () => {
      // Preserve category edits made while the network request was in flight.
      if (equivalent(snapshot, await colors())) { await setColors(merged); await acknowledge('@config', configThrough); }
      if (!params?.salt && value.salt && value.checker) await indexMetaRepo.set({ key: 'current', salt: value.salt, checker: value.checker });
      await db.kv.put({ key: 'sync-config', value });
    });
  }
  return remote;
}
function checkEncryption(doc: NoteDocument, config: SyncConfig) {
  if (isDeleted(doc) || !doc.iv) return;
  if (config.keyRotation || !doc.encryptionSalt || doc.encryptionSalt !== config.salt) {
    const target = config.keyRotation?.to ?? config;
    throw new PasswordSyncError(target.checker ?? '', target.salt ?? '', config.keyRotation ? 'Password change is in progress; open Settings to resume it' : undefined);
  }
}
async function acknowledge(id: string, through: number) {
  await db.outbox.where('noteId').equals(id).filter(item => (item.seq ?? 0) <= through).delete();
}
async function acknowledgeNote(doc: NoteDocument, through: number) {
  if (!await unchanged(doc)) return;
  if (!isDeleted(doc) && doc.attachments.length) await db.kv.bulkDelete(doc.attachments.map(item => `attachment:${item.id}`));
  await acknowledge(doc.id, through);
}
async function sendOne(gw: SyncGateway, folder: string, doc: NoteDocument, config: SyncConfig, check: () => void, active: boolean, known?: RemoteDocument<NoteDocument> | null): Promise<'sent' | 'same' | 'deferred'> {
  const through = (await db.outbox.where('noteId').equals(doc.id).toArray()).reduce((max, item) => Math.max(max, item.seq ?? 0), 0);
  const record = await db.syncRecords.get(doc.id);
  check();
  const remote = known === undefined ? await gw.readNote(folder, doc.id) : known; check();
  if (!remote && record?.remote) throw new Error(`Previously synchronized note is missing: ${doc.id}`);
  const now = Date.now();
  const normalized = expireTrash(doc, now);
  if (!active && remote && compareDocuments(normalized, expireTrash(remote.value, now)) < 0) {
    await db.syncRecords.put({ ...record, id: doc.id, needsPull: true }); return 'deferred';
  }
  if (!active && normalized !== doc) {
    const applied = await db.transaction('rw', db.notes, db.syncRecords, db.outbox, db.cleanup, db.kv, async () => {
      if (!await unchanged(doc)) return false;
      await discardRemovedBytes(doc, normalized);
      await scheduleCleanup(doc, normalized);
      await queueNote(normalized);
      return true;
    });
    if (!applied) return 'deferred';
    return sendOne(gw, folder, normalized, config, check, false, remote);
  }
  if (remote && sameNote(doc, remote.value)) {
    if (!isDeleted(doc)) { await gw.uploadPendingAttachments(folder, doc); check(); }
    await db.syncRecords.put({ ...record, id: doc.id, remote: remote.file, accepted: remote.value, needsPull: false });
    await db.transaction('rw', db.outbox, db.notes, db.syncRecords, db.kv, async () => { await acknowledgeNote(doc, through); }); return 'same';
  }
  checkEncryption(doc, config);
  if (!isDeleted(doc)) { await gw.uploadPendingAttachments(folder, doc); check(); }
  const file = await gw.writeNote(folder, doc, remote?.file); check();
  await db.transaction('rw', db.outbox, db.syncRecords, db.cleanup, db.notes, db.kv, async () => {
    await scheduleCleanup(remote?.value ?? record?.accepted, doc);
    await db.syncRecords.put({ ...await db.syncRecords.get(doc.id), id: doc.id, remote: file, accepted: doc, needsPull: false });
    await acknowledgeNote(doc, through);
  });
  // Active refresh will resolve anything that changed locally after this snapshot.
  return 'sent';
}
function normalizeHierarchy(documents: Map<string, NoteDocument>, now: number): void {
  for (const doc of documents.values()) {
    const visited = new Set<string>(); let current: NoteDocument | undefined = doc;
    while (current && !isDeleted(current) && current.parentId) {
      if (visited.has(current.id)) throw new Error('Cyclic note folder hierarchy');
      visited.add(current.id); current = documents.get(current.parentId);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, doc] of documents) {
      if (isDeleted(doc) || !doc.parentId) continue;
      const parent = documents.get(doc.parentId);
      if (!parent || isDeleted(parent)) { documents.set(id, parent && isDeleted(parent) ? marker(doc, parent.edited, parent.autoExpired) : marker(doc)); changed = true; }
      else if (parent.state >= 2 && doc.state < 2) {
        documents.set(id, { ...doc, state: 3, edited: parent.edited }); changed = true;
      } else if (parent.state < 2 && doc.state === 3) {
        const restored = { ...doc, state: 0 as const, edited: parent.edited };
        documents.set(id, restored); changed = true;
      }
    }
  }
  let expired = false;
  for (const [id, doc] of documents) {
    const normalized = expireTrash(doc, now);
    if (normalized !== doc) { documents.set(id, normalized); expired = true; }
  }
  if (expired) { normalizeHierarchy(documents, now); return; }

}
async function refresh(gw: SyncGateway, report: (p: SyncProgress) => void, token: number, canRefresh: () => boolean): Promise<SyncResult> {
  const check = () => {
    guard(token);
    if (!canRefresh()) throw new DOMException('Full refresh deferred while viewing a note', 'AbortError');
  };
  check(); if (!navigator.onLine) throw new Error('offline');
  report({ phase: 'checking' });
  const folder = await gw.findFolder(); check();
  const remoteConfig = folder ? await gw.readConfig(folder) : null; check();
  // Only Android publishes the completed migration. Missing or provisional
  // configuration leaves the web strictly in backup-viewing mode.
  if (!folder || !remoteConfig?.value.initialized) return backupView(gw, folder, check);
  const config = await configuration(gw, folder, true, check, remoteConfig); check();
  const crypto = cryptoStore.getState();
  if (crypto.unlocked && (crypto.salt !== config.value.salt || crypto.checker !== config.value.checker)) crypto.lock();
  await selectAccessMode('readwrite', check); check();
  const files = await gw.listNotes(folder); check();
  // Read one consistent snapshot, rather than opening transactions for every cached note.
  const [notes, records, pending] = await db.transaction('r', db.notes, db.syncRecords, db.outbox,
    () => Promise.all([db.notes.toArray(), db.syncRecords.toArray(), db.outbox.toArray()]));
  check();
  const locals = new Map<string, NoteDocument>(notes.map(n => [n.id, n]));
  const savedRecords = new Map(records.map(record => [record.id, record]));
  const pendingIds = new Set(pending.map(entry => entry.noteId));
  for (const record of records) if (record.tombstone) locals.set(record.id, record.tombstone);
  const remotes = new Map<string, RemoteDocument<NoteDocument>>();
  const cachedIds = new Set<string>();
  const downloads = files.filter(file => {
    const id = file.name.slice('tonote.note.'.length, -'.json'.length), saved = savedRecords.get(id);
    if (!file.version || saved?.remote?.id !== file.id || saved.remote.version !== file.version || !saved.accepted || saved.needsPull) return true;
    remotes.set(id, { value: saved.accepted, file: { ...file, etag: saved.remote.etag } });
    cachedIds.add(id); return false;
  });
  if (downloads.length) report({ phase: 'loading', completed: 0, total: downloads.length });
  for (let i = 0; i < downloads.length; i++) {
    const file = downloads[i], id = file.name.slice('tonote.note.'.length, -'.json'.length);
    const remote = await gw.readNote(folder, id, file);
    check(); if (!remote) throw new Error(`Missing note file: ${id}`);
    remotes.set(id, remote);
    report({ phase: 'loading', completed: i + 1, total: downloads.length });
  }
  for (const record of records) if (record.remote && !remotes.has(record.id)) throw new Error(`Previously synchronized note is missing: ${record.id}`);
  const now = Date.now();
  const winners = new Map(locals);
  for (const [id, remote] of remotes) {
    const local = locals.get(id);
    if (!local || compareDocuments(expireTrash(local, now), expireTrash(remote.value, now)) < 0) winners.set(id, remote.value);
  }
  normalizeHierarchy(winners, now);
  const categoryMap = new Map(config.value.colors.filter(c => !isDeletedColor(c)).map(c => [c.id, c]));
  const allowedSalts = config.value.keyRotation ? [config.value.keyRotation.from.salt, config.value.keyRotation.to.salt] : [config.value.salt];
  const work = [...winners].map(([id, raw]): [string, NoteDocument] => [id,
    isDeleted(raw) ? raw : { ...raw, color: categoryMap.get(raw.color.id) as Note['color'] ?? DEFAULT_CATEGORY },
  ]).filter(([id, doc]) => {
    const snapshot = locals.get(id), remote = remotes.get(id);
    const compatible = isDeleted(doc) || !doc.iv || (!!doc.encryptionSalt && allowedSalts.includes(doc.encryptionSalt));
    // No writes, acknowledgements or per-note database queries for an accepted,
    // unchanged version. A new concurrent local save retains its own durable queue.
    return !(cachedIds.has(id) && !pendingIds.has(id) && snapshot && remote && compatible && sameNote(snapshot, doc) && sameNote(remote.value, doc));
  });
  let downloaded = 0, uploaded = 0, deleted = 0, deferred = 0;
  const failures: { noteId: string; error: unknown }[] = [];
  let processed = 0;
  if (work.length) report({ phase: 'notes', completed: 0, total: work.length });
  for (const [id, doc] of work) {
    try {
    const snapshot = locals.get(id), remote = remotes.get(id);
    if (remote && !isDeleted(doc) && doc.iv) {
      if (!doc.encryptionSalt || !allowedSalts.includes(doc.encryptionSalt)) throw new PasswordSyncError(config.value.checker ?? '', config.value.salt ?? '');
    }
    if (!snapshot || !sameNote(snapshot, doc)) {
      const applied = await db.transaction('rw', db.notes, db.syncRecords, db.outbox, db.cleanup, db.kv, async () => {
        const current = await localDocument(id);
        if (snapshot ? !current || !sameNote(current, snapshot) : !!current) return false;
        await discardRemovedBytes(snapshot, doc);
        await scheduleCleanup(snapshot ?? remote?.value, doc);
        if (isDeleted(doc)) {
          await db.notes.delete(id); await db.syncRecords.put({ ...await db.syncRecords.get(id), id, tombstone: doc, accepted: undefined });
        } else { await db.notes.put(doc); await db.syncRecords.update(id, { tombstone: undefined }); }
        // A derived marker/state must itself be sent durably.
        if (!remote || !sameNote(remote.value, doc)) await db.outbox.add({ noteId: id, op: isDeleted(doc) ? 'delete' : 'upsert', queuedAt: Date.now() });
        return true;
      });
      if (!applied) { deferred++; continue; }
      if (isDeleted(doc)) deleted++; else downloaded++;
    }
    if (!remote || !sameNote(remote.value, doc)) {
      const result = await sendOne(gw, folder, doc, config.value, check, true, remote ?? null);
      if (result === 'sent') uploaded++; if (result === 'deferred') deferred++;
    } else {
      if (pendingIds.has(id) && !isDeleted(doc)) { await gw.uploadPendingAttachments(folder, doc); check(); }
      const through = (await db.outbox.where('noteId').equals(id).toArray()).reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
      if (await unchanged(doc)) {
        await db.syncRecords.put({ ...await db.syncRecords.get(id), id, accepted: remote.value, remote: remote.file, needsPull: false });
        await db.transaction('rw', db.outbox, db.notes, db.syncRecords, db.kv, async () => { await acknowledgeNote(doc, through); });
      } else { deferred++; }
    }
    } catch (error) {
      if (!sessionActive(token) || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      failures.push({ noteId: id, error });
    } finally {
      report({ phase: 'notes', completed: ++processed, total: work.length });
    }
  }
  if (failures.length) {
    const first = failures[0];
    if (first.error instanceof PasswordSyncError) throw first.error;
    const detail = first.error instanceof Error ? first.error.message : String(first.error);
    throw new Error(`${failures.length} note(s) could not be synchronized: ${detail} [note ${first.noteId}]`);
  }
  report({ phase: 'saving' });
  if (config.value.keyRotation) throw new PasswordSyncError(config.value.keyRotation.to.checker, config.value.keyRotation.to.salt, 'Password change is in progress; resume it in Settings');
  const localKeys = await indexMetaRepo.get();
  if (config.value.salt && localKeys?.salt && localKeys.salt !== config.value.salt) throw new PasswordSyncError(config.value.checker ?? '', config.value.salt);
  if (config.value.initialized && !deferred) {
    try { await cleanupPublished(gw, folder, check); }
    catch (error) {
      check();
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      // Maintenance is optional. The next complete refresh retries from Drive.
      return { kind: 'ok', downloaded, uploaded, deleted, migrated: false, deferred, maintenanceDeferred: true };
    }
  }
  return { kind: 'ok', downloaded, uploaded, deleted, migrated: false, deferred };
}
export function fullSync(gw: SyncGateway, report: (p: SyncProgress) => void = () => {}, options: { canRefresh?: () => boolean } = {}): Promise<SyncResult> {
  const token = sessionToken(); return exclusive(() => refresh(gw, report, token, options.canRefresh ?? (() => true)));
}
export function sendPending(gw: SyncGateway, onlyId?: string): Promise<void> {
  const token = sessionToken();
  return exclusive(async () => {
    guard(token); if (!navigator.onLine || accessStore.getState().mode !== 'readwrite') return;
    const pending = await db.outbox.toArray();
    const ids = [...new Set(pending.map(e => e.noteId).filter(id => id !== '@config' && (!onlyId || id === onlyId)))];
    if (!ids.length && !pending.some(e => e.noteId === '@config')) return;
    const folder = await gw.ensureFolder(); guard(token);
    const through = pending.filter(e => e.noteId === '@config').reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
    const remote = await gw.readConfig(folder); guard(token);
    if (!remote?.value.initialized) return;
    const config = await configuration(gw, folder, false, () => guard(token), remote);
    await acknowledge('@config', through);
    let conflict: unknown;
    for (const id of ids) {
      const doc = await localDocument(id); if (!doc) continue;
      try { await sendOne(gw, folder, doc, config.value, () => guard(token), false); }
      catch (error) { conflict ??= error; }
    }
    if (conflict) throw conflict;
  });
}

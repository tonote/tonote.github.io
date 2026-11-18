import { beforeEach, expect, it, vi } from 'vitest';
import { db, activateAccount } from '../db/database';
import { accessStore, restoreAccessMode } from '../state/accessStore';
import { cryptoStore } from '../state/cryptoStore';
import { DEFAULT_CATEGORY } from '../domain/color';
import { colorsRepo } from '../db/colorsRepo';
import { notesRepo } from '../db/notesRepo';
import { attachmentsRepo } from '../db/attachmentsRepo';
import { indexMetaRepo } from '../db/indexMetaRepo';
import { changeNoteState } from '../db/noteLifecycle';
import { deriveKeyAndChecker } from '../crypto/kdf';
import { bytesToBase64 } from '../crypto/aes';
import { decryptNote, encryptNote } from '../crypto/noteCrypto';
import { fullSync, sendPending } from './engine';
import { syncNoteNow } from './editSync';
import { saveNote } from './local';
import { reconcilePasswords, rotatePassword } from './passwordSync';
import { beginSession, endSession } from './session';
import { FakeDrive, note } from './testing';

let drive: FakeDrive;
beforeEach(async () => {
  beginSession(); await db.delete(); await db.open(); cryptoStore.getState().lock();
  drive = new FakeDrive(); drive.config = null;
  drive.legacy = { version: '1', id: 'backup', updated: 100, colors: [DEFAULT_CATEGORY], notes: [note('n')] };
});
it('reads only the snapshot and performs no writes, uploads, cleanup, or migration on Drive', async () => {
  const writeConfig = vi.spyOn(drive, 'writeConfig'), cleanup = vi.spyOn(drive, 'maintainAttachments');
  const upload = vi.spyOn(drive, 'uploadPendingAttachments');
  expect(await fullSync(drive)).toMatchObject({ kind: 'readonly', uploaded: 0, downloaded: 1 });
  await sendPending(drive);
  expect(accessStore.getState().mode).toBe('readonly');
  expect(await db.backupNotes.get('n')).toMatchObject({ content: 'text' });
  expect(await db.notes.count()).toBe(0); expect(await db.outbox.count()).toBe(0);
  expect(writeConfig).not.toHaveBeenCalled(); expect(cleanup).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
  expect(drive.lists).toBe(0); expect(drive.reads).toBe(0); expect(drive.writes).toBe(0);
});
it('refreshes the snapshot exactly, including removals, without purging trash or orphaned entries', async () => {
  drive.legacy!.notes.push(note('trash', { state: 2, edited: 1 }), note('orphan', { parentId: 'missing' }));
  await fullSync(drive);
  expect((await db.backupNotes.get('trash'))?.state).toBe(2); expect(await db.backupNotes.get('orphan')).toBeDefined();
  drive.legacy!.notes = [note('n', { content: 'updated snapshot' })];
  await fullSync(drive);
  expect(await db.backupNotes.count()).toBe(1); expect((await db.backupNotes.get('n'))?.content).toBe('updated snapshot');
  expect(drive.writes).toBe(0);
});
it('ignores partial per-note data until Android publishes initialized:true', async () => {
  drive.config = new FakeDrive().config; drive.config!.value.initialized = false;
  drive.seed(note('partial'));
  await fullSync(drive);
  expect(accessStore.getState().mode).toBe('readonly'); expect(drive.lists).toBe(0);
  expect(await db.backupNotes.get('n')).toBeDefined(); expect(await db.notes.get('partial')).toBeUndefined();
  expect(drive.config!.value.initialized).toBe(false);
});
it('switches to editable data at the next refresh without publishing the old snapshot', async () => {
  drive.legacy!.notes.push(note('backup-only', { edited: 999999 }));
  await fullSync(drive);
  drive.config = new FakeDrive().config;
  drive.seed(note('n', { content: 'Android sync version', edited: 100 }));
  await fullSync(drive);
  expect(accessStore.getState().mode).toBe('readwrite');
  expect((await db.notes.get('n'))?.content).toBe('Android sync version');
  expect(await db.notes.get('backup-only')).toBeUndefined();
  expect(drive.documents.has('backup-only')).toBe(false); expect(drive.writes).toBe(0);
  await saveNote(note('n', { content: 'web edit', edited: 200 })); await sendPending(drive);
  expect(drive.documents.get('n')?.value).toMatchObject({ content: 'web edit' });
});
it('preserves preexisting editable notes, pending files and queue while showing an unrelated backup', async () => {
  await saveNote(note('unsent', { attachments: [{ id: 'new-file' }] }));
  await attachmentsRepo.put('new-file', new Blob(['local bytes']));
  await fullSync(drive); await sendPending(drive);
  expect(await db.notes.get('unsent')).toBeDefined(); expect(await db.outbox.count()).toBe(1);
  expect(await attachmentsRepo.get('new-file')).toBeDefined();
  expect(await db.backupNotes.get('unsent')).toBeUndefined(); expect(drive.writes).toBe(0);
});
it('remains read-only with an empty snapshot if neither folder nor backup exists', async () => {
  vi.spyOn(drive, 'findFolder').mockResolvedValue(null);
  const ensure = vi.spyOn(drive, 'ensureFolder');
  await fullSync(drive);
  expect(accessStore.getState().mode).toBe('readonly'); expect(await db.backupNotes.count()).toBe(0);
  expect(ensure).not.toHaveBeenCalled();
});
it('persists the mode for offline reopening', async () => {
  await fullSync(drive); accessStore.setState({ mode: 'checking' });
  await restoreAccessMode(); expect(accessStore.getState().mode).toBe('readonly');
});
it('isolates backup contents and restored mode when changing Google accounts', async () => {
  await activateAccount('readonly-account-a');
  await fullSync(drive);
  await activateAccount('readonly-account-b'); await restoreAccessMode();
  expect(accessStore.getState().mode).toBe('checking'); expect(await db.backupNotes.count()).toBe(0);
  drive.legacy!.notes = [note('other-account')]; await fullSync(drive);
  await activateAccount('readonly-account-a'); await restoreAccessMode();
  expect(accessStore.getState().mode).toBe('readonly'); expect(await db.backupNotes.get('n')).toBeDefined();
  expect(await db.backupNotes.get('other-account')).toBeUndefined();
});
it.each(['readonly', 'checking'] as const)('blocks every public data mutation in %s mode', async mode => {
  accessStore.setState({ mode });
  const blocked = [saveNote(note('new')), notesRepo.put(note('new')), notesRepo.remove('n'), notesRepo.bulkPut([note('new')]),
    colorsRepo.put(DEFAULT_CATEGORY), colorsRepo.remove('category'), colorsRepo.forNewNote(), colorsRepo.bulkPut([DEFAULT_CATEGORY]),
    changeNoteState('n', 'trash'), attachmentsRepo.put('new', new Blob(['bytes'])),
    rotatePassword(drive, 'old', 'new'), reconcilePasswords(drive, 'old', 'new'), cryptoStore.getState().unlock('new password')];
  for (const promise of blocked) await expect(promise).rejects.toThrow(/read-only/);
  expect(await db.outbox.count()).toBe(0); expect(await db.indexMeta.count()).toBe(0); expect(drive.writes).toBe(0);
});
it('unlocks encrypted backup notes without changing encryption parameters or ciphertext', async () => {
  const saltBytes = new Uint8Array(16).fill(7);
  const { key, checker } = await deriveKeyAndChecker('backup password', saltBytes);
  const salt = bytesToBase64(saltBytes);
  const encrypted = await encryptNote(note('secret', { content: 'secret text', iv: bytesToBase64(new Uint8Array(16)), encryptionSalt: salt }), key);
  drive.legacy = { ...drive.legacy!, salt, checker: bytesToBase64(checker), notes: [encrypted] };
  await fullSync(drive);
  expect(await cryptoStore.getState().unlock('backup password')).toBe(true);
  const stored = (await db.backupNotes.get('secret'))!;
  expect(stored.content).toBe(encrypted.content);
  expect((await decryptNote(stored, cryptoStore.getState().key!)).content).toBe('secret text');
  expect(await indexMetaRepo.get()).toBeUndefined(); expect(await db.outbox.count()).toBe(0);
});
it('does not publish or apply an old backup after the account session ends', async () => {
  vi.spyOn(drive, 'readLegacy').mockImplementation(async () => { endSession(); return drive.legacy; });
  await expect(fullSync(drive)).rejects.toThrow('session');
  expect(await db.backupNotes.count()).toBe(0); expect(drive.writes).toBe(0);
});
it('does not switch mode when a migration check started in the list returns after opening a note', async () => {
  accessStore.setState({ mode: 'readonly' }); drive.config = new FakeDrive().config;
  let canRefresh = true;
  const config = vi.spyOn(drive, 'readConfig').mockImplementation(async () => { canRefresh = false; return drive.config; });
  await expect(fullSync(drive, () => {}, { canRefresh: () => canRefresh })).rejects.toMatchObject({ name: 'AbortError' });
  expect(config).toHaveBeenCalledOnce(); expect(drive.lists).toBe(0); expect(drive.writes).toBe(0);
  expect(accessStore.getState().mode).toBe('readonly');
  config.mockRestore(); canRefresh = true;
  await fullSync(drive, () => {}, { canRefresh: () => canRefresh });
  expect(accessStore.getState().mode).toBe('readwrite');
});
it('makes no Drive requests if a queued full refresh starts after the note has opened', async () => {
  accessStore.setState({ mode: 'readonly' });
  const folder = vi.spyOn(drive, 'findFolder');
  await expect(fullSync(drive, () => {}, { canRefresh: () => false })).rejects.toMatchObject({ name: 'AbortError' });
  expect(folder).not.toHaveBeenCalled(); expect(accessStore.getState().mode).toBe('readonly');
});
it('does not check migration or switch modes during a single-note operation', async () => {
  await db.outbox.add({ noteId: 'n', op: 'upsert', queuedAt: 1 });
  accessStore.setState({ mode: 'readonly' }); drive.config = new FakeDrive().config;
  const config = vi.spyOn(drive, 'readConfig'), folder = vi.spyOn(drive, 'ensureFolder');
  await syncNoteNow('n', drive);
  expect(config).not.toHaveBeenCalled(); expect(folder).not.toHaveBeenCalled();
  expect(accessStore.getState().mode).toBe('readonly'); expect(await db.outbox.count()).toBe(1);
});

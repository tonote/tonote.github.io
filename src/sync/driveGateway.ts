import { db } from '../db/database';
import { attachmentsRepo } from '../db/attachmentsRepo';
import type { SyncGateway } from './gatewayTypes';
import { OptimisticLockError } from './gatewayTypes';
import type { Note } from '../domain/types';
import type { NoteDocument, SyncConfig, RemoteDocument, CleanupTask } from './types';
import { isDeleted } from './types';
import type { DriveFile } from '../gateway/driveTypes';
import * as drive from '../gateway/drive';
import { CONFIG_FILE_NAME, DRIVE_FOLDER_NAME, noteFileName, LEGACY_BACKUP_FILE, attachmentFileName, ATTACHMENT_MAINTENANCE_BATCH_SIZE } from './constants';
import { parseNote, parseConfig, serializeNote } from './serialize';
import { parseLegacyBackup } from './migrate';
import { sessionActive, sessionToken } from './session';

export class DriveGatewayAdapter implements SyncGateway {
  private folder?: string;
  private listing?: DriveFile[];
  private generation = sessionToken();
  private guard() { if (!sessionActive(this.generation)) throw new DOMException('Account session ended', 'AbortError'); }
  private async allocated(name: string): Promise<string> {
    this.guard();
    const key = `sync-create:${name}`;
    const stored = await db.kv.get(key);
    if (stored) return stored.value as string;
    const id = await drive.generateFileId(); this.guard();
    await db.kv.put({ key, value: id }); return id;
  }
  async findFolder(): Promise<string | null> {
    this.guard();
    if (this.folder) return this.folder;
    const known = (await db.kv.get('sync-folder'))?.value as string | undefined;
    if (known) {
      try {
        const file = await drive.fileMetadata(known); this.guard();
        if (file.name !== DRIVE_FOLDER_NAME) throw new Error('Synchronization folder identity changed');
        return this.folder = known;
      } catch (error) { if (!(error instanceof drive.DriveError) || error.status !== 404) throw error; }
    }
    const existing = await drive.findFolder(DRIVE_FOLDER_NAME); this.guard();
    if (existing) { await db.kv.put({ key: 'sync-folder', value: existing.id }); return this.folder = existing.id; }
    return null;
  }
  async ensureFolder(): Promise<string> {
    const folder = await this.findFolder();
    if (!folder) throw new Error('Enable synchronization in the Android app first');
    return folder;
  }
  async readConfig(folder: string): Promise<RemoteDocument<SyncConfig> | null> {
    this.guard();
    const cache = (await db.kv.get('remote-config'))?.value as RemoteDocument<SyncConfig> | undefined;
    let file: DriveFile | null;
    try { file = cache ? await drive.fileMetadata(cache.file.id) : await drive.findFileByName(CONFIG_FILE_NAME, folder); }
    catch (error) {
      if (!(error instanceof drive.DriveError) || error.status !== 404) throw error;
      file = await drive.findFileByName(CONFIG_FILE_NAME, folder);
    }
    this.guard();
    if (!file) { if (cache) await db.kv.delete('remote-config'); return null; }
    if (file.name !== CONFIG_FILE_NAME) throw new Error('Synchronization configuration identity changed');
    if (file.version && cache?.file.id === file.id && cache.file.version === file.version) return cache;
    const content = await drive.readFile(file.id); this.guard();
    const result = { value: parseConfig(content.text), file: { ...file, etag: content.etag } };
    await db.kv.put({ key: 'remote-config', value: result }); return result;
  }
  private async write(folder: string, name: string, text: string, previous?: DriveFile): Promise<DriveFile> {
    this.guard();
    const id = previous?.id ?? await this.allocated(name);
    if (previous && !previous.etag) {
      const head = await drive.fileMetadata(id); this.guard();
      if (previous.version && head.version !== previous.version) throw new OptimisticLockError();
      // This preflight is only a fallback under the no-concurrent-writers assumption.
    }
    try {
      const result = await drive.writeDocument(name, text, folder, id, previous); this.guard(); return result;
    } catch (error) {
      if (error instanceof drive.DriveError && error.status === 412) throw new OptimisticLockError();
      throw error;
    }
  }
  async writeConfig(folder: string, value: SyncConfig, previous?: DriveFile): Promise<DriveFile> {
    const file = await this.write(folder, CONFIG_FILE_NAME, JSON.stringify(value), previous);
    await db.kv.put({ key: 'remote-config', value: { file, value } }); return file;
  }
  async listNotes(folder: string): Promise<DriveFile[]> {
    this.listing ??= await drive.listChildren(folder); this.guard();
    const files = this.listing;
    const found = new Set<string>();
    const notes = files.filter(file => /^tonote\.note\..+\.json$/.test(file.name));
    for (const file of notes) {
      if (found.has(file.name)) throw new Error(`Duplicate Drive file: ${file.name}`);
      found.add(file.name);
    }
    return notes;
  }
  async readNote(folder: string, id: string, known?: DriveFile): Promise<RemoteDocument<NoteDocument> | null> {
    this.guard();
    const record = await db.syncRecords.get(id);
    const file = known ?? (record?.remote ? await drive.fileMetadata(record.remote.id) : await drive.findFileByName(noteFileName(id), folder)); this.guard();
    if (!file) return null;
    if (file.name !== noteFileName(id)) throw new Error('Note file identity changed');
    if (file.version && record?.remote?.id === file.id && record.remote.version === file.version && record.accepted && !record.needsPull) return { value: record.accepted, file: { ...file, etag: record.remote.etag } };
    const content = await drive.readFile(file.id); this.guard();
    return { value: parseNote(content.text, id), file: { ...file, etag: content.etag } };
  }
  async writeNote(folder: string, value: NoteDocument, previous?: DriveFile): Promise<DriveFile> {
    const file = await this.write(folder, noteFileName(value.id), serializeNote(value), previous);
    if (this.listing) this.listing = [...this.listing.filter(item => item.id !== file.id), file];
    return file;
  }
  private rememberFile(file: DriveFile, removed = false) {
    if (this.listing) this.listing = [...this.listing.filter(item => item.id !== file.id), ...(removed ? [] : [file])];
  }
  private async attachment(folder: string, noteId: string, id: string, driveFileId?: string): Promise<DriveFile | null> {
    const names = [attachmentFileName(noteId, id), id];
    const matches: DriveFile[] = [];
    for (const name of names) {
      const files = this.listing ? this.listing.filter(file => file.name === name) : [await drive.findFileByName(name, folder)].filter((file): file is DriveFile => !!file);
      this.guard();
      for (const file of files) if (!matches.some(other => other.id === file.id)) matches.push(file);
    }
    if (matches.length > 1) throw new Error('Ambiguous attachment files');
    if (matches[0]) return matches[0];
    if (driveFileId) {
      try {
        const file = await drive.fileMetadata(driveFileId); this.guard();
        if (!names.includes(file.name)) throw new Error('Attachment ID conflict');
        return file;
      } catch (error) { if (!(error instanceof drive.DriveError) || error.status !== 404) throw error; }
    }
    return null;
  }
  async uploadPendingAttachments(folder: string, note: Note): Promise<void> {
    for (const attachment of note.attachments) {
      this.guard();
      const stored = await attachmentsRepo.get(attachment.id);
      // Existing JSON references never trigger checks or migration on a save.
      if (!stored?.pending) continue;
      const name = attachmentFileName(note.id, attachment.id);
      let file = await this.attachment(folder, note.id, attachment.id, stored.uploadedId ?? attachment.driveFileId);
      if (!file) {
        // A collected upload needs a fresh Drive ID. Keep the old confirmation
        // until its replacement allocation is durable, including across retries.
        if (stored.uploadedId && (await db.kv.get(`sync-create:${name}`))?.value === stored.uploadedId) {
          await db.kv.delete(`sync-create:${name}`);
        }
        const id = await this.allocated(name);
        try { file = await drive.fileMetadata(id); this.guard(); if (file.name !== name) throw new Error('Attachment ID conflict'); }
        catch (error) {
          if (!(error instanceof drive.DriveError) || error.status !== 404) throw error;
          try {
            file = await drive.uploadNamedBlob(id, name, stored.blob, folder);
          } catch (uploadError) {
            if (!(uploadError instanceof drive.DriveError) || uploadError.status !== 409) throw uploadError;
            // A lost upload response can leave either a live file or a spent ID.
            try {
              file = await drive.fileMetadata(id); this.guard();
              if (file.name !== name) throw new Error('Attachment ID conflict');
            } catch (lookupError) {
              if (!(lookupError instanceof drive.DriveError) || lookupError.status !== 404) throw lookupError;
              await db.kv.delete(`sync-create:${name}`);
              throw uploadError; // Keep bytes. The next attempt allocates a fresh ID.
            }
          }
        }
      }
      // Only full maintenance has enough information to rename shared legacy files.
      this.guard(); this.rememberFile(file);
      await db.kv.update(`attachment:${attachment.id}`, { value: { ...stored, uploadedId: file.id } });
    }
  }
  private async locallyReferenced(id: string): Promise<boolean> {
    const pending = await attachmentsRepo.get(id); this.guard();
    if (pending?.pending) return true;
    const notes = await db.notes.toArray(); this.guard();
    return notes.some(note => note.attachments.some(a => a.id === id));
  }
  private async backupReferences(file: DriveFile): Promise<Map<string, string>> {
    const revisions = await drive.backupRevisionIds(file.id); this.guard();
    const version = JSON.stringify([file.id, file.version, revisions]);
    const key = 'backup-attachment-owners';
    const cache = (await db.kv.get(key))?.value as { version: string; owners: [string, string][] } | undefined;
    if (file.version && cache?.version === version) return new Map(cache.owners);
    const owners = await drive.backupAttachmentOwners(file.id, revisions); this.guard();
    await db.kv.put({ key, value: { version, owners: [...owners] } });
    return owners;
  }
  async maintainAttachments(_folder: string, published: NoteDocument[], tasks: CleanupTask[]): Promise<string[]> {
    this.guard();
    if (!this.listing) throw new Error('Attachment maintenance requires a complete Drive catalogue');
    const documents = new Map(published.map(doc => [doc.id, doc]));
    const noteFiles = this.listing.filter(file => /^tonote\.note\..+\.json$/.test(file.name));
    if (documents.size !== noteFiles.length || noteFiles.some(file => !documents.has(file.name.slice('tonote.note.'.length, -'.json'.length)))) throw new Error('Incomplete published note snapshot');
    const owners = new Map<string, string>();
    for (const doc of documents.values()) if (!isDeleted(doc)) for (const attachment of doc.attachments) {
      owners.set(attachment.id, doc.id);
    }
    const taskIds = new Set(tasks.map(task => task.attachmentId));
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    const owned = /^tonote\.attach\.([a-z0-9_-]{1,128})\.([a-z0-9_-]{1,128})$/i;
    const files = this.listing.flatMap(file => {
      const match = owned.exec(file.name);
      if (match && ((uuid.test(match[1]) && uuid.test(match[2])) || documents.has(match[1]) || owners.has(match[2]) || taskIds.has(match[2]))) return [{ file, attachmentId: match[2], owner: match[1] as string | undefined }];
      return uuid.test(file.name) || owners.has(file.name) || taskIds.has(file.name) ? [{ file, attachmentId: file.name, owner: undefined }] : [];
    });
    const byName = new Map<string, DriveFile>();
    const byAttachment = new Map<string, string>();
    for (const item of files) {
      if (byName.has(item.file.name) || (byAttachment.has(item.attachmentId) && byAttachment.get(item.attachmentId) !== item.file.id)) throw new Error('Ambiguous attachment files');
      byName.set(item.file.name, item.file);
      byAttachment.set(item.attachmentId, item.file.id);
    }
    const candidates = files.filter(item => !owners.has(item.attachmentId));
    const backupFiles = this.listing.filter(file => file.name === LEGACY_BACKUP_FILE);
    if (backupFiles.length > 1) throw new Error('Ambiguous backup files');
    const backupOwners = candidates.length && backupFiles[0] ? await this.backupReferences(backupFiles[0]) : new Map<string, string>();
    this.guard();
    let mutations = 0;
    const remaining = new Set(files.map(item => item.attachmentId));
    for (const item of candidates) {
      if (mutations >= ATTACHMENT_MAINTENANCE_BATCH_SIZE) break;
      if (backupOwners.has(item.attachmentId) || await this.locallyReferenced(item.attachmentId)) continue;
      this.guard();
      try { await drive.deleteFile(item.file.id); }
      catch (error) { if (!(error instanceof drive.DriveError) || error.status !== 404) throw error; }
      this.guard(); mutations++; this.rememberFile(item.file, true); remaining.delete(item.attachmentId);
    }
    for (const item of files) {
      if (mutations >= ATTACHMENT_MAINTENANCE_BATCH_SIZE) break;
      const owner = owners.get(item.attachmentId) ?? backupOwners.get(item.attachmentId);
      if (item.owner || !owner) continue;
      await drive.renameFile(item.file.id, attachmentFileName(owner, item.attachmentId)); this.guard();
      mutations++; this.rememberFile({ ...item.file, name: attachmentFileName(owner, item.attachmentId) });
    }
    const collected: string[] = [];
    for (const id of taskIds) if (!remaining.has(id) && !owners.has(id) && !await this.locallyReferenced(id)) collected.push(id);
    return collected;
  }
  async readLegacy(folder: string) {
    const file = await drive.findFileByName(LEGACY_BACKUP_FILE, folder); this.guard();
    if (!file) return null;
    const cache = (await db.kv.get('remote-backup'))?.value as { file: DriveFile; value: import('./legacyTypes').LegacyBackupContent } | undefined;
    if (file.version && cache?.file.id === file.id && cache.file.version === file.version) return cache.value;
    const content = await drive.downloadText(file.id); this.guard();
    const value = parseLegacyBackup(content);
    await db.kv.put({ key: 'remote-backup', value: { file, value } }); return value;
  }
}
/** New adapter per serialized pass: no account or listing cache crosses sessions. */
export const driveGateway = { create: () => new DriveGatewayAdapter() };

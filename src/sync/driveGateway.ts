import { db } from '../db/database';
import { attachmentsRepo } from '../db/attachmentsRepo';
import type { SyncGateway } from './gatewayTypes';
import { OptimisticLockError } from './gatewayTypes';
import type { Note } from '../domain/types';
import type { NoteDocument, SyncConfig, RemoteDocument } from './types';
import { isDeleted } from './types';
import type { DriveFile } from '../gateway/driveTypes';
import * as drive from '../gateway/drive';
import { CONFIG_FILE_NAME, DRIVE_FOLDER_NAME, noteFileName, attachmentFileName, LEGACY_BACKUP_FILE } from './constants';
import { parseNote, parseConfig, serializeNote } from './serialize';
import { parseLegacyBackup } from './migrate';
import { sessionActive, sessionToken } from './session';

export class DriveGatewayAdapter implements SyncGateway {
  private folder?: string;
  private listing?: DriveFile[];
  private generation = sessionToken();
  private protectedAttachments?: Set<string>;
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
  private async attachment(folder: string, noteId: string, attachmentId: string, driveFileId?: string): Promise<DriveFile | null> {
    const names = [attachmentFileName(noteId, attachmentId), attachmentId];
    const matches: DriveFile[] = [];
    for (const name of names) {
      const file = await drive.findFileByName(name, folder); this.guard();
      if (file && !matches.some(other => other.id === file.id)) matches.push(file);
    }
    if (driveFileId && !matches.some(file => file.id === driveFileId)) {
      try {
        const file = await drive.fileMetadata(driveFileId); this.guard();
        matches.push(file);
      } catch (error) {
        // An obsolete ID can be recovered by name; permission failures remain errors.
        if (!(error instanceof drive.DriveError) || error.status !== 404) throw error;
      }
    }
    if (matches.length > 1) throw new Error('Ambiguous attachment files');
    return matches[0] ?? null;
  }
  async uploadPendingAttachments(folder: string, note: Note): Promise<void> {
    for (const attachment of note.attachments) {
      this.guard();
      const stored = await attachmentsRepo.get(attachment.id);
      // JSON metadata is authoritative. Existing references need no existence check.
      if (!stored?.pending) continue;
      const name = attachmentFileName(note.id, attachment.id);
      let file = await this.attachment(folder, note.id, attachment.id, attachment.driveFileId);
      if (!file) {
        const id = await this.allocated(name);
        // An allocated ID from a timed-out upload may already exist.
        try { file = await drive.fileMetadata(id); if (file.name !== name) throw new Error('Attachment ID conflict'); }
        catch (error) {
          if (!(error instanceof drive.DriveError) || error.status !== 404) throw error;
          file = await drive.uploadNamedBlob(id, name, stored.blob, folder);
        }
      } else if (file.name !== name) { await drive.renameFile(file.id, name); }
      this.guard();
      await attachmentsRepo.delete(attachment.id);
    }
  }
  async ownedAttachmentIds(folder: string, noteId: string): Promise<string[]> {
    await this.listNotes(folder);
    const prefix = `tonote.attach.${noteId}.`;
    return this.listing!.filter(file => file.name.startsWith(prefix)).map(file => file.name.slice(prefix.length)).filter(id => /^[a-z0-9_-]{1,128}$/i.test(id));
  }
  async cleanupAttachment(folder: string, noteId: string, attachmentId: string): Promise<boolean> {
    const owner = await this.readNote(folder, noteId);
    if (!owner) return false;
    if (!isDeleted(owner.value) && owner.value.attachments.some(a => a.id === attachmentId)) return true;
    this.protectedAttachments ??= await drive.backupAttachmentIds(folder); this.guard();
    if (this.protectedAttachments.has(attachmentId)) return false;
    const file = await this.attachment(folder, noteId, attachmentId);
    if (file) {
      // Legacy unowned names require proving that another note does not refer to them.
      if (!file.name.startsWith(`tonote.attach.${noteId}.`)) {
        for (const other of await this.listNotes(folder)) {
          const id = other.name.slice('tonote.note.'.length, -'.json'.length);
          const document = await this.readNote(folder, id, other);
          if (!document || (!isDeleted(document.value) && document.value.attachments.some(a => a.id === attachmentId))) return false;
        }
      }
      await drive.deleteFile(file.id); this.guard();
    }
    await db.kv.delete(`attachment:${attachmentId}`);
    return true;
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

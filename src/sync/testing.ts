import type { SyncGateway } from './gatewayTypes';
import type { DriveFile } from '../gateway/driveTypes';
import type { Note } from '../domain/types';
import type { NoteDocument, RemoteDocument, SyncConfig } from './types';
import type { LegacyBackupContent } from './legacyTypes';
import { noteFileName } from './constants';
import { DEFAULT_CATEGORY } from '../domain/color';
import { OptimisticLockError } from './gatewayTypes';
import { isDeleted } from './types';

export function note(id: string, options: Partial<Note> = {}): Note {
  return { id, edited: 100, created: 1, title: id, content: 'text', checkings: '', state: 0, color: DEFAULT_CATEGORY, pinned: false, priority: 0, notify: false, showInWidget: false, attachments: [], events: [], ...options };
}
export class FakeDrive implements SyncGateway {
  documents = new Map<string, RemoteDocument<NoteDocument>>();
  config: RemoteDocument<SyncConfig> | null = { value: { schemaVersion: 3, initialized: true, trashRetentionDays: 15, colors: [DEFAULT_CATEGORY] }, file: { id: 'config', name: 'tonote.sync.json', version: '1' } };
  legacy: LegacyBackupContent | null = null;
  reads = 0; lists = 0; writes = 0;
  afterRead?: (id: string) => Promise<void>;
  afterWrite?: (doc: NoteDocument) => Promise<void>;
  attachmentIds = new Set<string>();
  pendingAttachmentIds = new Set<string>();
  failedAttachmentIds = new Set<string>();
  attachmentUploads = 0;
  protectedIds = new Set<string>();
  cleaned: string[] = [];
  seed(doc: NoteDocument) {
    const old = this.documents.get(doc.id);
    const file = { id: doc.id, name: noteFileName(doc.id), version: String(Number(old?.file.version ?? 0) + 1) };
    this.documents.set(doc.id, structuredClone({ value: doc, file }));
  }
  async findFolder(): Promise<string | null> { return 'folder'; }
  async ensureFolder() { return 'folder'; }
  async readConfig() { return structuredClone(this.config); }
  async writeConfig(_folder: string, value: SyncConfig, previous?: DriveFile) {
    if (previous && this.config?.file.version !== previous.version) throw new OptimisticLockError();
    const file = { id: 'config', name: 'tonote.sync.json', version: String(Number(this.config?.file.version ?? 0) + 1) };
    this.config = structuredClone({ file, value }); return file;
  }
  async listNotes() { this.lists++; return [...this.documents.values()].map(d => structuredClone(d.file)); }
  async readNote(_folder: string, id: string) { this.reads++; const result = structuredClone(this.documents.get(id) ?? null); await this.afterRead?.(id); return result; }
  async writeNote(_folder: string, doc: NoteDocument, previous?: DriveFile) {
    if (previous && this.documents.get(doc.id)?.file.version !== previous.version) throw new OptimisticLockError();
    this.writes++; this.seed(doc); await this.afterWrite?.(doc); return this.documents.get(doc.id)!.file;
  }
  async uploadPendingAttachments(_folder: string, value: Note) {
    for (const item of value.attachments) {
      if (!this.pendingAttachmentIds.has(item.id)) continue;
      if (this.failedAttachmentIds.has(item.id)) throw new Error('Attachment upload failed');
      this.attachmentIds.add(item.id); this.pendingAttachmentIds.delete(item.id); this.attachmentUploads++;
    }
  }
  async ownedAttachmentIds() { return []; }
  async cleanupAttachment(_folder: string, id: string, attachment: string) {
    const doc = this.documents.get(id)?.value;
    if (!doc || (!isDeleted(doc) && doc.attachments.some(a => a.id === attachment)) || this.protectedIds.has(attachment)) return false;
    this.cleaned.push(attachment); return true;
  }
  async readLegacy() { return this.legacy; }
}

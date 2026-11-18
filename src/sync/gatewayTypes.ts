import type { Note } from '../domain/types';
import type { DriveFile } from '../gateway/driveTypes';
import type { LegacyBackupContent } from './legacyTypes';
import type { NoteDocument, SyncConfig, RemoteDocument, CleanupTask } from './types';

export interface SyncGateway {
  findFolder(): Promise<string | null>;
  ensureFolder(): Promise<string>;
  readConfig(folder: string): Promise<RemoteDocument<SyncConfig> | null>;
  writeConfig(folder: string, value: SyncConfig, previous?: DriveFile): Promise<DriveFile>;
  listNotes(folder: string): Promise<DriveFile[]>;
  readNote(folder: string, id: string, file?: DriveFile): Promise<RemoteDocument<NoteDocument> | null>;
  writeNote(folder: string, value: NoteDocument, previous?: DriveFile): Promise<DriveFile>;
  uploadPendingAttachments(folder: string, note: Note): Promise<void>;
  maintainAttachments(folder: string, published: NoteDocument[], tasks: CleanupTask[]): Promise<string[]>;
  readLegacy(folder: string): Promise<LegacyBackupContent | null>;
}
export class OptimisticLockError extends Error {
  constructor(message = 'The Drive file changed; refresh and retry') { super(message); this.name = 'OptimisticLockError'; }
}
export class PasswordSyncError extends Error {
  remoteChecker: string; remoteSalt: string;
  constructor(remoteChecker: string, remoteSalt: string, message = 'Open the app to reconcile encryption passwords') { super(message); this.name = 'PasswordSyncError'; this.remoteChecker = remoteChecker; this.remoteSalt = remoteSalt; }
}

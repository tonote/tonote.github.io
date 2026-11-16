import type { Color, Note } from '../domain/types';
import type { DriveFile } from '../gateway/driveTypes';

export interface DeletedNote { schemaVersion: 3; id: string; deleted: true; edited: number; trashedAt: number; purgeAfter: number }
export type NoteDocument = Note | DeletedNote;
export interface DeletedColor { id: string; edited: number; deleted: true }
export type ColorDocument = Color | DeletedColor;
export interface KeyParameters { checker: string; salt: string }
export interface KeyRotation { id: string; from: KeyParameters; to: KeyParameters }
export interface SyncConfig {
  schemaVersion: 3;
  trashRetentionDays: number;
  colors: ColorDocument[];
  checker?: string;
  salt?: string;
  keyRotation?: KeyRotation;
  initialized: boolean;
}
export interface RemoteDocument<T> { value: T; file: DriveFile }
export interface SyncRecord {
  id: string;
  tombstone?: DeletedNote;
  remote?: DriveFile;
  accepted?: NoteDocument;
  needsPull?: boolean;
  cleanupVersion?: string;
}
export interface CleanupTask { id: string; noteId: string; attachmentId: string }
export const isDeleted = (doc: NoteDocument): doc is DeletedNote => 'deleted' in doc && doc.deleted === true;
export const isDeletedColor = (doc: ColorDocument): doc is DeletedColor => 'deleted' in doc && doc.deleted === true;

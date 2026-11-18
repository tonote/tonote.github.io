export type NoteState = 0 | 1 | 2 | 3;          // NONE | ARCHIVED | REMOVED | PARENT_REMOVED
export type NoteKind = 'plain' | 'rich' | 'list' | 'folder';
export const NOTE_STATE = { NONE: 0, ARCHIVED: 1, REMOVED: 2, PARENT_REMOVED: 3 } as const;

export interface Color {
  id: string;
  edited: number;
  value: number;        // signed 32-bit Int, ARGB — high-alpha colors are negative
  theme: string;
  showAsFilter: boolean;
  priority: number;
}

export interface Note {
  id: string;
  edited: number;
  created: number;
  title: string;
  content: string;
  notify: boolean;
  showInWidget: boolean;
  color: Color;
  checkings: string;     // "" | "h…" | "f" | digits
  events: Event[];
  pinned: boolean;
  state: NoteState;
  attachments: Attachment[];
  priority: number;
  parentId?: string;     // OMITTED when null (Gson serializeNulls=false)
  encryptionSalt?: string;
  iv?: string;           // Base64 AES IV — OMITTED when not encrypted
}

// Preserve unknown fields from imported Android backups.
export interface Event {
  id: string;
  edited?: number;
  noteId?: string;
  when?: number; // Android Calendar JSON: epoch milliseconds
  type?: number; // 0 = date/time, 1 = Android reminder, 2 = date only
  repeat?: number; // 0 none, 1 daily, 2 weekly, 3 monthly, 4 yearly; weekday bitmask otherwise
  [k: string]: unknown;
}
export interface Attachment {
  id: string;
  edited?: number;
  noteId?: string;
  name?: string;
  type?: number; // Android: image = 0, file = 1, audio = 2
  driveFileId?: string;
  [k: string]: unknown;
}

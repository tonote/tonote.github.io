import type { Note, Color } from '../domain/types';

// Legacy all-in-one backup file (Android's notes_backup.json).
// Android Gson writes `iv`/`salt`/`checker` as signed byte arrays; parseLegacyBackup
// normalizes them to base64. `edited`/`updated`/`created` are epoch-ms numbers (CalendarJsonAdapter).
// Note: legacy notes carry full Color objects inline (denormalized) — same as the new per-note format, so notes pass through unchanged.
export interface LegacyBackupContent {
  version: string;
  id: string;
  updated: number;
  checker?: string;   // base64 (omitted when no encryption)
  salt?: string;      // base64
  notes: Note[];
  colors: Color[];
}

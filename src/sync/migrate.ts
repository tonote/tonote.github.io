import type { LegacyBackupContent } from './legacyTypes';
import { normalizeEncodedBytes } from '../crypto/aes';
import { parseNote } from './serialize';
import { isDeleted } from './types';

export function parseLegacyBackup(json: string): LegacyBackupContent {
  const content = JSON.parse(json) as LegacyBackupContent;
  if (!Array.isArray(content.notes) || !Array.isArray(content.colors)) throw new Error('Invalid legacy backup');
  if (content.checker) content.checker = normalizeEncodedBytes(content.checker);
  if (content.salt) content.salt = normalizeEncodedBytes(content.salt);
  content.notes = content.notes.map(raw => {
    const note = parseNote(JSON.stringify(raw), raw.id, true);
    if (isDeleted(note)) throw new Error('Unexpected marker in backup');
    note.color = raw.color;
    if (note.iv) { if (!content.salt) throw new Error('Encrypted backup has no salt'); note.encryptionSalt = content.salt; }
    return note;
  });
  return content;
}

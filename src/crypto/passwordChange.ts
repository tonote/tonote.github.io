import type { Note } from '../domain/types';
import { deriveKeyAndChecker } from './kdf';
import { randomIv, bytesToBase64 } from './aes';
import { encryptNote, decryptNote } from './noteCrypto';

export interface PasswordChangeResult {
  notes: Note[];
  key: Uint8Array;
  checker: string;
  salt: string;
}

export async function changePassword(
  notes: Note[],
  oldKey: Uint8Array,
  newPassword: string,
  newSalt: Uint8Array,
): Promise<PasswordChangeResult> {
  const { key, checker } = await deriveKeyAndChecker(newPassword, newSalt);
  const out: Note[] = [];

  for (const note of notes) {
    if (note.iv === undefined) {
      out.push(note);
      continue;
    }
    const plain = await decryptNote(note, oldKey);
    const reIv = bytesToBase64(randomIv());
    const withNewIv = { ...plain, iv: reIv };
    const reEncrypted = await encryptNote(withNewIv, key);
    out.push(reEncrypted);
  }

  return { notes: out, key, checker: bytesToBase64(checker), salt: bytesToBase64(newSalt) };
}

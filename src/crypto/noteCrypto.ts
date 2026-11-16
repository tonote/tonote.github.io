import type { Note } from '../domain/types';
import { encryptB64, decryptB64, bytesToBase64, base64ToBytes, randomIv } from './aes';

// Mirrors Key.kt: isList = !(isSimple || isRich) = checkings !== '' && checkings[0] !== 'h'
// TRUE for both checklists and folders — see folder gotcha.
function shouldEncryptCheckings(checkings: string): boolean {
  return checkings !== '' && checkings[0] !== 'h';
}

// Encrypts a note that ALREADY has iv set (caller generated it via withFreshIv).
export async function encryptNote(note: Note, key: Uint8Array): Promise<Note> {
  if (note.iv === undefined) return note;
  const iv = base64ToBytes(note.iv);
  const out: Note = { ...note };
  out.title = await encryptB64(key, iv, note.title);
  out.content = await encryptB64(key, iv, note.content);
  if (shouldEncryptCheckings(note.checkings)) {
    out.checkings = await encryptB64(key, iv, note.checkings);
  }
  return out;
}

export async function decryptNote(note: Note, key: Uint8Array): Promise<Note> {
  if (note.iv === undefined) return note;
  const iv = base64ToBytes(note.iv);
  const out: Note = { ...note };
  out.title = await decryptB64(key, iv, note.title);
  out.content = await decryptB64(key, iv, note.content);
  // Robust partition of on-disk checkings for an encrypted note:
  //   - "" (plain) and "h" (rich marker) → plaintext, length ≤ 1, skip
  //   - list/folder checkings → was encrypted → ciphertext is base64 of ≥1 AES block (≥24 chars) → decrypt
  // This avoids Android's latent bug where ciphertext starting with 'h' (~1.56%) was left undecrypted.
  // Wire format is identical to Android; the web just reads more robustly.
  if (note.checkings.length > 1) {
    out.checkings = await decryptB64(key, iv, note.checkings);
  }
  return out;
}

export function withFreshIv(note: Note): Note & { iv: string } {
  return { ...note, iv: bytesToBase64(randomIv()) };
}

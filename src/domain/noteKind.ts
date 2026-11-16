import type { Note, NoteKind } from './types';

// Compute kind AFTER decrypting `checkings` for encrypted notes (decrypt-then-classify).
// For an encrypted note, `n.checkings` is ciphertext until decrypted; classifying on
// ciphertext would misidentify every encrypted list/folder as 'list'.
export function noteKind(n: Note): NoteKind {
  if (n.checkings === '') return 'plain';
  if (n.checkings[0] === 'h') return 'rich';
  if (n.checkings === 'f') return 'folder';
  return 'list';
}

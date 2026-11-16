import { useState, useEffect, useMemo } from 'react';
import { useNotes, useNote as useRawNote, type UseNotesOpts } from './useNotes.js';
import { cryptoStore } from '../state/cryptoStore.js';
import { decryptNote } from '../crypto/noteCrypto.js';
import type { Note } from '../domain/types.js';

async function decryptIfPossible(note: Note, key: Uint8Array | null, salt?: string | null): Promise<Note> {
  if (note.iv === undefined || !key || (note.encryptionSalt && note.encryptionSalt !== salt)) return note;
  try {
    return await decryptNote(note, key);
  } catch {
    return note; // corrupt → show as-is, never throw
  }
}

async function decryptNotes(notes: Note[], key: Uint8Array | null, salt?: string | null): Promise<Note[]> {
  if (!key) return notes;
  return Promise.all(notes.map((n) => decryptIfPossible(n, key, salt)));
}

/**
 * useDecryptedNote wraps useNote with decryption-on-display.
 * When cryptoStore is unlocked and the note has an iv, it decrypts
 * title/content/checkings so the UI shows plaintext.
 * When locked, the raw ciphertext flows through (NoteCard shows "🔒 Locked").
 */
export function useDecryptedNote(
  id: string | null,
): { note: Note | null; loading: boolean } {
  const { note: rawNote, loading: rawLoading } = useRawNote(id ?? undefined);
  const unlocked = cryptoStore((s) => s.unlocked);
  const key = cryptoStore((s) => s.key);
  const salt = cryptoStore((s) => s.salt);

  // Stable serialization of unlock state for effect dependency
  const unlockKey = unlocked && key ? key : null;

  const [result, setResult] = useState<{ source: Note | undefined; key: Uint8Array | null; value: Note | null }>();

  // resolved flag: rawLoading=false means liveQuery has resolved (note may be undefined = not found)
  const resolved = !rawLoading;

  useEffect(() => {
    let cancelled = false;

    if (!resolved) {
      // still loading
      return;
    }

    if (rawNote === undefined) {
      // resolved, but note not found
      if (!cancelled) setResult({ source: rawNote, key: unlockKey, value: null });
      return;
    }

    const run = async () => {
      const result = await decryptIfPossible(rawNote!, unlockKey, salt);
      if (!cancelled) {
        setResult({ source: rawNote, key: unlockKey, value: result });
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [rawNote, unlockKey, resolved, salt]);

  // During initial load, show loading
  if (!resolved || !result || result.source !== rawNote || result.key !== unlockKey) {
    return { note: null, loading: true };
  }

  return { note: result.value, loading: false };
}

/**
 * useDecryptedNotes wraps useNotes with decryption-on-display.
 * Decrypts all notes when unlocked, passes raw through when locked.
 */
export function useDecryptedNotes(
  opts: UseNotesOpts = {},
): { notes: Note[]; loading: boolean } {
  const { notes: rawNotes, loading: rawLoading } = useNotes(opts);
  const unlocked = cryptoStore((s) => s.unlocked);
  const key = cryptoStore((s) => s.key);
  const salt = cryptoStore((s) => s.salt);

  const unlockKey = unlocked && key ? key : null;

  // Ciphertext and salt can change without changing the user edited timestamp.
  const rawNotesKey = useMemo(() => JSON.stringify(rawNotes), [rawNotes]);

  const [decryptedNotes, setDecryptedNotes] = useState<Note[]>([]);
  const [decrypting, setDecrypting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (rawLoading || rawNotes.length === 0) {
      if (!cancelled) setDecryptedNotes(rawNotes);
      return;
    }

    setDecrypting(true);
    const run = async () => {
      const result = await decryptNotes(rawNotes, unlockKey, salt);
      if (!cancelled) {
        setDecryptedNotes(result);
        setDecrypting(false);
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
  }, [rawNotesKey, rawLoading, unlockKey, salt]); // eslint-disable-line react-hooks/exhaustive-deps

  return { notes: decryptedNotes, loading: rawLoading || decrypting };
}

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { db } from './database.js';
import { notesRepo } from './notesRepo.js';
import { cryptoStore } from '../state/cryptoStore.js';
import { encryptNote, withFreshIv } from '../crypto/noteCrypto.js';
import type { Note } from '../domain/types.js';

beforeEach(async () => {
  await db.delete();
  await db.open();
  // Ensure cryptoStore is locked before each test
  cryptoStore.getState().lock();
});

afterEach(() => {
  cryptoStore.getState().lock();
});

const baseNote = (id: string, overrides?: Partial<Note>): Note => ({
  id,
  edited: Date.now(),
  created: Date.now(),
  title: `Note ${id}`,
  content: 'Hello world',
  notify: false,
  showInWidget: false,
  color: { id: 'c1', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
  checkings: '',
  events: [],
  pinned: false,
  state: 0,
  attachments: [],
  priority: 0,
  ...overrides,
});

describe('useDecryptedNote', () => {
  it('returns raw note when not encrypted (no iv)', async () => {
    const note = baseNote('n1', { title: 'Plain Note' });
    await notesRepo.put(note);

    const { useDecryptedNote } = await import('./useDecrypted.js');
    const { result } = renderHook(() => useDecryptedNote('n1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.note).toBeDefined();
    expect(result.current.note!.title).toBe('Plain Note');
  });

  it('returns ciphertext title when encrypted and locked', async () => {
    const KEY = new Uint8Array(16);
    // Set up encryption in store
    await cryptoStore.getState().unlock('testpass');
    cryptoStore.getState().lock();

    const note = baseNote('n1', { title: 'Secret', content: 'Hidden' });
    const withIv = withFreshIv(note);
    const encrypted = await encryptNote(withIv, KEY);
    await notesRepo.put(encrypted);

    // Ensure locked
    expect(cryptoStore.getState().unlocked).toBe(false);

    const { useDecryptedNote } = await import('./useDecrypted.js');
    const { result } = renderHook(() => useDecryptedNote('n1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should show ciphertext (not plaintext)
    expect(result.current.note).toBeDefined();
    expect(result.current.note!.title).not.toBe('Secret');
    expect(result.current.note!.iv).toBeDefined();
  });

  it('decrypts and returns plaintext title when unlocked', async () => {
    // Use a deterministic password so we can decrypt consistently
    const KEY = new Uint8Array(16);
    // We need to unlock the cryptoStore with a key that matches what encrypted the note.
    // Easier: use cryptoStore.unlock('testpass') to set a key, then encrypt with that key.
    const unlocked = await cryptoStore.getState().unlock('testpass');
    expect(unlocked).toBe(true);
    const key = cryptoStore.getState().key!;
    expect(key).not.toBeNull();

    const note = baseNote('n1', { title: 'Secret', content: 'Hidden text' });
    const withIv = withFreshIv(note);
    const encrypted = await encryptNote(withIv, key);
    await notesRepo.put(encrypted);

    // Now the note is encrypted and we're still unlocked
    expect(cryptoStore.getState().unlocked).toBe(true);

    const { useDecryptedNote } = await import('./useDecrypted.js');
    const { result } = renderHook(() => useDecryptedNote('n1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.note).toBeDefined();
    expect(result.current.note!.title).toBe('Secret');
    expect(result.current.note!.content).toBe('Hidden text');
  });

  it('re-renders with plaintext after unlocking', async () => {
    // Create a note encrypted with a known key
    const unlocked = await cryptoStore.getState().unlock('testpass');
    expect(unlocked).toBe(true);
    const key = cryptoStore.getState().key!;

    const note = baseNote('n1', { title: 'My Secret', content: 'Body text' });
    const withIv = withFreshIv(note);
    const encrypted = await encryptNote(withIv, key);
    await notesRepo.put(encrypted);

    // Lock first
    cryptoStore.getState().lock();
    expect(cryptoStore.getState().unlocked).toBe(false);

    const { useDecryptedNote } = await import('./useDecrypted.js');
    const { result } = renderHook(() => useDecryptedNote('n1'));

    // Wait for initial load — should be ciphertext
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const ciphertextTitle = result.current.note!.title;
    expect(ciphertextTitle).not.toBe('My Secret');

    // Now unlock
    await act(async () => {
      const ok = await cryptoStore.getState().unlock('testpass');
      expect(ok).toBe(true);
    });

    // Wait for decryption
    await waitFor(() => {
      expect(result.current.note!.title).toBe('My Secret');
    });
    expect(result.current.note!.content).toBe('Body text');
  });

  it('returns null for non-existent id', async () => {
    const { useDecryptedNote } = await import('./useDecrypted.js');
    const { result } = renderHook(() => useDecryptedNote('nonexistent'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.note).toBeNull();
  });
});

describe('useDecryptedNotes', () => {
  it('returns all notes decrypted when unlocked', async () => {
    const unlocked = await cryptoStore.getState().unlock('testpass');
    expect(unlocked).toBe(true);
    const key = cryptoStore.getState().key!;

    const plain = baseNote('n1', { title: 'Plain' });
    const secret = baseNote('n2', { title: 'Secret' });
    const withIv = withFreshIv(secret);
    const encrypted = await encryptNote(withIv, key);

    await notesRepo.put(plain);
    await notesRepo.put(encrypted);

    const { useDecryptedNotes } = await import('./useDecrypted.js');
    const { result } = renderHook(() => useDecryptedNotes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.notes).toHaveLength(2);

    const plainNote = result.current.notes.find(n => n.id === 'n1');
    const secretNote = result.current.notes.find(n => n.id === 'n2');

    expect(plainNote!.title).toBe('Plain');
    expect(secretNote!.title).toBe('Secret');
  });

  it('returns encrypted notes as ciphertext when locked', async () => {
    const unlocked = await cryptoStore.getState().unlock('testpass');
    expect(unlocked).toBe(true);
    const key = cryptoStore.getState().key!;
    cryptoStore.getState().lock();

    const secret = baseNote('n1', { title: 'Secret' });
    const withIv = withFreshIv(secret);
    const encrypted = await encryptNote(withIv, key);
    await notesRepo.put(encrypted);

    expect(cryptoStore.getState().unlocked).toBe(false);

    const { useDecryptedNotes } = await import('./useDecrypted.js');
    const { result } = renderHook(() => useDecryptedNotes());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].title).not.toBe('Secret');
  });
});

it('refreshes displayed plaintext when ciphertext changes without changing edited', async () => {
  const { useDecryptedNotes } = await import('./useDecrypted');
  const key = new Uint8Array(16).fill(2), salt = 'AgICAgICAgICAgICAgICAg==';
  cryptoStore.getState().setActiveKey(key, 'checker', salt);
  const first = await encryptNote(withFreshIv(baseNote('rekey', { title: 'First', edited: 100, encryptionSalt: salt })), key);
  await notesRepo.put(first);
  const { result } = renderHook(() => useDecryptedNotes());
  await waitFor(() => expect(result.current.notes[0]?.title).toBe('First'));
  const second = await encryptNote(withFreshIv(baseNote('rekey', { title: 'Second', edited: 100, encryptionSalt: salt })), key);
  await act(async () => { await notesRepo.put(second); });
  await waitFor(() => expect(result.current.notes[0]?.title).toBe('Second'));
});

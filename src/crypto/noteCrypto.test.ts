import { describe, it, expect } from 'vitest';
import { encryptNote, decryptNote, withFreshIv } from './noteCrypto';
import { encryptB64, base64ToBytes } from './aes';
import type { Note } from '../domain/types';

const baseNote = (over: Partial<Note>): Note => ({
  id: 'x',
  edited: 0,
  created: 0,
  title: 't',
  content: 'c',
  notify: false,
  showInWidget: false,
  color: { id: 'c', edited: 0, value: 0, theme: '', showAsFilter: false, priority: 0 },
  checkings: '',
  events: [],
  pinned: false,
  state: 0,
  attachments: [],
  priority: 0,
  ...over,
});

const KEY = new Uint8Array(16);

describe('noteCrypto', () => {
  it('encrypts + decrypts a plain note round-trip', async () => {
    const note = baseNote({ title: 'Hi', content: 'Body', iv: 'AAAAAAAAAAAAAAAAAAAAAA==' });
    const enc = await encryptNote(note, KEY);
    expect(enc.iv).toBeTypeOf('string');
    expect(enc.title).not.toBe('Hi');
    const dec = await decryptNote(enc, KEY);
    expect(dec.title).toBe('Hi');
    expect(dec.content).toBe('Body');
  });

  it('encrypts checkings for list notes', async () => {
    const note = baseNote({ checkings: '010', content: 'a\nb\nc', iv: 'AAAAAAAAAAAAAAAAAAAAAA==' });
    const enc = await encryptNote(note, KEY);
    expect(enc.checkings).not.toBe('010');
    expect(await decryptNote(enc, KEY)).toMatchObject({ checkings: '010', content: 'a\nb\nc' });
  });

  it('REGRESSION: encrypts checkings for folder notes too (Android isList includes folders)', async () => {
    const note = baseNote({ checkings: 'f', content: '', iv: 'AAAAAAAAAAAAAAAAAAAAAA==' });
    const enc = await encryptNote(note, KEY);
    expect(enc.checkings).not.toBe('f'); // MUST be ciphertext, else Android throws on read
    expect((await decryptNote(enc, KEY)).checkings).toBe('f');
  });

  it('does NOT encrypt checkings for rich notes (starts with h)', async () => {
    const note = baseNote({ checkings: 'h', content: '<b>x</b>', iv: 'AAAAAAAAAAAAAAAAAAAAAA==' });
    const enc = await encryptNote(note, KEY);
    expect(enc.checkings).toBe('h'); // stays plaintext
    expect((await decryptNote(enc, KEY)).content).toBe('<b>x</b>');
  });

  it('does NOT encrypt checkings for plain notes (empty)', async () => {
    const note = baseNote({ checkings: '', content: 'text', iv: 'AAAAAAAAAAAAAAAAAAAAAA==' });
    const enc = await encryptNote(note, KEY);
    expect(enc.checkings).toBe('');
  });

  it('decryptNote on a never-encrypted note (iv undefined) returns it unchanged', async () => {
    const note = baseNote({ title: 'plain', content: 'x' });
    expect(await decryptNote(note, KEY)).toEqual(note);
  });

  it('encryptNote on a never-encrypted note (iv undefined) returns it unchanged', async () => {
    const note = baseNote({ title: 'plain', content: 'x' });
    expect(await encryptNote(note, KEY)).toEqual(note);
  });

  it('withFreshIv produces a note with a base64 iv', () => {
    const note = baseNote({ title: 't' });
    const withIv = withFreshIv(note);
    expect(withIv.iv).toBeDefined();
    expect(typeof withIv.iv).toBe('string');
    // base64 of 16 bytes is 24 chars
    expect(withIv.iv.length).toBe(24);
  });

  it('REGRESSION: decrypts list checkings even if ciphertext starts with "h" (~1.56% case)', async () => {
    const ivBuf = base64ToBytes('AAAAAAAAAAAAAAAAAAAAAA==');
    // Build a note where title, content, and checkings are all properly encrypted
    const encTitle = await encryptB64(KEY, ivBuf, 'title');
    const encContent = await encryptB64(KEY, ivBuf, 'content');
    const realCt = await encryptB64(KEY, ivBuf, '010');
    // Force checkings ciphertext to start with 'h' (corrupts AES padding, but proves predicate)
    const forcedCheckings = 'h' + realCt.slice(1);
    const note = baseNote({ title: encTitle, content: encContent, iv: 'AAAAAAAAAAAAAAAAAAAAAA==', checkings: forcedCheckings });
    // Old predicate would SKIP decryption (silently return 'h…' as checkings).
    // New predicate MUST attempt decryption — corrupted base64 causes AES error.
    await expect(decryptNote(note, KEY)).rejects.toThrow();
    // Verify normal (non-corrupted) ciphertext round-trips correctly
    const normalNote = baseNote({ title: encTitle, content: encContent, iv: 'AAAAAAAAAAAAAAAAAAAAAA==', checkings: realCt });
    expect((await decryptNote(normalNote, KEY)).checkings).toBe('010');
  });

  it('REGRESSION: decrypts folder checkings even if ciphertext starts with "h"', async () => {
    const ivBuf = base64ToBytes('AAAAAAAAAAAAAAAAAAAAAA==');
    const encTitle = await encryptB64(KEY, ivBuf, 'title');
    const encContent = await encryptB64(KEY, ivBuf, '');
    const realCt = await encryptB64(KEY, ivBuf, 'f');
    const forcedCheckings = 'h' + realCt.slice(1);
    const note = baseNote({ title: encTitle, content: encContent, iv: 'AAAAAAAAAAAAAAAAAAAAAA==', checkings: forcedCheckings });
    // Old predicate silently skips decryption. New predicate attempts it → error proves it fired.
    await expect(decryptNote(note, KEY)).rejects.toThrow();
    // Normal round-trip
    const normalNote = baseNote({ title: encTitle, content: encContent, iv: 'AAAAAAAAAAAAAAAAAAAAAA==', checkings: realCt });
    expect((await decryptNote(normalNote, KEY)).checkings).toBe('f');
  });
});

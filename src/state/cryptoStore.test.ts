import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../db/database.js';
import { indexMetaRepo } from '../db/indexMetaRepo.js';
import { deriveKeyAndChecker } from '../crypto/kdf.js';
import { bytesToBase64 } from '../crypto/aes.js';

describe('cryptoStore', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    const { accessStore } = await import('./accessStore');
    accessStore.setState({ mode: 'readwrite' });
    await db.delete();
    await db.open();
  });

  it('has correct initial state', async () => {
    const { cryptoStore } = await import('./cryptoStore.js');
    const state = cryptoStore.getState();
    expect(state.key).toBeNull();
    expect(state.checker).toBeNull();
    expect(state.salt).toBeNull();
    expect(state.unlocked).toBe(false);
  });

  it('unlock with no existing checker performs first-time setup', async () => {
    const { cryptoStore } = await import('./cryptoStore.js');
    const result = await cryptoStore.getState().unlock('my-password');
    expect(result).toBe(true);
    const state = cryptoStore.getState();
    expect(state.unlocked).toBe(true);
    expect(state.key).not.toBeNull();
    expect(state.checker).not.toBeNull();
    expect(state.salt).not.toBeNull();
    // Verify indexMeta was persisted
    const meta = await indexMetaRepo.get();
    expect(meta).toBeDefined();
    expect(meta!.checker).toBe(state.checker);
    expect(meta!.salt).toBe(state.salt);
  });

  it('unlock with correct password returns true and sets key', async () => {
    // Seed indexMeta with known checker/salt
    const password = 'correct-password';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const { checker } = await deriveKeyAndChecker(password, salt);
    const checkerB64 = bytesToBase64(checker);
    const saltB64 = bytesToBase64(salt);
    await indexMetaRepo.set({
      key: 'current',
      id: 'session-1',
      updated: Date.now(),
      schemaVersion: 2,
      checker: checkerB64,
      salt: saltB64,
    });

    const { cryptoStore } = await import('./cryptoStore.js');
    const result = await cryptoStore.getState().unlock(password);
    expect(result).toBe(true);
    const state = cryptoStore.getState();
    expect(state.unlocked).toBe(true);
    expect(state.key).not.toBeNull();
    expect(state.checker).toBe(checkerB64);
    expect(state.salt).toBe(saltB64);
  });

  it('unlock with wrong password returns false and does not unlock', async () => {
    const password = 'correct-password';
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const { checker } = await deriveKeyAndChecker(password, salt);
    await indexMetaRepo.set({
      key: 'current',
      id: 'session-1',
      updated: Date.now(),
      schemaVersion: 2,
      checker: bytesToBase64(checker),
      salt: bytesToBase64(salt),
    });

    const { cryptoStore } = await import('./cryptoStore.js');
    const result = await cryptoStore.getState().unlock('wrong-password');
    expect(result).toBe(false);
    expect(cryptoStore.getState().unlocked).toBe(false);
    expect(cryptoStore.getState().key).toBeNull();
  });

  it.each(['android-array', 'wrapped-base64'])('unlocks existing imported %s metadata and decrypts an Android note', async format => {
    const { cryptoStore } = await import('./cryptoStore.js');
    const { encryptNote, decryptNote } = await import('../crypto/noteCrypto.js');
    const { createNoteDraft } = await import('../domain/noteDraft.js');
    const password = 'test-пароль';
    const salt = Uint8Array.from([255, 128, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const { checker, key } = await deriveKeyAndChecker(password, salt);
    const encode = (bytes: Uint8Array) => format === 'android-array'
      ? Array.from(bytes, byte => byte > 127 ? byte - 256 : byte)
      : bytesToBase64(bytes) + '\n';
    // Reproduce data previously persisted by the unchecked JSON parser.
    await db.indexMeta.put(JSON.parse(JSON.stringify({
      key: 'current', id: 'android', updated: 1, schemaVersion: 2,
      salt: encode(salt), checker: encode(checker),
    })));
    const encrypted = await encryptNote({ ...createNoteDraft('plain'), title: 'Секрет', content: 'Текст', iv: bytesToBase64(salt) }, key);
    const imported = JSON.parse(JSON.stringify({ ...encrypted, iv: encode(salt) }));
    expect(await cryptoStore.getState().unlock('wrong')).toBe(false);
    expect(await cryptoStore.getState().unlock(password)).toBe(true);
    expect(await decryptNote(imported, cryptoStore.getState().key!)).toMatchObject({ title: 'Секрет', content: 'Текст' });
    expect(cryptoStore.getState().checker).toBe(bytesToBase64(checker));
  });

  it('lock zeros the key and sets unlocked to false', async () => {
    const { cryptoStore } = await import('./cryptoStore.js');
    await cryptoStore.getState().unlock('my-password');
    const stateBefore = cryptoStore.getState();
    expect(stateBefore.unlocked).toBe(true);
    expect(stateBefore.key).not.toBeNull();

    cryptoStore.getState().lock();
    const stateAfter = cryptoStore.getState();
    expect(stateAfter.unlocked).toBe(false);
    expect(stateAfter.key).toBeNull();
  });

  it('setEncryptionParams stores checker and salt', async () => {
    const { cryptoStore } = await import('./cryptoStore.js');
    cryptoStore.getState().setEncryptionParams('checker-abc', 'salt-xyz');
    const state = cryptoStore.getState();
    expect(state.checker).toBe('checker-abc');
    expect(state.salt).toBe('salt-xyz');
  });

  it('setActiveKey updates key, checker, salt, and unlocked=true', async () => {
    const { cryptoStore } = await import('./cryptoStore.js');
    // Start locked
    expect(cryptoStore.getState().unlocked).toBe(false);

    const newKey = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160]);
    cryptoStore.getState().setActiveKey(newKey, 'new-checker', 'new-salt');

    const state = cryptoStore.getState();
    expect(state.key).toBe(newKey);
    expect(state.checker).toBe('new-checker');
    expect(state.salt).toBe('new-salt');
    expect(state.unlocked).toBe(true);
  });
});

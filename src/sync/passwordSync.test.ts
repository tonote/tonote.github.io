import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { db } from '../db/database';
import { beginSession } from './session';
import { FakeDrive, note } from './testing';
import { deriveKeyAndChecker } from '../crypto/kdf';
import { bytesToBase64 } from '../crypto/aes';
import { encryptNote, decryptNote, withFreshIv } from '../crypto/noteCrypto';
import { rotatePassword, reconcilePasswords } from './passwordSync';
import { saveNote } from './local';
import { cryptoStore } from '../state/cryptoStore';
import { isDeleted } from './types';

let drive: FakeDrive;
async function setup() {
  const salt = new Uint8Array(16).fill(1), params = await deriveKeyAndChecker('old-password', salt);
  const keys = { salt: bytesToBase64(salt), checker: bytesToBase64(params.checker) };
  drive.config!.value = { ...drive.config!.value, ...keys };
  await db.indexMeta.put({ key: 'current', ...keys });
  const encrypted = await encryptNote(withFreshIv(note('encrypted', { encryptionSalt: keys.salt })), params.key);
  drive.seed(encrypted); await db.notes.put(encrypted);
  cryptoStore.getState().setActiveKey(params.key, keys.checker, keys.salt);
  return { ...keys, ...params };
}
beforeEach(async () => { beginSession(); await db.delete(); await db.open(); drive = new FakeDrive(); cryptoStore.getState().lock(); });
it('changes password without changing user times and makes the new key active only after all files verify', async () => {
  await setup();
  await rotatePassword(drive, 'old-password', 'new-password');
  const value = drive.documents.get('encrypted')!.value;
  if (isDeleted(value)) throw new Error('Expected encrypted content');
  expect(value.edited).toBe(100); expect(value.encryptionSalt).toBe(drive.config!.value.salt); expect(drive.config!.value.keyRotation).toBeUndefined();
  const key = (await deriveKeyAndChecker('new-password', Uint8Array.from(atob(value.encryptionSalt!), c => c.charCodeAt(0)))).key;
  expect((await decryptNote(value, key)).content).toBe('text');
  expect(await db.outbox.count()).toBe(0);
});
it('can resume an interrupted transition with the same parameters and no plaintext password persisted', async () => {
  const old = await setup();
  drive.afterWrite = async () => { drive.afterWrite = undefined; throw new Error('connection lost'); };
  await expect(rotatePassword(drive, 'old-password', 'new-password')).rejects.toThrow('connection lost');
  expect(drive.config!.value.salt).toBe(old.salt); const rotation = drive.config!.value.keyRotation!;
  expect(rotation).toBeDefined(); expect(JSON.stringify(await db.kv.toArray())).not.toContain('new-password');
  await rotatePassword(drive, 'old-password', 'new-password');
  expect(drive.config!.value.salt).toBe(rotation.to.salt); expect(drive.config!.value.keyRotation).toBeUndefined();
});
it('reconciles a stale local offline edit using both passwords and preserves edited', async () => {
  const old = await setup();
  await rotatePassword(drive, 'old-password', 'new-password');
  const offline = await encryptNote(withFreshIv(note('encrypted', { edited: 500, content: 'offline work', encryptionSalt: old.salt })), old.key);
  await db.indexMeta.put({ key: 'current', checker: bytesToBase64(old.checker), salt: old.salt }); await saveNote(offline);
  await reconcilePasswords(drive, 'old-password', 'new-password');
  const value = drive.documents.get('encrypted')!.value;
  expect(value.edited).toBe(500);
  expect(isDeleted(value) ? undefined : value.encryptionSalt).toBe(drive.config!.value.salt);
});
it('retains local edits and active parameters when the user gives the wrong current password', async () => {
  await setup(); const before = await db.notes.toArray();
  await expect(reconcilePasswords(drive, 'old-password', 'wrong')).rejects.toThrow('Incorrect password');
  expect(await db.notes.toArray()).toEqual(before);
});

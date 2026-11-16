import { db } from '../db/database';
import { indexMetaRepo } from '../db/indexMetaRepo';
import { cryptoStore } from '../state/cryptoStore';
import { syncStore } from '../state/syncStore';
import { deriveKeyAndChecker } from '../crypto/kdf';
import { base64ToBytes, bytesToBase64, randomSalt } from '../crypto/aes';
import { decryptNote, encryptNote, withFreshIv } from '../crypto/noteCrypto';
import type { SyncGateway } from './gatewayTypes';
import { exclusive, fullSync } from './engine';
import { isDeleted, type KeyParameters, type KeyRotation } from './types';
import { queueNote } from './local';
import { sessionActive, sessionToken } from './session';
import { assertWritable } from '../state/accessStore';

async function checkedKey(password: string, params: KeyParameters) {
  const value = await deriveKeyAndChecker(password, base64ToBytes(params.salt));
  if (bytesToBase64(value.checker) !== params.checker) throw new Error('Incorrect password');
  return value.key;
}
export async function reconcilePasswords(gw: SyncGateway, oldPassword: string, currentPassword: string): Promise<void> {
  assertWritable();
  const token = sessionToken();
  await exclusive(async () => {
    assertWritable();
    const folder = await gw.ensureFolder();
    const remote = await gw.readConfig(folder);
    if (!remote?.value.salt || !remote.value.checker) throw new Error('Drive encryption parameters unavailable');
    if (remote.value.keyRotation) throw new Error('Resume the password change in Settings using both passwords');
    const target = { salt: remote.value.salt, checker: remote.value.checker };
    const newKey = await checkedKey(currentPassword, target);
    const meta = await indexMetaRepo.get();
    const notes = await db.notes.toArray();
    const needsOldKey = notes.some(note => note.iv && note.encryptionSalt !== target.salt);
    const oldKey = needsOldKey && meta?.salt && meta.checker ? await checkedKey(oldPassword, { salt: meta.salt, checker: meta.checker }) : null;
    const converted: import('../domain/types').Note[] = [];
    for (const note of notes) {
      if (!note.iv || note.encryptionSalt === target.salt) continue;
      if (!oldKey || note.encryptionSalt !== meta?.salt) throw new Error('A local note requires another encryption password');
      const plain = await decryptNote(note, oldKey);
      converted.push(await encryptNote(withFreshIv({ ...plain, encryptionSalt: target.salt }), newKey));
    }
    if (!sessionActive(token)) throw new DOMException('Session ended', 'AbortError');
    assertWritable();
    await db.transaction('rw', db.notes, db.syncRecords, db.outbox, db.indexMeta, async () => {
      for (const note of converted) {
        const original = notes.find(n => n.id === note.id)!;
        if (JSON.stringify(await db.notes.get(note.id)) !== JSON.stringify(original)) throw new Error('A note changed; retry password reconciliation');
        await queueNote(note);
      }
      await indexMetaRepo.set({ key: 'current', ...target });
    });
    cryptoStore.getState().setActiveKey(newKey, target.checker, target.salt);
    syncStore.getState().clearCryptoConflict();
  });
  await fullSync(gw);
}
/** A durable server-side transition; retry the same transition after interruption. */
export async function rotatePassword(gw: SyncGateway, oldPassword: string, newPassword: string): Promise<void> {
  assertWritable();
  const initialFolder = await gw.ensureFolder();
  const initial = await gw.readConfig(initialFolder);
  if (!initial?.value.keyRotation) await fullSync(gw);
  const token = sessionToken();
  await exclusive(async () => {
    const guard = () => { if (!sessionActive(token)) throw new DOMException('Session ended', 'AbortError'); assertWritable(); };
    guard();
    const folder = await gw.ensureFolder();
    let remote = await gw.readConfig(folder); guard();
    if (!remote?.value.initialized) throw new Error('Complete initial synchronization first');
    const meta = await indexMetaRepo.get();
    const from = remote.value.keyRotation?.from ?? (remote.value.salt && remote.value.checker ? { salt: remote.value.salt, checker: remote.value.checker } : undefined);
    if (!from || !meta?.salt) throw new Error('No existing encryption password');
    const oldKey = await checkedKey(oldPassword, from);
    let rotation: KeyRotation;
    let newKey: Uint8Array;
    if (remote.value.keyRotation) {
      rotation = remote.value.keyRotation;
      newKey = await checkedKey(newPassword, rotation.to);
    } else {
      const salt = bytesToBase64(randomSalt());
      const value = await deriveKeyAndChecker(newPassword, base64ToBytes(salt));
      newKey = value.key;
      rotation = { id: crypto.randomUUID(), from, to: { salt, checker: bytesToBase64(value.checker) } };
      const config = { ...remote.value, keyRotation: rotation };
      const file = await gw.writeConfig(folder, config, remote.file); guard(); remote = { value: config, file };
    }
    await db.kv.put({ key: 'key-rotation', value: rotation });
    const files = await gw.listNotes(folder); guard();
    for (const file of files) {
      const id = file.name.slice('tonote.note.'.length, -'.json'.length);
      const current = await gw.readNote(folder, id, file); guard();
      if (!current) throw new Error('A note is missing during password change');
      let document = current.value;
      if (isDeleted(document) || !document.iv) continue;
      if (document.encryptionSalt !== rotation.from.salt && document.encryptionSalt !== rotation.to.salt) throw new Error('Unexpected encryption salt during password change');
      if (document.encryptionSalt === rotation.from.salt) {
        // Reuse a durably prepared ciphertext after a timed-out write.
        const prepared = (await db.kv.get(`rekey:${rotation.id}:${id}`))?.value as import('../domain/types').Note | undefined;
        document = prepared ?? await encryptNote(withFreshIv({ ...await decryptNote(document, oldKey), encryptionSalt: rotation.to.salt }), newKey);
        await db.kv.put({ key: `rekey:${rotation.id}:${id}`, value: document });
        await gw.writeNote(folder, document, current.file); guard();
      }
      // Import the exact accepted ciphertext only if the local user version is not newer.
      await db.transaction('rw', db.notes, db.syncRecords, async () => {
        const local = await db.notes.get(id);
        if (!local || local.edited <= document.edited) await db.notes.put(document as import('../domain/types').Note);
        await db.syncRecords.update(id, { needsPull: true });
      });
    }
    // Verify the whole encrypted set before committing the active key.
    for (const file of await gw.listNotes(folder)) {
      const current = await gw.readNote(folder, file.name.slice('tonote.note.'.length, -5), file); guard();
      if (!current || (!isDeleted(current.value) && current.value.iv && current.value.encryptionSalt !== rotation.to.salt)) throw new Error('Password change verification failed');
    }
    const latest = await gw.readConfig(folder); guard();
    if (latest?.value.keyRotation?.id !== rotation.id) throw new Error('Password transition changed');
    const config = { ...latest.value, ...rotation.to }; delete config.keyRotation;
    await gw.writeConfig(folder, config, latest.file); guard();
    // Reencrypt any local-only/newer offline changes without changing edited.
    await db.transaction('rw', db.indexMeta, db.kv, async () => {
      await indexMetaRepo.set({ key: 'current', ...rotation.from });
      await db.kv.delete('key-rotation');
    });
  });
  await reconcilePasswords(gw, oldPassword, newPassword);
}

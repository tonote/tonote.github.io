import { describe, it, expect } from 'vitest';
import { deriveKeyAndChecker } from './kdf';
import { bytesToBase64, base64ToBytes, randomSalt, randomIv } from './aes';
import { encryptNote, decryptNote, withFreshIv } from './noteCrypto';
import { changePassword } from './passwordChange';
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

describe('changePassword', () => {
  it('re-encrypts encrypted notes with new key, leaves plaintext unchanged', async () => {
    const oldPassword = 'old-pw';
    const oldSalt = randomSalt();
    const { key: oldKey } = await deriveKeyAndChecker(oldPassword, oldSalt);

    // Create two encrypted notes + one plaintext
    const encNote1 = await encryptNote(withFreshIv(baseNote({ id: 'n1', title: 'Secret 1', content: 'Body 1' })), oldKey);
    const encNote2 = await encryptNote(withFreshIv(baseNote({ id: 'n2', title: 'Secret 2', content: 'Body 2', checkings: '010' })), oldKey);
    const plainNote = baseNote({ id: 'n3', title: 'Public', content: 'Visible' });
    const notes = [encNote1, encNote2, plainNote];

    // Change password
    const newPassword = 'new-pw';
    const newSalt = randomSalt();
    const result = await changePassword(notes, oldKey, newPassword, newSalt);

    // All encrypted notes should still have iv (re-encrypted)
    expect(result.notes[0].iv).toBeDefined();
    expect(result.notes[1].iv).toBeDefined();
    // Plaintext note should be unchanged
    expect(result.notes[2].iv).toBeUndefined();
    expect(result.notes[2].title).toBe('Public');
    expect(result.notes[2].content).toBe('Visible');

    // Notes should be decryptable with the new key
    const dec1 = await decryptNote(result.notes[0], result.key);
    expect(dec1.title).toBe('Secret 1');
    expect(dec1.content).toBe('Body 1');

    const dec2 = await decryptNote(result.notes[1], result.key);
    expect(dec2.title).toBe('Secret 2');
    expect(dec2.content).toBe('Body 2');
    expect(dec2.checkings).toBe('010');
  });

  it('re-encrypted notes are NOT decryptable with old key', async () => {
    const oldPassword = 'old-pw';
    const oldSalt = randomSalt();
    const { key: oldKey } = await deriveKeyAndChecker(oldPassword, oldSalt);

    const encNote = await encryptNote(
      withFreshIv(baseNote({ id: 'n1', title: 'Secret', content: 'Body' })),
      oldKey,
    );

    const newPassword = 'new-pw';
    const newSalt = randomSalt();
    const result = await changePassword([encNote], oldKey, newPassword, newSalt);

    // Attempting to decrypt with old key should fail
    await expect(decryptNote(result.notes[0], oldKey)).rejects.toThrow();
  });

  it('fresh salt per call — caller passes new random salt', async () => {
    const oldSalt = randomSalt();
    const { key: oldKey } = await deriveKeyAndChecker('pw', oldSalt);

    const encNote = await encryptNote(
      withFreshIv(baseNote({ id: 'n1', title: 'X', content: 'Y' })),
      oldKey,
    );

    const newSalt1 = randomSalt();
    const result1 = await changePassword([encNote], oldKey, 'new', newSalt1);

    const newSalt2 = randomSalt();
    const result2 = await changePassword([encNote], oldKey, 'new', newSalt2);

    // Salts should be different
    expect(result1.salt).not.toBe(result2.salt);
    // The results should also differ since the IVs are re-randomized
    expect(result1.notes[0].iv).not.toBe(result2.notes[0].iv);
  });

  it('checker matches deriveKeyAndChecker for the new password and salt', async () => {
    const oldSalt = randomSalt();
    const { key: oldKey } = await deriveKeyAndChecker('old', oldSalt);

    const encNote = await encryptNote(
      withFreshIv(baseNote({ id: 'n1', title: 'X', content: 'Y' })),
      oldKey,
    );

    const newSalt = randomSalt();
    const result = await changePassword([encNote], oldKey, 'new-pw', newSalt);

    // Independently derive checker for same password/salt
    const { checker: expectedChecker } = await deriveKeyAndChecker('new-pw', newSalt);
    expect(result.checker).toBe(bytesToBase64(expectedChecker));
    expect(result.salt).toBe(bytesToBase64(newSalt));
  });

  it('works with empty notes array', async () => {
    const oldSalt = randomSalt();
    const { key: oldKey } = await deriveKeyAndChecker('old', oldSalt);

    const newSalt = randomSalt();
    const result = await changePassword([], oldKey, 'new', newSalt);

    expect(result.notes).toEqual([]);
    expect(result.key).toBeDefined();
    expect(result.checker).toBeDefined();
    expect(result.salt).toBeDefined();
  });
});

import { describe, it, expect } from 'vitest';
import { deriveKeyAndChecker } from './kdf';
import vector from '../../tests/fixtures/crypto/kdf-vector.json';

describe('KDF (faithful port of Android EncryptionParametersProvider)', () => {
  it('matches the independently-derived vector', async () => {
    const salt = new Uint8Array(Buffer.from(vector.salt, 'hex'));
    const { key, checker, digest } = await deriveKeyAndChecker(vector.password, salt);
    expect(Buffer.from(digest).toString('hex')).toBe(vector.digestHex);
    expect(Buffer.from(key).toString('hex')).toBe(vector.keyHex);
    expect(Buffer.from(checker).toString('hex')).toBe(vector.checkerHex);
  });
});

import { describe, it, expect } from 'vitest';
import { encryptB64, decryptB64, bytesToBase64, base64ToBytes } from './aes';
import vector from '../../tests/fixtures/crypto/aes-vector.json';

describe('AES-CBC', () => {
  it('decrypts the Node-produced ciphertext to the original plaintext', async () => {
    const key = new Uint8Array(Buffer.from(vector.keyHex, 'hex'));
    const iv = new Uint8Array(Buffer.from(vector.ivHex, 'hex'));
    const pt = await decryptB64(key, iv, vector.ciphertextBase64);
    expect(pt).toBe(vector.plaintext);
  });
  it('encrypts to the exact same ciphertext (byte-for-byte)', async () => {
    const key = new Uint8Array(Buffer.from(vector.keyHex, 'hex'));
    const iv = new Uint8Array(Buffer.from(vector.ivHex, 'hex'));
    const ct = await encryptB64(key, iv, vector.plaintext);
    expect(ct).toBe(vector.ciphertextBase64);
  });
  it('round-trips arbitrary unicode', async () => {
    const key = new Uint8Array(16);
    const iv = new Uint8Array(16);
    const ct = await encryptB64(key, iv, '🌳 emoji + текст');
    expect(await decryptB64(key, iv, ct)).toBe('🌳 emoji + текст');
  });
});

describe('base64 helpers', () => {
  it('round-trips bytes', () => {
    const b = new Uint8Array([0, 1, 2, 255, 128]);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
  });
  it('decodes Android-style wrapped base64 (LF every 76 chars)', async () => {
    const key = new Uint8Array(16); const iv = new Uint8Array(16);
    const longText = 'x'.repeat(200); // produces ~272 base64 chars → crosses 76 boundary
    const ct = await encryptB64(key, iv, longText);
    const wrapped = ct.match(/.{1,76}/g)!.join('\n');
    expect(await decryptB64(key, iv, wrapped)).toBe(longText);
  });
  it('decodes CRLF-wrapped base64', async () => {
    const key = new Uint8Array(16); const iv = new Uint8Array(16);
    const longText = 'y'.repeat(300);
    const ct = await encryptB64(key, iv, longText);
    const wrapped = ct.match(/.{1,76}/g)!.join('\r\n');
    expect(await decryptB64(key, iv, wrapped)).toBe(longText);
  });
});

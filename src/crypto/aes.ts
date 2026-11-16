/** Coerce a Uint8Array to a concrete ArrayBuffer-backed view (what Web Crypto expects). */
function buf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  return u.buffer instanceof ArrayBuffer ? u as Uint8Array<ArrayBuffer> : new Uint8Array(u);
}

async function importKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', buf(key), { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
}

export async function encryptB64(key: Uint8Array, iv: Uint8Array, plaintext: string): Promise<string> {
  const ck = await importKey(key);
  const plainBytes = new TextEncoder().encode(plaintext);
  const out = await crypto.subtle.encrypt({ name: 'AES-CBC', iv: buf(iv) }, ck, buf(plainBytes));
  return bytesToBase64(new Uint8Array(out));
}

export async function decryptB64(key: Uint8Array, iv: Uint8Array, ciphertextB64: string): Promise<string> {
  const ck = await importKey(key);
  const out = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: buf(iv) }, ck, buf(base64ToBytes(ciphertextB64)));
  return new TextDecoder().decode(out);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// Gson serializes Android ByteArray fields as signed JSON numbers.
// Accept them here as well for notes already imported into IndexedDB.
export function base64ToBytes(b64: string | number[]): Uint8Array {
  if (Array.isArray(b64)) {
    if (!b64.every(byte => Number.isInteger(byte) && byte >= -128 && byte <= 255)) {
      throw new Error('Invalid byte array');
    }
    return Uint8Array.from(b64);
  }
  const s = atob(b64.replace(/[\t\n\f\r ]/g, '')); // strip ASCII whitespace (Android Base64.DEFAULT wraps at 76)
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function normalizeEncodedBytes(value: string | number[]): string {
  return bytesToBase64(base64ToBytes(value));
}

export function randomIv(): Uint8Array {
  const iv = new Uint8Array(16);
  crypto.getRandomValues(iv);
  return iv;
}

export function randomSalt(): Uint8Array {
  return randomIv();
}

// Manual Android cross-check is a release gate before shipping encryption to real users (spec §18).
// The vector here is self-derived from a faithful Node reimplementation of the Java source.

const PEPPER1 = 'com.gcteam.tonote.drowssap_ytiruces';
const PEPPER2 = 'com.gcteam.tonote.DROWSSAP_YTIRUCES';

/** Coerce a Uint8Array to a concrete ArrayBuffer-backed view (what Web Crypto expects). */
function buf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  return u.buffer instanceof ArrayBuffer ? u as Uint8Array<ArrayBuffer> : new Uint8Array(u);
}

async function sha512(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-512', buf(data)));
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

async function getDigest(bytes: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  let acc = concat(salt, bytes, salt);
  for (let i = 1; i <= 100; i++) {
    acc = concat(acc, bytes);
    acc = await sha512(acc);
  }
  return sha512(acc);
}

export async function getDigestV1(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const temp = `${password}${PEPPER1}${password.toLowerCase()}${PEPPER2}${password.toUpperCase()}`;
  return getDigest(enc.encode(temp), salt);
}

export async function getChecker(digest: Uint8Array): Promise<Uint8Array> {
  const second = await getDigest(digest, digest);
  return second.slice(16, 20);
}

export async function deriveKeyAndChecker(
  password: string,
  salt: Uint8Array,
): Promise<{ key: Uint8Array; checker: Uint8Array; digest: Uint8Array }> {
  const digest = await getDigestV1(password, salt);
  return {
    digest,
    key: digest.slice(0, 16),
    checker: await getChecker(digest),
  };
}

import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';

const PEPPER1 = 'com.gcteam.tonote.drowssap_ytiruces';
const PEPPER2 = 'com.gcteam.tonote.DROWSSAP_YTIRUCES';

function getDigest(bytes, salt) {
  let acc = Buffer.concat([salt, bytes, salt]);
  let h = null;
  for (let i = 1; i <= 100; i++) {
    acc = Buffer.concat([acc, bytes]);
    h = createHash('sha512').update(acc).digest();
    acc = h;
  }
  return createHash('sha512').update(acc).digest();
}
function getDigestV1(password, salt) {
  const enc = new TextEncoder();
  const temp = `${password}${PEPPER1}${password.toLowerCase()}${PEPPER2}${password.toUpperCase()}`;
  return getDigest(Buffer.from(enc.encode(temp)), salt);
}
function getChecker(digest) {
  return getDigest(digest, digest).subarray(16, 20);
}

const password = 'test123';
const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const digest = getDigestV1(password, salt);
mkdirSync('tests/fixtures/crypto', { recursive: true });
writeFileSync('tests/fixtures/crypto/kdf-vector.json', JSON.stringify({
  password, salt: salt.toString('hex'),
  digestHex: digest.toString('hex'),
  keyHex: digest.subarray(0, 16).toString('hex'),
  checkerHex: getChecker(digest).toString('hex'),
}, null, 2));
console.log('vector written');

import { createCipheriv, createDecipheriv } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const iv = Buffer.from('ffeeddccbbaa99887766554433221100', 'hex');
const plain = Buffer.from('Hello, ToNote! 📝 — cyrillic тест', 'utf8');

const cipher = createCipheriv('aes-128-cbc', key, iv);
const enc = Buffer.concat([cipher.update(plain), cipher.final()]);

// verify round-trip in the generator itself:
const dec = createDecipheriv('aes-128-cbc', key, iv);
const rt = Buffer.concat([dec.update(enc), dec.final()]);
console.log('round-trip ok:', rt.equals(plain));

writeFileSync('tests/fixtures/crypto/aes-vector.json', JSON.stringify({
  keyHex: key.toString('hex'),
  ivHex: iv.toString('hex'),
  plaintext: plain.toString('utf8'),
  ciphertextBase64: enc.toString('base64'),
}, null, 2));
console.log('aes vector written');

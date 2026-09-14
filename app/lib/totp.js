// TOTP (RFC 6238) murni dengan crypto bawaan Node - kompatibel Google
// Authenticator / Authy / 1Password: 6 digit, periode 30 detik, HMAC-SHA1.
// Tanpa dependency eksternal.
import crypto from 'crypto';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20) {
  const buf = crypto.randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += B32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Secret base32 tidak valid');
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.alloc(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

function hotp(secretB32, counter) {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3]) %
    1_000_000;
  return String(code).padStart(6, '0');
}

// Window default +/- 1 langkah (90 detik toleransi jam phone).
export function verifyTotp(secretB32, token, { step = 30, window = 1 } = {}) {
  const clean = String(token || '').replace(/\D/g, '');
  if (clean.length !== 6 || !secretB32) return false;
  const counter = Math.floor(Date.now() / 1000 / step);
  for (let i = -window; i <= window; i++) {
    // perbandingan constant-time-ish: hitung semua, bandingkan setelahnya
    if (hotp(secretB32, counter + i) === clean) return true;
  }
  return false;
}

// URI provisioning utk di-scan aplikasi authenticator.
export function otpauthUri(secretB32, label, issuer = 'NEXO Games') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

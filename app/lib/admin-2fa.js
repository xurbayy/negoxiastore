// Cookie pendukung 2FA admin:
//  - nexo_admin_pending : JWT short-lived (10 mnt) -> user sudah lulus
//    langkah 1 (password/Identitas Discord), belum lulus TOTP.
//  - nexo_admin_trusted : JWT "perangkat tepercaya" (30 hari). Di-set HANYA
//    setelah user lulus TOTP (opsi "ingat perangkat ini"), isi token acak
//    yang ditandatangani SESSION_SECRET. Kalau masih valid, langkah 2FA
//    dilewati (login Discord admin jadi lancar tanpa kode tiap saat).
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const PENDING_COOKIE = 'nexo_admin_pending';
const TRUSTED_COOKIE = 'nexo_admin_trusted';
const PENDING_MAX_AGE = 10 * 60;        // 10 menit
const TRUSTED_MAX_AGE = 30 * 24 * 3600; // 30 hari

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET wajib diset di production');
  }
  return new TextEncoder().encode((s || 'dev-secret-ganti-di-produksi-32char').padEnd(32, '0'));
}

const cookieBase = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
});

export function totpConfigured() {
  return Boolean(process.env.ADMIN_TOTP_SECRET);
}

// ---------- pending ----------
export async function createPending2fa(username, avatar = null) {
  const token = await new SignJWT({ pending: '2fa', adminUsername: username, adminAvatar: avatar })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_MAX_AGE}s`)
    .sign(secret());
  const store = await cookies();
  store.set(PENDING_COOKIE, token, { ...cookieBase(), maxAge: PENDING_MAX_AGE });
}

export async function getPending2fa() {
  const store = await cookies();
  const token = store.get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.pending !== '2fa') return null;
    return { adminUsername: payload.adminUsername, adminAvatar: payload.adminAvatar || null };
  } catch {
    return null;
  }
}

export async function clearPending2fa() {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}

// ---------- trusted device ----------
export async function createTrustedDevice() {
  const deviceId = crypto.randomBytes(32).toString('hex');
  const token = await new SignJWT({ trustedDevice: deviceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TRUSTED_MAX_AGE}s`)
    .sign(secret());
  const store = await cookies();
  store.set(TRUSTED_COOKIE, token, { ...cookieBase(), maxAge: TRUSTED_MAX_AGE });
}

export async function hasTrustedDevice() {
  const store = await cookies();
  const token = store.get(TRUSTED_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return Boolean(payload.trustedDevice);
  } catch {
    return false;
  }
}

export async function clearTrustedDevice() {
  const store = await cookies();
  store.delete(TRUSTED_COOKIE);
}

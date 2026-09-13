// Session member (Discord OAuth) & admin (username+password) - cookie terpisah.
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const MEMBER_COOKIE = 'nexo_session';
const ADMIN_COOKIE = 'nexo_admin_session';
// Member: session cookie (tanpa maxAge) → otomatis hilang saat browser ditutup.
// JWT tetap punya expiry 24 jam sbg safety-net kalau browser restore session.
const JWT_LIFETIME = 60 * 60 * 24; // 24 jam (hanya utk exp claim di JWT)
const ADMIN_MAX_AGE = 60 * 60 * 8; // admin 8 jam

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === 'production') {
    // Fail-fast: tanpa secret acak, cookie JWT bisa dipalsukan = akun takeover.
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

// ---------- MEMBER ----------
export async function createSession(user) {
  const token = await new SignJWT({
    discordId: user.discordId,
    username: user.username,
    avatar: user.avatar || null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${JWT_LIFETIME}s`)
    .sign(secret());

  const store = await cookies();
  store.set(MEMBER_COOKIE, token, { ...cookieBase() }); // session cookie: tanpa maxAge → hapus saat browser ditutup
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(MEMBER_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      discordId: payload.discordId,
      username: payload.username,
      avatar: payload.avatar,
      isAdmin: false,
    };
  } catch {
    return null;
  }
}

// ---------- ADMIN ----------
export async function createAdminSession(username, avatar = null) {
  const token = await new SignJWT({ adminUsername: username, adminAvatar: avatar })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(ADMIN_COOKIE, token, { ...cookieBase(), maxAge: ADMIN_MAX_AGE });
}

export async function getAdminSession() {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { adminUsername: payload.adminUsername, adminAvatar: payload.adminAvatar || null };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const store = await cookies();
  store.delete(MEMBER_COOKIE);
}

export async function destroyAdminSession() {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

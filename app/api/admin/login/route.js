import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminSession, destroyAdminSession } from '../../../lib/session';
import { rateLimit, isLockedOut, recordFail, clearFails, lockoutRemaining, getClientIp } from '../../../lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_FAIL = 5;
const WINDOW_MS = 60_000;      // 5 percobaan / menit
const LOCKOUT_MS = 10 * 60_000; // lockout 10 menit setelah 5 gagal

// POST /api/admin/login { username, password } -> session admin terpisah.
export async function POST(request) {
  const ip = getClientIp(request);

  if (isLockedOut(ip)) {
    const sisa = Math.ceil(lockoutRemaining(ip) / 60000);
    return NextResponse.json(
      { ok: false, error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${sisa} menit.` },
      { status: 429 }
    );
  }
  if (!rateLimit(`login:${ip}`, MAX_FAIL, WINDOW_MS)) {
    return NextResponse.json(
      { ok: false, error: 'Terlalu banyak percobaan. Tunggu sebentar.' },
      { status: 429 }
    );
  }

  let body;
  try { body = await request.json(); } catch { body = null; }
  const username = String(body?.username || '');
  const password = String(body?.password || '');

  const expectedUser = process.env.ADMIN_USERNAME || '';
  const expectedHash = process.env.ADMIN_PASSWORD_HASH || '';

  const userOk = expectedUser && username === expectedUser;
  const passOk = expectedHash && password && bcrypt.compareSync(password, expectedHash);

  if (!userOk || !passOk) {
    recordFail(ip, MAX_FAIL, WINDOW_MS, LOCKOUT_MS);
    // Pesan umum: jangan bocorkan mana yang salah
    return NextResponse.json(
      { ok: false, error: 'Username atau password salah.' },
      { status: 401 }
    );
  }

  clearFails(ip);
  await createAdminSession(expectedUser);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/login - logout admin (hapus cookie).
export async function DELETE() {
  await destroyAdminSession();
  return NextResponse.json({ ok: true });
}

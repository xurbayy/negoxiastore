import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createAdminSession, destroyAdminSession } from '../../../lib/session';
import { rateLimit, isLockedOut, recordFail, clearFails, lockoutRemaining, getClientIp } from '../../../lib/rate-limit';
import { verifyTurnstile } from '../../../lib/turnstile';
import { totpConfigured, createPending2fa, clearTrustedDevice, hasTrustedDevice } from '../../../lib/admin-2fa';

export const dynamic = 'force-dynamic';

const MAX_FAIL = 5;
const WINDOW_MS = 60_000;      // 5 percobaan / menit
const LOCKOUT_MS = 10 * 60_000; // lockout 10 menit setelah 5 gagal

// POST /api/admin/login { username, password, cfToken } -> langkah 1.
// Dengan 2FA aktif: hasil = pending cookie -> klien lanjut ke /admin/verify.
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

  // Captcha Turnstile (sama seperti halaman Redeem) - aktif kalau secret diset.
  if (process.env.TURNSTILE_SECRET_KEY) {
    const v = await verifyTurnstile(body?.cfToken, ip);
    if (!v.ok) {
      return NextResponse.json(
        { ok: false, turnstile: true, error: v.netError ? 'Verifikasi captcha sedang terganggu, coba lagi.' : 'Selesaikan captcha dulu sebelum masuk.' },
        { status: 400 }
      );
    }
  }

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
  if (totpConfigured()) {
    // Perangkat ini sudah tepercaya (pernah lulus TOTP + "ingat") -> masuk
    // langsung, sama seperti jalur Discord. Jangan paksa kode terus.
    if (await hasTrustedDevice()) {
      await createAdminSession(username);
      return NextResponse.json({ ok: true });
    }
    await createPending2fa(username);
    return NextResponse.json({ ok: true, needs2fa: true });
  }
  await createAdminSession(username);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/login - logout admin (hapus cookie sesi + perangkat tepercaya).
export async function DELETE() {
  await destroyAdminSession();
  await clearTrustedDevice();
  return NextResponse.json({ ok: true });
}

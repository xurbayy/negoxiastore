import { NextResponse } from 'next/server';
import { createAdminSession } from '../../../lib/session';
import { verifyTotp } from '../../../lib/totp';
import {
  totpConfigured,
  getPending2fa,
  clearPending2fa,
  createTrustedDevice,
} from '../../../lib/admin-2fa';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/admin/2fa { code, remember } - langkah 2: verifikasi TOTP dari
// cookie pending (dibuat /api/admin/login atau gerbang /admin/verify).
export async function POST(request) {
  if (!totpConfigured()) {
    return NextResponse.json({ ok: false, error: '2FA tidak aktif.' }, { status: 400 });
  }
  const pending = await getPending2fa();
  if (!pending) {
    return NextResponse.json({ ok: false, error: 'Sesi login kadaluarsa. Mulai dari awal.' }, { status: 401 });
  }

  const ip = getClientIp(request);
  // 10 percobaan kode / menit per IP (kode salah acak 1/1.000.000, tapi
  // batasi saja biar tidak bisa brute-force window 90 detik).
  if (!rateLimit(`admin2fa:${ip}`, 10, 60_000)) {
    return NextResponse.json({ ok: false, error: 'Terlalu banyak percobaan. Tunggu sebentar.' }, { status: 429 });
  }

  let body;
  try { body = await request.json(); } catch { body = null; }
  const code = String(body?.code || '');

  if (!verifyTotp(process.env.ADMIN_TOTP_SECRET, code)) {
    return NextResponse.json({ ok: false, error: 'Kode salah atau sudah kedaluwarsa.' }, { status: 401 });
  }

  await clearPending2fa();
  if (body?.remember) {
    await createTrustedDevice();
  }
  await createAdminSession(pending.adminUsername, pending.adminAvatar);
  return NextResponse.json({ ok: true });
}

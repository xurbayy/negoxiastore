import { NextResponse } from 'next/server';
import { destroySession, destroyAdminSession } from '../../../lib/session';
import { clearTrustedDevice } from '../../../lib/admin-2fa';

export const dynamic = 'force-dynamic';

// GET /api/auth/logout - hapus cookie session member DAN admin
// (tombol Logout di panel admin memakai jalur yang sama). Keluar panel
// juga mencabut status "perangkat tepercaya" 2FA -> login berikutnya
// wajib kode authenticator lagi.
export async function GET(request) {
  await destroySession();
  await destroyAdminSession();
  await clearTrustedDevice();
  return NextResponse.redirect(new URL('/', request.url));
}

import { NextResponse } from 'next/server';
import { destroySession, destroyAdminSession } from '../../../lib/session';

export const dynamic = 'force-dynamic';

// GET /api/auth/logout - hapus cookie session member DAN admin
// (tombol Logout di panel admin memakai jalur yang sama).
export async function GET(request) {
  await destroySession();
  await destroyAdminSession();
  return NextResponse.redirect(new URL('/', request.url));
}

// Guard level-edge utk SEMUA halaman panel admin: tanpa session admin yang
// sah (atau pending-2FA utk /admin/verify), request apa pun di bawah /admin
// langsung dilempar ke /admin/login - sebelum route-nya dirender.
// Ini lapisan PERTAMA; tiap halaman + API tetap punya cek sendiri (defense
// in depth). Format cookie = JWT HS256 dgn SESSION_SECRET (lihat lib/session).
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const ADMIN_COOKIE = 'nexo_admin_session';
const PENDING_COOKIE = 'nexo_admin_pending';

function secret() {
  const s = process.env.SESSION_SECRET;
  return new TextEncoder().encode((s || 'dev-secret-ganti-di-produksi-32char').padEnd(32, '0'));
}

async function hasValidCookie(request, name, claim) {
  const token = request.cookies.get(name)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return claim === 'trustedDevice' ? Boolean(payload.trustedDevice) : payload[claim] !== undefined;
  } catch {
    return false;
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Halaman publik dalam cluster /admin: login page saja.
  if (pathname === '/admin/login') return NextResponse.next();

  // /admin/verify: boleh diakses kalau ada sesi admin ATAU cookie pending 2FA.
  if (pathname === '/admin/verify') {
    const ok =
      (await hasValidCookie(request, ADMIN_COOKIE, 'adminUsername')) ||
      (await hasValidCookie(request, PENDING_COOKIE, 'pending'));
    if (ok) return NextResponse.next();
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  // /admin dan sisanya: WAJIB sesi admin valid (cookie rusak/expired = sama
  // saja dengan tidak punya).
  if (await hasValidCookie(request, ADMIN_COOKIE, 'adminUsername')) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL('/admin/login', request.url));
}

export const config = {
  matcher: ['/admin/:path*', '/admin'],
};

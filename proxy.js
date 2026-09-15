// Guard level-edge utk SEMUA halaman panel admin: tanpa session admin yang
// sah (atau pending-2FA utk /admin/verify), request apa pun di bawah /admin
// langsung dilempar ke /admin/login - sebelum route-nya dirender.
// Ini lapisan PERTAMA; tiap halaman + API tetap punya cek sendiri (defense
// in depth). Format cookie = JWT HS256 dgn SESSION_SECRET (lihat lib/session).
//
// DOMAIN KANONIK (2026-09-16): proxy ini juga mengalihkan SEMUA request yang
// datang lewat domain lama/alias (nexogamess.vercel.app, www.nexogames.site)
// ke domain resmi nexogames.site dengan redirect permanen. Jadi user tidak
// pernah "dilempar-lempar" antar domain lagi - satu domain saja.
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const ADMIN_COOKIE = 'nexo_admin_session';
const PENDING_COOKIE = 'nexo_admin_pending';

// Host kanonik + daftar host lama yang harus dialihkan. SENGAJA ditulis ulang
// di sini (bukan import lib/site.js) karena proxy berjalan di edge runtime -
// menjaga file ini mandiri tanpa dependensi app/lib.
const CANONICAL_HOST = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'https://nexogames.site';
  try { return new URL(raw).host; } catch { return 'nexogames.site'; }
})();
const HOST_LAMA = ['nexogamess.vercel.app', `www.${CANONICAL_HOST}`];

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
  const host = request.headers.get('host') || '';

  // === ALIHKAN DOMAIN LAMA -> DOMAIN RESMI ===
  // 308 = permanen + method/body dipertahankan (aman untuk POST form & webhook).
  // Localhost & preview Vercel TIDAK dialihkan supaya dev tetap bisa tes.
  const isDev = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isDev && HOST_LAMA.includes(host)) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${CANONICAL_HOST}`);
    return NextResponse.redirect(target, 308);
  }

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

// CATATAN matcher: dulu hanya /admin, sehingga pengalihan domain TIDAK PERNAH
// berjalan di halaman publik. Sekarang SEMUA path (kecuali aset Next internal
// yang tidak perlu) ikut diperiksa host-nya.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|nexo-logo-256.png|images/).*)',
  ],
};

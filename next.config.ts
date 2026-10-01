import type { NextConfig } from "next";

// ==========================================
// SECURITY HEADERS (audit keamanan 2026-10-01)
// ==========================================
//
// Sebelumnya next.config.ts KOSONG - tidak ada header keamanan sama sekali.
// Risiko yang ditutup:
//   - Clickjacking: situs lain menampilkan NEXO di dalam <iframe> dan
//     memancing user klik tombol yang sebenarnya milik kita.
//   - MIME sniffing: browser menebak tipe file dan menjalankan konten yang
//     seharusnya tidak dieksekusi.
//   - Kebocoran referrer: URL halaman kita (termasuk kode redeem di query)
//     terkirim ke situs lain saat user klik tautan keluar.
//   - XSS: script pihak ketiga yang tidak diizinkan ikut berjalan.
//
// CATATAN CSP: Next.js menyisipkan inline script untuk hydration. Tanpa
// nonce, satu-satunya cara aman-tanpa-memecah-situs adalah 'unsafe-inline'
// untuk script. Itu melemahkan proteksi XSS, TAPI tetap jauh lebih baik
// daripada tanpa CSP sama sekali - karena script hanya boleh dari domain
// yang kita daftarkan (AdSense, Cloudflare, Groq), bukan sembarang domain.
const CSP = [
  "default-src 'self'",
  // Script: Next.js inline (butuh unsafe-inline), AdSense, Cloudflare Turnstile,
  // Google (tag manager/analytics AdSense kadang memuat dari sini).
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://challenges.cloudflare.com https://*.google.com https://*.googlesyndication.com https://*.googleapis.com",
  // Style: Tailwind inline style + Google Fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Font: Next.js font loader memuat dari sini.
  "font-src 'self' data: https://fonts.gstatic.com",
  // Gambar: avatar Discord, logo server, emoji CDN, AdSense.
  "img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net https://*.googleusercontent.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net",
  // Koneksi (fetch/XHR): API internal + Groq (AI admin) + AdSense.
  "connect-src 'self' https://api.groq.com https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net",
  // iframe: AdSense menampilkan iklan di dalam iframe, Turnstile juga.
  "frame-src 'self' https://googleads.g.doubleclick.net https://*.googlesyndication.com https://*.doubleclick.net https://challenges.cloudflare.com https://*.google.com",
  // Form hanya boleh dikirim ke domain sendiri.
  "form-action 'self'",
  // Larang <base> yang bisa membajak URL relatif.
  "base-uri 'self'",
  // Larang object/embed (jalur lama untuk XSS).
  "object-src 'none'",
  // Naikkan otomatis permintaan http ke https.
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  // Anti-clickjacking: tolak render di dalam iframe situs lain.
  // SAMEORIGIN (bukan DENY) supaya pratinjau internal tetap bisa.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Larang browser menebak MIME type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Kirim referrer hanya ke origin (bukan URL lengkap) saat lintas situs.
  // Penting: kode redeem di query string tidak bocor ke situs lain.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Matikan fitur browser yang tidak dipakai (kamera, mikrofon, lokasi).
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Paksa HTTPS selama 1 tahun untuk semua subdomain.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  // Cegah data sensitif ikut ke situs lain lewat referrer.
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Terapkan ke semua route.
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

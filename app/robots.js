import { absoluteUrl } from './lib/site';

// robots.txt - aturan untuk semua crawler.
//
// PENTING untuk kemunculan gambar: crawler gambar Google memakai user-agent
// `Googlebot-Image`. Kalau tidak diizinkan eksplisit, sebagian setup
// mengabaikan gambar situs -> ikon/gambar di hasil pencarian jatuh ke globe.
// Karena itu aturannya dibuat eksplisit di sini meski `*` sudah Allow: /.
export default function robots() {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/me', '/api/', '/no-access'] },
      // Izinkan crawler gambar & aset statis secara eksplisit.
      { userAgent: 'Googlebot-Image', allow: '/' },
      { userAgent: 'Googlebot', allow: ['/', '/nexo-og.png', '/nexo-logo-256.png', '/favicon.ico'] },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}

import { SITE_URL, absoluteUrl } from './lib/site';

// Sitemap: daftar halaman yang boleh di-index Google.
//
// ATURAN yang dipakai di sini:
//   - HANYA halaman PUBLIK yang didaftarkan. Halaman yang butuh login
//     (/me, /admin, /no-access) TIDAK didaftarkan - Google akan melihatnya
//     sebagai halaman kosong/redirect dan itu menurunkan kualitas situs.
//   - `priority` = seberapa penting halaman relatif terhadap yang lain
//     (bukan peringkat, hanya petunjuk). 1.0 = paling penting.
//   - `changeFrequency` = seberapa sering isinya berubah. Ini membantu Google
//     menentukan seberapa sering perlu datang lagi.
export default function sitemap() {
  const now = new Date();
  return [
    // Halaman utama - paling penting, isinya paling kaya kata kunci.
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    // Halaman publik yang isinya berubah terus - bagus untuk SEO.
    {
      url: absoluteUrl('/leaderboard'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/shop'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/bank'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    // Halaman Komunitas: daftar 100 server NEXO teratas + link invite.
    // Isinya berubah terus (peringkat server), jadi changeFrequency daily.
    {
      url: absoluteUrl('/komunitas'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    // Halaman informasi produk - membantu orang menemukan NEXO lewat
    // pencarian seperti "bot discord premium" / "cara main bot discord game".
    {
      url: absoluteUrl('/premium'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: absoluteUrl('/redeem'),
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: absoluteUrl('/login'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    // Halaman kebijakan - wajib ada untuk kredibilitas & kepercayaan Google.
    {
      url: absoluteUrl('/terms-of-service'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: absoluteUrl('/privacy-policy'),
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}

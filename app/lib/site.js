// Pusat konstanta SEO + branding. Ganti SITE_URL lewat env saat deploy.
// Domain publik FINAL NEXO = https://nexogames.site - HANYA SATU domain.
// Domain lain (alias Vercel & www) sudah dihapus; pengalihan www ditangani
// pengaturan domain di Vercel sendiri, bukan oleh kode aplikasi.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://nexogames.site'
).replace(/\/+$/, '');

// Host kanonik (tanpa protokol) - mis. "nexogames.site".
export const CANONICAL_HOST = (() => {
  try { return new URL(SITE_URL).host; } catch { return 'nexogames.site'; }
})();

/**
 * Origin kanonik untuk redirect server-side.
 *
 * KENAPA ADA: dulu semua redirect OAuth memakai `url.origin` (= host dari
 * request). Akibatnya user yang datang lewat domain lain DIBALIKKAN ke domain
 * itu lagi, padahal Discord sudah melemparnya ke domain kanonik - jadi terasa
 * dilempar-lempar antar domain. Sekarang: satu domain saja.
 *
 * ATURAN:
 *   - localhost / 127.0.0.1 -> pakai host+PORT asli (biar dev lokal tidak
 *     terlempar ke produksi saat tes). PENTING: pakai `.host` BUKAN `.hostname`
 *     - `.hostname` membuang port sehingga `localhost:3000` jadi `localhost`
 *     dan dev login rusak (pernah kejadian saat uji).
 *   - selain itu            -> SELALU domain kanonik (nexogames.site)
 *
 * @param {string} [requestUrl] - URL request (dipakai hanya untuk deteksi dev)
 */
export function canonicalOrigin(requestUrl) {
  if (requestUrl) {
    try {
      const u = new URL(requestUrl);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1') {
        return `${u.protocol}//${u.host}`; // host = hostname + port
      }
    } catch { /* URL aneh -> pakai kanonik */ }
  }
  return SITE_URL;
}

export const BOT_INVITE =
  process.env.NEXT_PUBLIC_BOT_INVITE ||
  'https://discord.com/oauth2/authorize?client_id=1497924277301936300&scope=bot+applications.commands&permissions=277025508352';

export const SITE_NAME = 'NEXO Games';
export const STUDIO_NAME = 'xurbaybase';

export const SUPPORT_INVITE =
  process.env.NEXT_PUBLIC_SUPPORT_INVITE || 'https://discord.gg/53mJhsHeAk';

export const SITE_DESCRIPTION =
  'NEXO Games adalah bot Discord gaming dengan 25+ mini-game seru, ekonomi poin, guild war, bank, shop, dan leaderboard: gratis langsung di server Discord kamu. Dikembangkan oleh xurbaybase.';

export const SITE_KEYWORDS = [
  'NEXO Games',
  'bot discord game',
  'bot discord indonesia',
  'discord game bot',
  'bot game discord gratis',
  'mini game discord',
  'discord economy bot',
  'bot discord ekonomi',
  'guild discord',
  'leaderboard discord',
  'autochess discord',
  'xurbaybase',
];

export function absoluteUrl(path = '/') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

// Helper metadata per-halaman: canonical + Open Graph + Twitter card seragam.
export function pageMeta({ title, description, path, type = 'website' }) {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url, type, images: [absoluteUrl('/nexo-og.png')] },
    twitter: { card: 'summary_large_image', title: `${title} | ${SITE_NAME}`, description, images: [absoluteUrl('/nexo-og.png')] },
  };
}

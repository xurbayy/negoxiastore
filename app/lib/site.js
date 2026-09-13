// Pusat konstanta SEO + branding. Ganti SITE_URL lewat env saat deploy.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://nexogamess.vercel.app'
).replace(/\/+$/, '');

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

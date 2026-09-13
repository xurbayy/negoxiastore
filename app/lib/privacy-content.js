import { SITE_URL, absoluteUrl } from './site';

export const METADATA = {
  title: 'Kebijakan Privasi',
  description: 'Data apa yang disimpan bot NEXO Games dan kenapa disimpan. Dijelaskan dengan bahasa sederhana: hanya ID Discord dan progres game, tanpa email, tanpa isi chat.',
  alternates: { canonical: '/privacy-policy' },
  openGraph: {
    title: 'Kebijakan Privasi | NEXO Games',
    description:
      'Data apa yang dikumpulkan bot NEXO Games, bagaimana disimpan, dan bagaimana kami melindunginya.',
    url: absoluteUrl('/privacy-policy'),
    type: 'article',
  },
};

// FAQ + data retention snippet buat rich result Google
export function privacyJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Kebijakan Privasi NEXO Games',
    url: absoluteUrl('/privacy-policy'),
    inLanguage: 'id-ID',
    isPartOf: { '@type': 'WebSite', name: 'NEXO Games', url: SITE_URL },
  };
}

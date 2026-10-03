import './globals.css';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SITE_KEYWORDS, absoluteUrl } from './lib/site';
import { FAQS } from './lib/faq-content';

const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const body = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'NEXO Games | Bot Discord Game, Ekonomi & Guild Indonesia',
    template: '%s | NEXO Games',
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  authors: [{ name: 'xurbaybase' }],
  creator: 'xurbaybase',
  publisher: 'xurbaybase',
  applicationName: SITE_NAME,
  category: 'Games',
  alternates: { canonical: '/' },
  // Verifikasi kepemilikan situs untuk Google AdSense (metode "tag meta").
  // Dicantumkan sebagai CADANGAN di samping ads.txt di public/ads.txt dan
  // script AdSense di <body> - supaya Google punya 3 jalur pembuktian.
  other: {
    'google-adsense-account': 'ca-pub-2706837395470018',
  },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: 'NEXO Games | 25+ Game Seru Langsung di Discord',
    description: SITE_DESCRIPTION,
    images: [
      {
        url: absoluteUrl('/nexo-og.png'),
        width: 1200,
        height: 630,
        // `type` + `secureUrl` membantu crawler (Google/Discord/WhatsApp)
        // memvalidasi gambar tanpa perlu fetch dulu -> lebih cepat tampil.
        type: 'image/png',
        secureUrl: absoluteUrl('/nexo-og.png'),
        alt: 'NEXO Games | Bot Discord Game, Ekonomi & Guild Indonesia',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NEXO Games | 25+ Game Seru Langsung di Discord',
    description: SITE_DESCRIPTION,
    images: [{ url: absoluteUrl('/nexo-og.png'), alt: 'NEXO Games | Bot Discord Game' }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    // favicon.ico didaftarkan PALING DEPAN: ini yang dipakai Google Search,
    // tab browser, dan preview link (Discord/WhatsApp/Telegram). Sebelumnya
    // file ini tidak ada (404) sehingga ikon situs jatuh ke globe default.
    //
    // UKURAN PNG TERPISAH (16/32/48/96) mengikuti rekomendasi resmi Google:
    // Google lebih suka favicon persegi kelipatan 48px. Menyediakan beberapa
    // ukuran membuat ikon tetap tajam di semua perangkat dan mempercepat
    // proses validasi saat crawl - tidak perlu mengecilkan dari 256px.
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-48x48.png', type: 'image/png', sizes: '48x48' },
      { url: '/favicon-96x96.png', type: 'image/png', sizes: '96x96' },
      { url: '/android-chrome-192x192.png', type: 'image/png', sizes: '192x192' },
      { url: '/nexo-logo-256.png', type: 'image/png', sizes: '256x256' },
      { url: '/android-chrome-512x512.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    other: [
      { rel: 'mask-icon', url: '/nexo-logo-512.png', color: '#F4EEE1' },
      { rel: 'manifest', url: '/site.webmanifest' },
    ],
  },
};

export const viewport = {
  themeColor: '#F4EEE1',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'NEXO Games',
      applicationCategory: 'GameApplication',
      operatingSystem: 'Discord',
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      // ImageObject (bukan string biasa): memberi Google informasi TAMBAHAN
      // (ukuran + tipe) sehingga gambar situs lebih mungkin ditampilkan di
      // hasil pencarian & knowledge panel. Ini sinyal yang sering terlewat
      // sampai Google jatuh ke globe default.
      image: {
        '@type': 'ImageObject',
        url: absoluteUrl('/nexo-og.png'),
        width: 1200,
        height: 630,
        caption: 'NEXO Games',
      },
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/nexo-logo-256.png'),
        width: 256,
        height: 256,
      },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
      author: { '@type': 'Organization', name: 'xurbaybase' },
    },
    {
      '@type': 'WebSite',
      name: SITE_NAME,
      // alternateName = alias yang Google pakai untuk mengenali situs saat
      // orang mencari "NEXO" saja (tanpa "Games"). Tanpa ini, pencarian
      // "NEXO" bisa jatuh ke situs lain bernama serupa. Nama tampil tetap
      // SITE_NAME ("NEXO Games") - alternateName hanya membantu pencocokan.
      alternateName: ['NEXO', 'Nexo Games', 'Nexo Games Indonesia', 'NEXO Bot Discord'],
      url: SITE_URL,
      inLanguage: 'id-ID',
      publisher: {
        '@type': 'Organization',
        name: 'xurbaybase',
        url: SITE_URL,
        logo: { '@type': 'ImageObject', url: absoluteUrl('/nexo-logo-256.png'), width: 256, height: 256 },
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

import { getSession } from './lib/session';
import { isUserBanned } from './lib/snapshot';
import CookieConsent from './components/CookieConsent';
import AdSense from './components/AdSense';
import EmojiHydrator from './components/EmojiHydrator';

export default async function RootLayout({ children }) {
  const session = await getSession();
  let banInfo = null;
  if (session?.discordId) {
    banInfo = await isUserBanned(session.discordId);
  }

  return (
    <html lang="id" data-scroll-behavior="smooth" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <AdSense />
        <EmojiHydrator />
        {banInfo ? (
          <main className="relative flex min-h-screen flex-col items-center justify-center px-5 text-center bg-bg text-ink">
            <div className="bg-grid absolute inset-0" aria-hidden="true" />
            <div className="relative z-10 space-y-6 max-w-2xl">
              <h1 className="font-display text-8xl font-extrabold text-danger/20" style={{ textShadow: '0 0 40px rgba(199,75,60,0.12)' }}>404</h1>
              <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
                Akses Ditolak
              </h2>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
                Sistem mendeteksi bahwa akun Discord-mu saat ini sedang <strong>terkena sanksi, bisa ban atau timeout,</strong> atau datamu telah di-wipe dari layanan NEXO.
              </p>
              
              <div className="mx-auto mt-7 flex flex-col items-center justify-center rounded-xl border border-border-soft bg-card-dark p-5 max-w-md">
                <div className="flex items-center w-full justify-center">
                  <span className="font-mono text-sm text-warning">$ nexobot check-status</span>
                </div>
                <div className="mt-3 text-left w-full border-t border-white/10 pt-3 font-mono text-xs text-danger">
                  [!] ACCESS_DENIED<br/>
                  <span className="text-white/50">Reason:</span> {banInfo.reason || 'Pelanggaran ToS'}<br/>
                  {banInfo.timeout_until > 0 ? (
                    <><span className="text-white/50">Timeout expires:</span> {new Date(banInfo.timeout_until).toLocaleString('id-ID')}</>
                  ) : (
                    <><span className="text-white/50">Status:</span> PERMANENT BAN / WIPED</>
                  )}
                </div>
              </div>

              <div className="mt-8 flex items-center justify-center gap-3">
                <a href="/api/auth/logout" className="btn-primary cursor-pointer text-sm">
                  Logout Discord
                </a>
              </div>
            </div>
          </main>
        ) : children}
        <CookieConsent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </body>
    </html>
  );
}

import Link from 'next/link';
import { getSession } from '../lib/session';
import { NexoLogo } from './ui';
import { SUPPORT_INVITE } from '../lib/site';

// Jelajahi (belum login) vs Akun (sudah login) - footer menyesuaikan status.
const NAV_GUEST = [
  { href: '/#games', label: 'Game' },
  { href: '/#fitur', label: 'Fitur' },
  { href: '/#cara-main', label: 'Cara Main' },
  { href: '/#premium', label: 'Premium' },
  { href: '/#faq', label: 'FAQ' },
];
const NAV_MEMBER = [
  { href: '/me', label: 'Profil Saya' },
  { href: '/shop', label: 'Shop' },
  { href: '/redeem', label: 'Redeem' },
  { href: '/premium', label: 'NEXOPASS' },
];
const NAV_LEGAL = [
  { href: '/privacy-policy', label: 'Kebijakan Privasi' },
  { href: '/terms-of-service', label: 'Ketentuan Layanan' },
  { href: SUPPORT_INVITE, label: 'Server Discord', external: true },
];

export default async function Footer() {
  const session = await getSession();
  const NAV = [
    ...(session ? NAV_MEMBER : NAV_GUEST),
    ...NAV_LEGAL,
  ];
  return (
    <footer className="border-t border-border-soft/70 bg-bg py-12">
      <div className="mx-auto max-w-6xl px-5">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row">
          <div className="max-w-sm">
            <Link href="/" className="flex w-fit items-center gap-2.5 cursor-pointer" aria-label="NEXO Games - Beranda">
              <NexoLogo size={32} />
              <span className="font-display text-lg text-ink">
                NEXO<span className="text-ink"> Games</span>
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">
              Bot Discord gaming dengan 25+ game, ekonomi poin, guild war, dan leaderboard.
              Dikembangkan oleh <strong className="text-ink">xurbaybase</strong> studio.
            </p>
          </div>

          <nav aria-label="Navigasi footer">
            <h3 className="text-xs font-bold uppercase tracking-widest text-ink-muted">{session ? 'Akun' : 'Jelajahi'}</h3>
            <ul className="mt-4 space-y-2.5">
              {NAV.map((l) => (
                <li key={l.href}>
                  {l.external ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-ink-muted transition-colors hover:text-ink cursor-pointer"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      href={l.href}
                      className="text-sm text-ink-muted transition-colors hover:text-ink cursor-pointer"
                    >
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-ink-muted">Perintah Cepat</h3>
            <ul className="mt-4 space-y-2.5 font-mono text-sm text-ink-muted">
              <li><code className="text-ink">nxhelp</code>: panduan lengkap</li>
              <li><code className="text-ink">nxdaily</code>: klaim poin harian</li>
              <li><code className="text-ink">np slot</code>: main slot</li>
              <li><code className="text-ink">nxlb</code>: leaderboard</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border-soft/60 pt-6 text-xs text-ink-muted md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} NEXO Games · oleh xurbaybase. Semua hak dilindungi.</p>
          <p>Poin NEXO bersifat virtual dan tidak memiliki nilai uang asli.</p>
        </div>
      </div>
    </footer>
  );
}

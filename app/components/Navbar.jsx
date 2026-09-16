'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { NexoLogo, DiscordIcon } from './ui';
import Notifications from './Notifications';
import FeedbackButton from './FeedbackButton';

const LINKS_GUEST = [
  { href: '/#games', label: 'Game' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/#cara-main', label: 'Cara Main' },
];
const LINKS_MEMBER = [
  { href: '/#games', label: 'Game' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/shop', label: 'Shop' },
  { href: '/redeem', label: 'Redeem' },
];
// Legal digabung ke dropdown "Info" (desktop) / daftar biasa (mobile).
const LEGAL = [
  { href: '/privacy-policy', label: 'Kebijakan Privasi' },
  { href: '/terms-of-service', label: 'Ketentuan Layanan' },
];

// Navbar dinamis: belum login = tombol Login; member = avatar+username.
// Link Admin muncul hanya untuk member di NEXT_PUBLIC_ADMIN_IDS.
export default function Navbar({ session, premiumActive = false }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // Status premium LIVE (poling /api/me seperti bel notif) supaya pill hijau
  // ngayal sendiri setelah grant masuk, tanpa nunggu refresh manual.
  const [livePremium, setLivePremium] = useState(null);
  const discordId = session?.discordId || null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Sinkron ulang ke nilai server setiap router.refresh() (mis. revoke terdeteksi).
  useEffect(() => {
    const t = setTimeout(() => setLivePremium(null), 0);
    return () => clearTimeout(t);
  }, [premiumActive, discordId]);

  useEffect(() => {
    if (!discordId) return undefined;
    let stop = false;
    async function check() {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const d = await res.json();
        if (stop || !d?.authenticated) return;
        const p = d?.profile?.profile?.premium;
        // Bot boleh mengirim premium sebagai boolean ATAU objek {expiresAt,
        // lifetime}. Objek dengan expiry lampau = sudah lepas.
        const active =
          p === true ||
          (p && typeof p === 'object' && (p.lifetime || Number(p.expiresAt) > Date.now()));
        setLivePremium(Boolean(active));
      } catch {}
    }
    const t = setTimeout(check, 0);
    const iv = setInterval(check, 15000);
    function onFocus() { check(); }
    window.addEventListener('focus', onFocus);
    return () => {
      stop = true;
      clearTimeout(t);
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, [discordId]);

  const showPremium = livePremium ?? premiumActive;

  const LINKS = session ? LINKS_MEMBER : LINKS_GUEST;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'border-b border-border-soft bg-bg/90 py-2.5 backdrop-blur-xl'
          : 'bg-transparent py-4'
      }`}
    >
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between px-5"
        aria-label="Navigasi utama"
      >
        <Link href="/" className="flex items-center gap-2.5 leading-none cursor-pointer" aria-label="NEXO Games - Beranda">
          <span className="flex shrink-0 items-center"><NexoLogo size={36} /></span>
          <span className="hidden font-display text-lg font-bold tracking-tight text-ink lg:inline">
            NEXO Games
          </span>
        </Link>

        <ul className="hidden items-center gap-5 md:flex lg:gap-7">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="text-sm font-medium text-ink-muted transition-colors duration-200 hover:text-ink cursor-pointer"
              >
                {l.label}
              </Link>
            </li>
          ))}
          <li className="relative">
            <details className="group">
              <summary className="list-none cursor-pointer rounded-md px-1 py-1 text-sm font-medium text-ink-muted transition-colors duration-200 hover:text-ink">
                Info
              </summary>
              <div className="invisible absolute right-0 top-full z-50 w-48 rounded-xl border border-border-soft bg-card-cream p-1.5 opacity-0 shadow-[0_12px_32px_rgba(43,33,24,0.14)] transition-all duration-150 group-focus-within:visible group-hover:visible group-hover:opacity-100 group-focus-within:opacity-100">
                {LEGAL.map((l) => (
                  <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:bg-bg-soft hover:text-ink cursor-pointer">
                    {l.label}
                  </Link>
                ))}
              </div>
            </details>
          </li>
          {session && (
            <li>
              <Link
                href="/premium"
                className={showPremium
                  ? 'inline-flex items-center gap-1.5 rounded-lg border border-success/50 bg-white px-3.5 py-1.5 text-sm font-semibold text-success shadow-sm transition hover:-translate-y-px hover:bg-success hover:text-white active:translate-y-0 active:shadow-none cursor-pointer'
                  : 'inline-flex items-center gap-1.5 rounded-lg border border-accent/60 bg-white px-3.5 py-1.5 text-sm font-semibold text-accent-hover shadow-sm transition hover:-translate-y-px hover:bg-accent hover:text-ink active:translate-y-0 active:shadow-none cursor-pointer'}
              >
                {showPremium ? '✓ NEXOPASS' : 'NEXOPASS'}
              </Link>
            </li>
          )}
        </ul>

        {/* Cluster kanan: lonceng + feedback tampil DI SEMUA ukuran (dulu
            tersembunyi di mobile karena nempel di <ul hidden md:flex>). */}
        <div className="flex items-center gap-2 md:gap-3">
          {session && (
            <>
              <Notifications />
              <FeedbackButton />
              <Link href="/me" className="hidden items-center gap-2 md:flex cursor-pointer">
                {session.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full border border-border-soft" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-hover">
                    {(session.username || '?').slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[110px] truncate text-sm font-semibold text-ink xl:inline">{session.username}</span>
              </Link>
            </>
          )}
          {!session && (
            <>
              <Link
                href="/premium"
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/60 bg-white px-3.5 py-1.5 text-sm font-semibold text-accent-hover shadow-sm transition hover:-translate-y-px hover:bg-accent hover:text-ink active:translate-y-0 active:shadow-none cursor-pointer"
              >
                NEXOPASS
              </Link>
              <Link href="/login" className="btn-primary hidden px-5! py-2! text-sm md:inline-flex cursor-pointer">
                <DiscordIcon className="h-4 w-4" />
                Login
              </Link>
            </>
          )}
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-soft text-ink md:hidden cursor-pointer"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-border-soft bg-bg/95 backdrop-blur-xl md:hidden">
          <ul className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-4">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-bg-soft hover:text-ink cursor-pointer"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            {LEGAL.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-bg-soft hover:text-ink cursor-pointer"
                >
                  {l.label}
                </Link>
              </li>
            ))}
            {!session && (
              <li>
                <Link href="/premium" onClick={() => setOpen(false)} className="block rounded-lg border border-accent/60 bg-white px-3 py-2.5 text-sm font-semibold text-accent-hover shadow-sm cursor-pointer">
                  NEXOPASS
                </Link>
              </li>
            )}
            {session && (
              <li>
                <Link href="/premium" onClick={() => setOpen(false)} className={showPremium ? 'block rounded-lg border border-success/50 bg-white px-3 py-2.5 text-sm font-semibold text-success shadow-sm cursor-pointer' : 'block rounded-lg border border-accent/60 bg-white px-3 py-2.5 text-sm font-semibold text-accent-hover shadow-sm cursor-pointer'}>
                  {showPremium ? '✓ NEXOPASS' : 'NEXOPASS'}
                </Link>
              </li>
            )}
            <li className="mt-2">
              {session ? (
                <Link href="/me" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg border border-border-soft px-3 py-2.5 cursor-pointer">
                  {session.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.avatar} alt="" width={28} height={28} className="h-7 w-7 rounded-full border border-border-soft" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-hover">
                      {(session.username || '?').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-ink">{session.username}</span>
                </Link>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className="btn-primary w-full text-sm cursor-pointer">
                  <DiscordIcon className="h-4 w-4" />
                  Login
                </Link>
              )}
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}

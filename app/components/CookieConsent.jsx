'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Cookie consent ala web besar, tapi versi jujur: NEXO hanya memakai cookie
// ESENSIAL (sesi login + 2FA) - tanpa analitik/tracking. Keputusan user
// disimpan di localStorage (bukan cookie), cukup sekali seumur perangkat.
export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem('nexo_cookie_ok')) setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  function accept() {
    try { localStorage.setItem('nexo_cookie_ok', '1'); } catch {}
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Pemberitahuan cookie"
      className="fixed inset-x-4 bottom-4 z-[90] md:inset-x-auto md:right-6 md:bottom-6 md:max-w-sm"
    >
      <div className="rounded-2xl border border-border-soft bg-bg/95 p-5 shadow-xl backdrop-blur-xl">
        <p className="font-display text-sm font-bold text-ink">Kami pakai cookie, tapi bukan yang bikin was-was.</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          NEXO Games hanya menyimpan cookie fungsional supaya kamu tetap login, notifikasi dan
          premium-mu terbawa, plus keamanan 2FA admin. Tidak ada cookie pelacak, tidak ada
          iklan, tidak ada pihak ketiga.{' '}
          <Link href="/privacy-policy" className="font-semibold text-accent-hover underline-offset-2 hover:underline cursor-pointer">
            Kebijakan Privasi
          </Link>
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={accept} className="btn-primary flex-1 justify-center px-4! py-2! text-sm cursor-pointer">
            Mengerti
          </button>
          <a
            href="/privacy-policy"
            className="text-xs font-semibold text-ink-muted transition-colors hover:text-ink cursor-pointer"
          >
            Pelajari dulu
          </a>
        </div>
      </div>
    </div>
  );
}

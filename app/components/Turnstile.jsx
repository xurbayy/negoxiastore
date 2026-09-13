'use client';

import { useEffect, useRef, useState } from 'react';

// Widget Cloudflare Turnstile ringan: script di-load sekali, widget dirender
// ke div kosong. Token keluar via onToken; expire/reset ditangani sendiri.
export default function Turnstile({ onToken, theme = 'light', size = 'normal' }) {
  const boxRef = useRef(null);
  const [ready, setReady] = useState(false);
  const tokenCb = useRef(onToken);
  useEffect(() => { tokenCb.current = onToken; }, [onToken]);

  useEffect(() => {
    let cancelled = false;

    function render() {
      const w = window.turnstile;
      if (!w || !boxRef.current) return;
      w.render(boxRef.current, {
        sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
        theme,
        size,
        callback: (token) => tokenCb.current?.(token),
        'expired-callback': () => tokenCb.current?.(null),
        'error-callback': () => tokenCb.current?.(null),
      });
      setReady(true);
    }

    function boot() {
      if (window.turnstile) { render(); return; }
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      s.onload = () => !cancelled && render();
      document.head.appendChild(s);
    }
    boot();
    return () => { cancelled = true; };
  }, [theme, size]);

  // Widget belum kebaca (sitekey salah / jaringan blokir) -> jangan bikin
  // form mati: beri info halus kalau 6 detik gak muncul.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [ready]);

  return (
    <div>
      <div ref={boxRef} aria-label="Verifikasi manusia (Turnstile)" />
      {!ready && slow && <p className="mt-1 text-[0.65rem] text-ink-muted">Verifikasi tidak muncul? Muat ulang halaman ini.</p>}
    </div>
  );
}

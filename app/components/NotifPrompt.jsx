'use client';

import { useCallback, useEffect, useState } from 'react';

// ==========================================
// NotifPrompt — tawaran aktifkan notifikasi perangkat
// ==========================================
// Popup kecil di bawah layar (gaya CookieConsent) yang menawarkan user
// mengaktifkan notifikasi push. SANTAI & TIDAK MEMAKSA:
//   - Muncul hanya untuk user LOGIN yang BELUM menyalakan notifikasi.
//   - Max 1x per 7 hari (localStorage) - bukan spam.
//   - Selalu bisa ditutup (X / Escape / "Nanti dulu").
//   - Tidak menghalangi halaman (strip kecil di bawah, bukan modal).
//
// Per-perangkat: toggle on/off disimpan per browser (localStorage + push
// subscription endpoint unik per device). Tidak ada konsep "user aktifkan
// semua perangkat sekaligus".
const KUNCI_NEXT = 'nexo_notif_prompt_next';
const JEDA_HARI = 7;

function b64ToU8(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotifPrompt() {
  const [show, setShow] = useState(false);
  const [vapid, setVapid] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        // Cek masa jeda (max 1x per 7 hari)
        const next = Number(localStorage.getItem(KUNCI_NEXT) || 0);
        if (next > Date.now()) return;

        // Izin sudah ditolak? Jangan paksa.
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;

        // Cek login + push tersedia
        const res = await fetch('/api/me/push', { cache: 'no-store' });
        if (res.status !== 200) return; // tamu
        const d = await res.json().catch(() => ({}));
        if (!d.tersedia) return;
        if (d.aktif) return; // sudah aktif

        // Cek apakah perangkat ini sudah subscribe
        if ('serviceWorker' in navigator && 'PushManager' in window) {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = reg ? await reg.pushManager.getSubscription() : null;
          if (sub) return;
        }

        setVapid(d.vapid);
        setShow(true);
      } catch { /* diamkan */ }
    }, 4000); // tunda 4 dtk supaya tidak muncul bareng cookie consent
    return () => clearTimeout(t);
  }, []);

  // Escape menutup
  useEffect(() => {
    if (!show) return;
    function onKey(e) { if (e.key === 'Escape') tolak(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show]);

  const tolak = useCallback(() => {
    try { localStorage.setItem(KUNCI_NEXT, String(Date.now() + JEDA_HARI * 86400000)); } catch {}
    setShow(false);
  }, []);

  const aktifkan = useCallback(async () => {
    setSibuk(true);
    try {
      if (Notification.permission !== 'granted') {
        const izin = await Notification.requestPermission();
        if (izin !== 'granted') { tolak(); return; }
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToU8(vapid),
        });
      }
      await fetch('/api/me/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aksi: 'subscribe', subscription: sub.toJSON() }),
      });
      setShow(false);
    } catch {
      tolak();
    } finally {
      setSibuk(false);
    }
  }, [vapid, tolak]);

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Tawaran notifikasi"
      className="fixed inset-x-3 bottom-3 z-[88] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:max-w-sm"
    >
      <div className="relative rounded-2xl border border-border-soft bg-bg/95 p-4 pr-10 shadow-xl backdrop-blur-xl">
        <button
          type="button"
          onClick={tolak}
          aria-label="Tutup tawaran notifikasi"
          title="Tutup"
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-white/10 hover:text-ink cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <p className="font-display text-sm font-bold text-ink">Aktifkan Notifikasi?</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          Dapatkan info penting (NEXO Pass aktif, item diterima, pengumuman resmi)
          langsung di perangkat kamu.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={aktifkan}
            disabled={sibuk}
            className="btn-primary px-4! py-1.5! text-sm cursor-pointer disabled:opacity-50"
          >
            {sibuk ? '...' : 'Aktifkan'}
          </button>
          <button
            type="button"
            onClick={tolak}
            className="btn-ghost px-4! py-1.5! text-sm cursor-pointer"
          >
            Nanti dulu
          </button>
        </div>
      </div>
    </div>
  );
}

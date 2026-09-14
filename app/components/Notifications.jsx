'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

function countdown(expiresAt) {
  const s = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

// Bel notifikasi v3: personal (admin/broadcast) + turunan snapshot.
// Penutupan TIDAK lagi di localStorage - disimpan ke DB per user, jadi notif
// yang sudah di-clear tetap hilang walau ganti perangkat, cache dibersihkan,
// atau bot/web mati-nyala. Notifikasi baru (isi berbeda) tetap muncul.
//
// PENTING (anti-kedip): dulu di sini ada `if (!enabled) return null` sehingga
// tiap ganti halaman komponen mount ulang, fetch ulang, dan tombol lonceng
// HILANG dulu lalu muncul lagi (kedip) - padahal tombol sebelahnya (Feedback)
// tidak begitu. Sekarang tombol SELALU dirender sejak awal; yang disembunyikan
// hanya status "sudah pasti tamu" (401), bukan status "sedang memuat".
export default function Notifications() {
  const [items, setItems] = useState([]);
  // null = belum tahu (masih memuat). true = ada sesi. false = tamu.
  const [enabled, setEnabled] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/notifications', { cache: 'no-store' });
      if (res.status === 401) { setEnabled(false); return; }
      const d = await res.json();
      setEnabled(true);
      // Kalau muat gagal, pertahankan daftar sebelumnya (jangan kosongkan).
      setItems((prev) => (Array.isArray(d.notifications) ? d.notifications : prev));
    } catch {
      // Gagal jaringan: jangan turunkan ke "tamu" kalau sebelumnya sudah tahu
      // ada sesi - biar tombol tidak berkedip hilang.
      setEnabled((e) => (e === false ? false : e));
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 0);
    const iv = setInterval(load, 15000);
    function onFocus() { load(); }
    window.addEventListener('focus', onFocus);
    return () => { clearTimeout(t); clearInterval(iv); window.removeEventListener('focus', onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Hanya sembunyikan kalau sudah PASTI tamu. Selama memuat (null) tombol tetap
  // tampil supaya tidak ada kedip saat berpindah halaman.
  if (enabled === false) return null;

  // Server SUDAH menyaring yang pernah ditutup -> tampil apa adanya.
  const visible = items.filter((n) => !n.read);
  const unreadVisible = visible.length;

  async function markRead(n) {
    try {
      // Satu endpoint menangani keduanya: id "p:<angka>" menandai read_at
      // notifikasi personal, id "d:<key>" menyimpan penutupan turunan secara
      // permanen di DB (web_notif_dismiss) - lihat api/me/notifications/read.
      await fetch('/api/me/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: n.id }),
      });
      if (n.id.startsWith('d:')) {
        // Turunan: server menyimpannya sebagai dismiss permanen -> buang dari
        // daftar lokal supaya langsung hilang tanpa menunggu poll berikutnya.
        setItems((arr) => arr.filter((x) => x.id !== n.id));
        return;
      }
      setItems((arr) => arr.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    } catch {}
  }

  async function markAllRead() {
    const derivedIds = items.filter((n) => !n.read && n.id.startsWith('d:')).map((n) => n.id);
    try {
      await fetch('/api/me/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch {}
    // turunan yang tersisa ditutup permanen via dismiss endpoint (bulk)
    if (derivedIds.length) {
      try {
        await fetch('/api/me/notifications/dismiss', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: derivedIds }),
        });
      } catch {}
    }
    setItems((arr) => arr.filter((x) => !x.id.startsWith('d:')).map((x) => ({ ...x, read: true })));
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifikasi${unreadVisible ? ` (${unreadVisible} belum dibaca)` : ''}`}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-card-cream text-ink transition hover:bg-bg-soft cursor-pointer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadVisible > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white">
            {unreadVisible > 9 ? '9+' : unreadVisible}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-[min(17rem,calc(100vw-2.5rem))] sm:w-80 overflow-hidden rounded-2xl border border-border-soft bg-card-cream shadow-[0_12px_32px_rgba(43,33,24,0.14)]">
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink">Notifikasi</p>
              <p className="text-xs text-ink-muted">{unreadVisible > 0 ? `${unreadVisible} belum dibaca` : 'Semua sudah dibaca'}</p>
            </div>
            {unreadVisible > 0 && (
              <button type="button" onClick={markAllRead} className="text-xs font-semibold text-accent-hover hover:underline cursor-pointer">
                Tandai dibaca
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-muted">
              Belum ada notifikasi. Kabar kode promo & event akan muncul di sini!
            </p>
          ) : (
            <ul className="max-h-64 sm:max-h-96 divide-y divide-border-soft/70 overflow-y-auto">
              {visible.map((n) => (
                <li key={n.id} className={`px-4 py-3 ${n.read ? '' : 'bg-accent/5'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {n.type === 'token' && <span className="mr-1.5 rounded-full bg-success px-2 py-0.5 font-mono text-[0.6rem] font-extrabold text-white">KODE</span>}
                        {n.type === 'event' && n.title.startsWith('FLASH') && <span className="mr-1.5 rounded-full bg-danger px-2 py-0.5 font-mono text-[0.6rem] font-extrabold text-white">SALE</span>}
                        {n.title}
                      </p>
                      {n.body && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{n.body}</p>}
                      {n.expiresAt && (
                        <p className="mt-0.5 text-xs font-semibold text-danger">Berakhir dalam {countdown(n.expiresAt)}</p>
                      )}
                    </div>
                    {!n.read && (
                      <button type="button" onClick={() => markRead(n)} aria-label="Tandai dibaca" className="shrink-0 text-ink-faint transition hover:text-ink cursor-pointer">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {n.code && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(n.code)}
                        className="rounded bg-bg-soft px-2 py-1 font-mono text-xs font-bold text-ink transition hover:bg-border-soft cursor-pointer"
                        title="Klik untuk copy"
                      >
                        {n.code} ⧉
                      </button>
                    )}
                    {n.type === 'token' && n.code && (
                      <Link href={`/redeem?code=${n.code}`} onClick={() => setOpen(false)} className="btn-primary px-3! py-1.5! text-xs cursor-pointer">
                        Klaim
                      </Link>
                    )}
                    {n.link && !n.code && (
                      <Link href={n.link} onClick={() => setOpen(false)} className="text-xs font-semibold text-accent-hover hover:underline cursor-pointer">
                        Buka
                      </Link>
                    )}
                    {n.id.startsWith('d:') && (
                      <button
                        type="button"
                        onClick={() => markRead(n)}
                        className="ml-auto text-[0.7rem] text-ink-faint underline-offset-2 hover:underline cursor-pointer"
                      >
                        Tutup
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

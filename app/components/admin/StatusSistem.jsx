'use client';

import { useEffect, useState } from 'react';
import { fmt, timeAgo } from '../../lib/formatClient';

// ==========================================
// StatusSistem — pita status layanan (DB, bot, AI, pembayaran).
// ==========================================
// Dipindah dari Dashboard ke Terminal VPS (permintaan pemilik 2026-10-05):
// info status sistem lebih nyambung duduk bersama kontrol server.
export default function StatusSistem() {
  const [h, setH] = useState(null);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    let hidup = true;
    const muat = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (hidup) { setH(d); setGagal(false); }
      } catch {
        if (hidup) setGagal(true);
      }
    };
    muat();
    const iv = setInterval(() => { if (!document.hidden) muat(); }, 30000);
    document.addEventListener('visibilitychange', function onVis() { if (!document.hidden) muat(); });
    return () => { hidup = false; clearInterval(iv); };
  }, []);

  if (gagal) {
    return (
      <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
        Tidak bisa membaca /api/health. Cek koneksi.
      </div>
    );
  }
  if (!h) {
    return (
      <div className="nx-card px-4 py-3 text-xs text-ink-muted">
        <span className="pulse-dot" aria-hidden="true" /> Memeriksa status sistem...
      </div>
    );
  }

  const URUT = [
    ['database', 'Database'],
    ['bot', 'Bot Discord'],
    ['ai', 'AI'],
    ['pembayaran', 'Pembayaran'],
  ];
  const warna = (s) => s === 'operational' ? 'text-success' : (s === 'not_configured' || s === 'unknown' ? 'text-ink-muted' : 'text-danger');
  const titik = (s) => s === 'operational' ? 'bg-success' : (s === 'not_configured' || s === 'unknown' ? 'bg-ink-faint' : 'bg-danger');
  const labelStatus = (s) => s === 'operational' ? 'Operational' : (s === 'not_configured' ? 'Belum diatur' : (s === 'unknown' ? 'Tidak diketahui' : 'Gangguan'));

  return (
    <div className={`nx-card px-4 py-4 sm:px-5 ${h.ok ? '' : 'border-danger/40'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base text-ink">Status Sistem</h2>
        <span className={`text-xs font-bold ${h.ok ? 'text-success' : 'text-danger'}`}>
          {h.ok ? '● Semua Normal' : '⚠ Ada Gangguan'}
        </span>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {URUT.map(([key, label]) => {
          const s = h.layanan?.[key] || { status: 'unknown' };
          return (
            <li key={key} className="rounded-xl border border-border-soft bg-bg-soft/40 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${titik(s.status)}`} aria-hidden="true" />
                <span className="truncate font-semibold text-ink">{label}</span>
              </div>
              <p className={`mt-0.5 text-[0.7rem] font-bold ${warna(s.status)}`}>{labelStatus(s.status)}</p>
              {key === 'database' && s.latensiMs != null && (
                <p className="text-[0.65rem] text-ink-muted">{s.latensiMs}ms · {fmt(s.totalUser)} user · {fmt(s.itemToko)} item</p>
              )}
              {key === 'bot' && s.umurMenit != null && (
                <p className="text-[0.65rem] text-ink-muted">{s.umurMenit === 0 ? 'baru saja' : `${s.umurMenit} menit lalu`}</p>
              )}
              {key === 'ai' && (
                <p className="text-[0.65rem] text-ink-muted">{fmt(s.providerKustom)} provider{s.kunciEnv ? ' · kunci env ada' : ''}</p>
              )}
              {key === 'pembayaran' && s.orderPending != null && (
                <p className="text-[0.65rem] text-ink-muted">{fmt(s.orderPending)} order pending</p>
              )}
              {s.catatan && <p className="mt-0.5 text-[0.65rem] text-danger">{s.catatan}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[0.65rem] text-ink-faint">
        Diperiksa {timeAgo(new Date(h.waktu).getTime())} · total {h.totalMs}ms
      </p>
    </div>
  );
}

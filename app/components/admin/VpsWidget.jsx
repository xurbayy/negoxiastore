'use client';

import { useCallback, useEffect, useState } from 'react';

// ==========================================
// VpsWidget — popup kecil mengambang di pojok kanan bawah panel admin.
// ==========================================
// Permintaan pemilik 2026-10-05: saat membuka halaman/tab admin mana pun,
// tampilkan info VPS penting (CPU, RAM, Uptime, Disk) dalam satu popup kecil
// yang bisa dilipat. Info ini penting untuk tahu kondisi server tanpa harus
// pindah ke tab "Terminal VPS".
//
// Sumber data: /api/admin/vps (sama dengan Terminal VPS). Poll 8 detik,
// HANYA saat tab browser terlihat (tidak boros saat layar ditinggal).
function fmtUptime(detik) {
  if (!Number.isFinite(detik)) return '-';
  const d = Math.floor(detik / 86400);
  const h = Math.floor((detik % 86400) / 3600);
  const m = Math.floor((detik % 3600) / 60);
  if (d > 0) return `${d}h ${h}j ${m}m`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

// Warna indikator: hijau <75, oranye 75-89, merah >=90.
function warna(p) {
  if (!Number.isFinite(p)) return 'vps-dot-ok';
  if (p >= 90) return 'vps-dot-bad';
  if (p >= 75) return 'vps-dot-warn';
  return 'vps-dot-ok';
}
function fill(p) {
  if (!Number.isFinite(p)) return 'rgba(123,160,91,1)';
  if (p >= 90) return '#C74B3C';
  if (p >= 75) return '#F19A1A';
  return '#7BA05B';
}

function Baris({ label, nilai, persen }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold text-white">{nilai}</span>
      </div>
      {persen != null && (
        <div className="vps-row-line">
          <div className="vps-row-fill" style={{ width: `${Math.max(0, Math.min(100, persen || 0))}%`, background: fill(persen) }} />
        </div>
      )}
    </div>
  );
}

export default function VpsWidget() {
  const [st, setSt] = useState(null);
  const [open, setOpen] = useState(false);

  const muat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/vps', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setSt(d);
    } catch { /* diamkan - widget tidak boleh mengganggu */ }
  }, []);

  useEffect(() => {
    muat();
    const iv = setInterval(() => { if (!document.hidden) muat(); }, 8000);
    const onVis = () => { if (!document.hidden) muat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [muat]);

  const v = st?.vps;
  const b = st?.bot;
  const cpu = v?.cpuPersen;
  const ram = v?.ram?.persen;
  const disk = v?.disk?.persen;

  // Ringkas 1 baris saat tertutup: CPU & RAM (info paling penting).
  return (
    <div className="vps-widget">
      <button
        type="button"
        className="vps-widget-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Tutup info VPS' : 'Buka info VPS'}
      >
        <span className={`vps-dot ${b?.aktif ? 'vps-dot-ok' : 'vps-dot-bad'}`} aria-hidden="true" />
        <span className="flex-1 font-bold tracking-wide text-white">VPS</span>
        {!open && (
          <span className="font-mono text-[0.7rem] text-slate-300">
            CPU {cpu ?? '-'}% · RAM {ram ?? '-'}%
          </span>
        )}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      {open && (
        <div className="vps-widget-body">
          <Baris label="CPU" nilai={`${cpu ?? '-'}%`} persen={cpu} />
          <Baris label="RAM" nilai={`${ram ?? '-'}%`} persen={ram} />
          <Baris label="Disk" nilai={`${disk ?? '-'}%`} persen={disk} />
          <div className="mt-0.5 grid grid-cols-2 gap-x-2 gap-y-1 border-t border-white/10 pt-2">
            <span className="text-slate-400">Uptime</span>
            <span className="text-right font-semibold text-white">{fmtUptime(v?.uptimeVpsDetik)}</span>
            <span className="text-slate-400">Bot</span>
            <span className={`text-right font-semibold ${b?.aktif ? 'text-[#7BA05B]' : 'text-[#C74B3C]'}`}>
              {b?.aktif ? `Online${b?.memMb != null ? ` · ${b.memMb} MB` : ''}` : 'Offline'}
            </span>
            {v?.load && (
              <>
                <span className="text-slate-400">Load</span>
                <span className="text-right font-mono text-white">{v.load.m1}/{v.load.m5}/{v.load.m15}</span>
              </>
            )}
          </div>
          {v?.disk && (
            <p className="text-[0.65rem] text-slate-500">{v.disk.usedGb} / {v.disk.totalGb} GB disk terpakai</p>
          )}
        </div>
      )}
    </div>
  );
}

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
  // Uptime tick LOKAL: data server di-refresh tiap beberapa detik, tapi
  // detik berjalan dihitung di browser supaya angka uptime terasa hidup
  // (tidak "beku" di menit yang sama selama polling).
  const [tick, setTick] = useState(0);

  const muat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/vps', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) { setSt(d); setTick((t) => t + 1); }
    } catch { /* diamkan - widget tidak boleh mengganggu */ }
  }, []);

  useEffect(() => {
    muat();
    // Poll adaptif: saat TERBUKA 5 dtk (user sedang melihat - harus real-time),
    // saat tertutup 10 dtk (hemat). Hanya saat tab terlihat.
    const iv = setInterval(() => { if (!document.hidden) muat(); }, open ? 5000 : 10000);
    const onVis = () => { if (!document.hidden) muat(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [muat, open]);

  // Tick tiap 10 dtk untuk memperbarui uptime yang berjalan (tanpa fetch).
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 10000);
    return () => clearInterval(t);
  }, []);

  const v = st?.vps;
  const b = st?.bot;
  const cpu = v?.cpuPersen;
  const ram = v?.ram?.persen;
  const disk = v?.disk?.persen;
  // FIX 2026-10-06: bedakan "sedang start" vs "beku" (lihat TerminalVps.jsx).
  // Bot yang baru di-restart jangan dicap BEKU - API-nya butuh ~11-16 dtk
  // untuk listen; vonis dini bikin user restart berulang ("beku mulu").
  // Fallback uptime < 90 dtk dipakai supaya web tetap benar walau agent
  // VPS belum ikut di-update (field sedangMulai belum ada).
  const uptimeDetik = b?.uptime?.detik;
  const uptimeMuda = Number.isFinite(uptimeDetik) && uptimeDetik < 90;
  const sedangMulai = Boolean(b?.aktif && b?.responsif === false && (b?.sedangMulai || uptimeMuda));
  const beku = Boolean(b?.aktif && b?.responsif === false && !b?.sedangMulai && !uptimeMuda);
  // Uptime BERJALAN: uptime saat data diambil + umur data (dari timestamp
  // server `sekarang`). `tick` cuma memaksa re-render tiap 10 dtk supaya
  // angkanya ikut naik walau fetch belum datang.
  const uptimeJalan = Number.isFinite(v?.uptimeVpsDetik)
    ? v.uptimeVpsDetik + Math.max(0, Math.round((Date.now() - (v?.sekarang || Date.now())) / 1000))
    : null;

  // Ringkas 1 baris saat tertutup: CPU & RAM (info paling penting).
  // Kelas "terbuka" dipasang supaya CSS mobile melebarkan widget saat dibuka.
  return (
    <div className={`vps-widget ${open ? 'terbuka' : ''}`}>
      <button
        type="button"
        className="vps-widget-head"
        onClick={() => { setOpen((o) => !o); muat(); }}
        aria-expanded={open}
        aria-label={open ? 'Tutup info VPS' : 'Buka info VPS'}
      >
        <span className={`vps-dot ${beku ? 'vps-dot-bad' : (b?.aktif ? (sedangMulai ? 'vps-dot-warn' : 'vps-dot-ok') : 'vps-dot-bad')}`} aria-hidden="true" />
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
            <span className="text-right font-semibold text-white">{fmtUptime(uptimeJalan)}</span>
            <span className="text-slate-400">Bot</span>
            <span className={`text-right font-semibold ${beku ? 'text-[#F19A1A]' : (b?.aktif ? (sedangMulai ? 'text-[#F19A1A]' : 'text-[#7BA05B]') : 'text-[#C74B3C]')}`}>
              {beku ? 'BEKU - pakai Restart Paksa' : (b?.aktif ? (sedangMulai ? 'Sedang mulai' : `Online${b?.memMb != null ? ` · ${b.memMb} MB` : ''}`) : 'Offline')}
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
          <p className="text-[0.6rem] text-slate-600">Live · diperbarui tiap 5 dtk saat dibuka</p>
        </div>
      )}
    </div>
  );
}

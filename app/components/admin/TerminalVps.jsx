'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ==========================================
// TerminalVps — panel kontrol VPS di admin
// ==========================================
// Kartu live: CPU, RAM, Uptime, vCPU, Ping WS, memori bot, disk.
// Tombol: Restart / Stop / Start bot (lewat /api/admin/vps -> bot -> systemctl).
// Polling 5 detik (ringan, endpoint lokal di VPS).
function fmtUptime(detik) {
  if (!Number.isFinite(detik)) return '-';
  const d = Math.floor(detik / 86400);
  const h = Math.floor((detik % 86400) / 3600);
  const m = Math.floor((detik % 3600) / 60);
  if (d > 0) return `${d}h ${h}j ${m}m`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

function Bar({ persen, warna }) {
  const w = Math.max(0, Math.min(100, persen || 0));
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-bg-soft">
      <div className={`h-full rounded-full transition-all duration-500 ${warna}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function Kartu({ label, nilai, sub, persen, warna }) {
  return (
    <div className="rounded-xl border border-border-soft bg-card-cream/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{nilai}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
      {persen != null && <Bar persen={persen} warna={warna} />}
    </div>
  );
}

export default function TerminalVps({ send }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const hidup = useRef(true);

  const muat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/vps', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (!hidup.current) return;
      if (d.ok) { setSt(d); setErr(null); }
      else { setErr(d.error || 'Gagal membaca status.'); }
    } catch (e) {
      if (hidup.current) setErr(e?.message || 'Gagal konek.');
    }
  }, []);

  useEffect(() => {
    hidup.current = true;
    muat();
    const iv = setInterval(() => { if (!document.hidden) muat(); }, 5000);
    function onVis() { if (!document.hidden) muat(); }
    document.addEventListener('visibilitychange', onVis);
    return () => { hidup.current = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, [muat]);

  const kontrol = useCallback(async (aksi) => {
    const konfirmasi = { restart: 'Restart bot sekarang? Bot akan mati ±10 detik lalu hidup lagi.', stop: 'HENTIKAN bot? Web TIDAK bisa baca/tulis data sampai bot di-start lagi.', start: 'Hidupkan bot?' };
    if (!window.confirm(konfirmasi[aksi] || `Lakukan ${aksi}?`)) return;
    setBusy(true);
    setLog((l) => [{ t: new Date().toLocaleTimeString('id-ID'), teks: `> ${aksi}...` }, ...l].slice(0, 30));
    try {
      const res = await fetch('/api/admin/vps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aksi }) });
      const d = await res.json().catch(() => ({}));
      setLog((l) => [{ t: new Date().toLocaleTimeString('id-ID'), teks: d.ok ? `✓ ${d.hasil || aksi + ' ok'}` : `✗ ${d.error || 'gagal'}` }, ...l].slice(0, 30));
      // Beri jeda lalu muat ulang status
      setTimeout(muat, 4000);
    } catch (e) {
      setLog((l) => [{ t: new Date().toLocaleTimeString('id-ID'), teks: `✗ ${e?.message || 'error'}` }, ...l].slice(0, 30));
    } finally {
      setBusy(false);
    }
  }, [muat]);

  const v = st?.vps;
  const b = st?.bot;
  const r = st?.render;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">Terminal VPS</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Status server & kontrol bot. Bot berjalan di VPS {v?.vcpu || 6} vCPU / {v ? Math.round(v.ram.totalMb / 1024) : 8} GB, DB PostgreSQL lokal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => kontrol('restart')} className="btn-solid btn-solid-accent">Restart Bot</button>
          <button type="button" disabled={busy} onClick={() => kontrol('stop')} className="btn-solid btn-solid-danger">Stop Bot</button>
          <button type="button" disabled={busy} onClick={() => kontrol('start')} className="btn-solid btn-solid-success">Start Bot</button>
        </div>
      </div>

      {err && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
          {String(err).includes('BOT_API_URL') && <span className="block mt-1 text-xs">Aktifkan setelah domain API terpasang & env Vercel diisi.</span>}
        </p>
      )}

      {/* Kartu status (permintaan pemilik: CPU, RAM, Uptime, vCPU) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kartu label="CPU VPS" nilai={`${v?.cpuPersen ?? 0}%`} sub={(v?.load ? `load ${v.load.m1} / ${v.load.m5} / ${v.load.m15}` : '')} persen={v?.cpuPersen} warna={v?.cpuPersen > 85 ? 'bg-danger' : v?.cpuPersen > 75 ? 'bg-amber-500' : 'bg-success'} />
        <Kartu label="RAM VPS" nilai={`${v?.ram.persen ?? 0}%`} sub={v?.ram ? `${v.ram.usedMb} MB / ${v.ram.totalMb} MB` : ''} persen={v?.ram.persen} warna={v?.ram.persen > 90 ? 'bg-danger' : v?.ram.persen > 75 ? 'bg-amber-500' : 'bg-success'} />
        <Kartu label="Uptime VPS" nilai={fmtUptime(v?.uptimeVpsDetik)} sub={v?.vcpu ? `${v.vcpu} vCPU` : ''} />
        <Kartu label="Disk" nilai={v?.disk ? `${v.disk.persen}%` : '-'} sub={v?.disk ? `${v.disk.usedGb} / ${v.disk.totalGb} GB` : ''} persen={v?.disk?.persen} warna={v?.disk?.persen > 90 ? 'bg-danger' : 'bg-success'} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kartu label="Status Bot" nilai={b?.aktif ? 'Online' : 'Offline'} sub={b?.aktif ? 'berjalan normal' : 'bot mati'} />
        <Kartu label="RAM Bot" nilai={b?.memMb != null ? `${b.memMb} MB` : '-'} sub="memori proses bot" />
        <Kartu label="Uptime Bot" nilai={b?.uptime?.teks || '-'} sub={b?.sejakMs ? `sejak ${new Date(b.sejakMs).toLocaleString('id-ID')}` : ''} />
        <Kartu label="Ping WS" nilai={b?.ping != null ? `${b.ping} ms` : '-'} sub="latensi Discord gateway" />
      </div>

      {/* RENDER CANVAS (permintaan pemilik 2026-10-05): berapa gambar yang
          sedang dibuat worker sekarang + berapa yang menunggu. Info ini penting
          untuk tahu apakah server sedang sibuk render (bikin game terasa lambat).
          Sumber: renderPool.stats() + renderQueue.queueStats() di bot. */}
      <div className="rounded-xl border border-border-soft bg-card-cream/60 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Render Canvas</p>
          <span className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ${
            (r?.aktif || 0) > 0 ? 'bg-accent text-white' : 'bg-bg-soft text-ink-muted'
          }`}>
            {(r?.aktif || 0) > 0 ? 'SEDANG MERENDER' : 'IDLE'}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border-soft bg-white px-3 py-2">
            <p className="text-[0.65rem] uppercase tracking-wider text-ink-muted">Sedang Render</p>
            <p className="mt-0.5 text-2xl font-bold text-ink">{r ? r.aktif : '-'}</p>
            <p className="text-[0.65rem] text-ink-muted">{r ? `dari ${r.workers} worker` : 'bot baru start'}</p>
          </div>
          <div className="rounded-lg border border-border-soft bg-white px-3 py-2">
            <p className="text-[0.65rem] uppercase tracking-wider text-ink-muted">Menunggu</p>
            <p className="mt-0.5 text-2xl font-bold text-ink">{r ? r.antrean : '-'}</p>
            <p className="text-[0.65rem] text-ink-muted">{r ? `maks ${r.maxAntrean}` : ''}</p>
          </div>
          <div className="rounded-lg border border-border-soft bg-white px-3 py-2">
            <p className="text-[0.65rem] uppercase tracking-wider text-ink-muted">Total Aktif</p>
            <p className="mt-0.5 text-2xl font-bold text-ink">{r ? (r.dibatasi ?? '-') : '-'}</p>
            <p className="text-[0.65rem] text-ink-muted">lewat limiter</p>
          </div>
          <div className="rounded-lg border border-border-soft bg-white px-3 py-2">
            <p className="text-[0.65rem] uppercase tracking-wider text-ink-muted">Worker</p>
            <p className="mt-0.5 text-2xl font-bold text-ink">{r ? r.workers : '-'}</p>
            <p className="text-[0.65rem] text-ink-muted">thread render</p>
          </div>
        </div>
      </div>

      {/* Log aksi */}
      <div className="rounded-xl border border-border-soft bg-[#0b1020] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Log Kontrol</p>
        <div className="mt-2 max-h-52 overflow-y-auto font-mono text-xs leading-relaxed text-slate-300">
          {log.length === 0 ? <p className="text-slate-500">Belum ada aksi. Tombol di atas untuk kontrol bot.</p> : log.map((x, i) => (
            <p key={i}><span className="text-slate-500">{x.t}</span> {x.teks}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

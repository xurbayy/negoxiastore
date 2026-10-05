'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmModal from './ConfirmModal';
import StatusSistem from './StatusSistem';

// ==========================================
// TerminalVps — panel kontrol VPS gaya Pterodactyl Panel
// ==========================================
// Tampilan: diagram CPU / Memori / Jaringan (In-Out) di atas, lalu CONSOLE
// besar dengan input command di bawah, tombol Start / Restart / Stop di atas.
// Semua bahasa Indonesia. Console menerima perintah WHITELIST (id tetap di bot,
// bukan shell bebas) + "help" untuk daftar perintah.
// Polling status 5 dtk, log console 4 dtk.
function fmtUptime(detik) {
  if (!Number.isFinite(detik)) return '-';
  const d = Math.floor(detik / 86400);
  const h = Math.floor((detik % 86400) / 3600);
  const m = Math.floor((detik % 3600) / 60);
  if (d > 0) return `${d}h ${h}j ${m}m`;
  if (h > 0) return `${h}j ${m}m`;
  return `${m}m`;
}

// Format byte/detik -> satuan manusiawi (KB/s, MB/s).
function fmtBps(bps) {
  if (bps == null) return '-';
  if (bps < 1024) return `${bps} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(2)} MB/s`;
}

function fmtMb(mb) {
  if (mb == null) return '-';
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(2)} GiB`;
}

// ── Diagram garis mini (sparkline) - tanpa library ──
function Spark({ data, color = '#F19A1A', max = 100, tinggi = 46, label, nilai }) {
  const w = 300, h = tinggi, pad = 3;
  const pts = data.length ? data : [0];
  const n = Math.max(2, pts.length);
  const maks = Math.max(max, ...pts, 1);
  const x = (i) => pad + (i / (n - 1)) * (w - pad * 2);
  const y = (v) => h - pad - (Math.min(v, maks) / maks) * (h - pad * 2);
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(n - 1).toFixed(1)} ${h - pad} L ${x(0).toFixed(1)} ${h - pad} Z`;
  return (
    <div className="rounded-xl border border-border-soft bg-white px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
        <span className="font-mono text-xs font-bold text-ink">{nilai}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-1 h-12 w-full" aria-hidden="true">
        <path d={area} fill={color} opacity="0.14" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function TerminalVps({ send }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [konfirm, setKonfirm] = useState(null);
  const [riwayat, setRiwayat] = useState([]); // garis dari console log bot
  const [pantau, setPantau] = useState(null); // status pemantauan setelah restart/stop
  const hidup = useRef(true);

  // Riwayat metrik untuk diagram (maks 40 titik).
  const [histCpu, setHistCpu] = useState([]);
  const [histRam, setHistRam] = useState([]);
  const [histNetIn, setHistNetIn] = useState([]);
  const [histNetOut, setHistNetOut] = useState([]);
  const netMaks = useRef(1024 * 64); // skala awal 64KB/s, auto naik

  const muat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/vps', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (!hidup.current) return;
      if (d.ok) {
        setSt(d);
        setErr(null);
        const v = d.vps || {};
        setHistCpu((a) => [...a, v.cpuPersen || 0].slice(-40));
        setHistRam((a) => [...a, (v.ram && v.ram.persen) || 0].slice(-40));
        const nin = (v.net && v.net.rxBps) || 0;
        const nout = (v.net && v.net.txBps) || 0;
        netMaks.current = Math.max(1024 * 8, netMaks.current * 0.98, nin * 1.2, nout * 1.2);
        setHistNetIn((a) => [...a, nin].slice(-40));
        setHistNetOut((a) => [...a, nout].slice(-40));
      } else {
        setErr(d.error || 'Gagal membaca status.');
      }
    } catch (e) {
      if (hidup.current) setErr(e?.message || 'Gagal konek.');
    }
  }, []);

  // Riwayat PERSISTEN dari DB (lintas device) + log bot live dari journalctl.
  // Konsol = [riwayat_db (membekas)] + [log_bot_live] digabung, dibaca dari
  // server - jadi device mana pun menampilkan isi yang SAMA.
  const muatLog = useCallback(async () => {
    try {
      const [resR, resL] = await Promise.all([
        fetch('/api/admin/vps/riwayat?n=80', { cache: 'no-store' }),
        fetch('/api/admin/vps/log?n=80', { cache: 'no-store' }),
      ]);
      const dR = await resR.json().catch(() => ({}));
      const dL = await resL.json().catch(() => ({}));
      if (!hidup.current) return;
      const barisHist = (dR.ok && Array.isArray(dR.riwayat)) ? dR.riwayat.map((h) => ({
        jenis: h.ok ? 'out' : 'err',
        t: h.created_at ? new Date(Number(h.created_at)).toLocaleTimeString('id-ID') : '',
        teks: `$ ${h.perintah || ''}  [${h.jenis}${h.aktor ? ' · ' + h.aktor : ''}]\n${h.keluaran || ''}`,
      })) : [];
      const barisBot = (dL.ok && Array.isArray(dL.baris)) ? dL.baris.map((b) => ({ jenis: 'bot', t: b.t, teks: b.pesan })) : [];
      // Log bot live di depan, riwayat perintah di belakang (kronologis).
      setRiwayat([...barisBot, ...barisHist].slice(-400));
    } catch { /* diamkan */ }
  }, []);

  useEffect(() => {
    hidup.current = true;
    muat();
    muatLog();
    const iv = setInterval(() => { if (!document.hidden) muat(); }, 5000);
    const ivLog = setInterval(() => { if (!document.hidden) muatLog(); }, 4000);
    function onVis() { if (!document.hidden) { muat(); muatLog(); } }
    document.addEventListener('visibilitychange', onVis);
    return () => { hidup.current = false; clearInterval(iv); clearInterval(ivLog); document.removeEventListener('visibilitychange', onVis); };
  }, [muat, muatLog]);

  const mintaKonfirmasi = useCallback((aksi) => {
    const meta = {
      restart: { judul: 'Restart Bot', body: 'Restart bot sekarang? Bot akan mati ±10 detik lalu hidup lagi.' },
      stop: { judul: 'Hentikan Bot', body: 'HENTIKAN bot? Web TIDAK bisa baca/tulis data sampai bot di-start lagi.' },
      start: { judul: 'Hidupkan Bot', body: 'Hidupkan bot sekarang?' },
    };
    const m = meta[aksi] || { judul: `Aksi: ${aksi}`, body: `Lakukan ${aksi}?` };
    setKonfirm({ aksi, ...m });
  }, []);

  const jalankanKontrol = useCallback(async (aksi) => {
    setKonfirm(null);
    setBusy(true);
    setPantau(`Perintah ${aksi} dikirim. Memantau proses startup bot...`);
    try {
      await fetch('/api/admin/vps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aksi }) });
      // Perintah tercatat di DB (terminal_log). Sekarang PANTAU startup:
      // muat log+status tiap 2 dtk selama ~24 dtk supaya banner startup bot
      // TERLIHAT MENGALIR di konsol (bukan cuma 1 baris "dijadwalkan"),
      // plus kartu status langsung menunjukkan Online/Offline.
      let langkah = 0;
      const interval = 2000;
      const total = 24000;
      const jeda = (ms) => new Promise((r) => setTimeout(r, ms));
      for (langkah = 0; langkah < total; langkah += interval) {
        await jeda(interval);
        if (!hidup.current) break;
        muatLog();
        muat();
        // Kalau bot sudah online lagi (restart/start) -> berhenti memantau awal.
        try {
          const res = await fetch('/api/admin/vps', { cache: 'no-store' });
          const d = await res.json().catch(() => ({}));
          if (d?.bot?.aktif && (aksi === 'restart' || aksi === 'start')) {
            // Tunggu 4 dtk lagi supaya banner startup sempat muncul penuh.
            await jeda(4000);
            muatLog();
            setPantau('✓ Bot sudah ONLINE lagi. Log startup ada di konsol di atas.');
            return;
          }
          if (!d?.bot?.aktif && aksi === 'stop') {
            setPantau('✓ Bot BERHASIL dihentikan (status: Offline).');
            return;
          }
        } catch { /* lanjut memantau */ }
      }
      setPantau('Selesai memantau. Periksa konsol untuk status terakhir bot.');
    } catch {
      setPantau('✗ Gagal mengirim perintah. Coba lagi.');
    } finally {
      setBusy(false);
      setTimeout(() => { muat(); muatLog(); }, 3000);
    }
  }, [muat, muatLog]);

  const v = st?.vps;
  const b = st?.bot;
  const r = st?.render;
  const online = b?.aktif;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl text-ink">Terminal VPS</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Kontrol bot & server langsung. Bot di VPS {v?.vcpu || 6} vCPU / {v ? Math.round(v.ram.totalMb / 1024) : 8} GiB, DB PostgreSQL lokal.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <button type="button" disabled={busy} onClick={() => mintaKonfirmasi('start')} className="btn-solid btn-solid-success">Mulai</button>
          <button type="button" disabled={busy} onClick={() => mintaKonfirmasi('restart')} className="btn-solid btn-solid-accent">Restart</button>
          <button type="button" disabled={busy} onClick={() => mintaKonfirmasi('stop')} className="btn-solid btn-solid-danger">Hentikan</button>
        </div>
      </div>

      {err && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {err}
          {String(err).includes('BOT_API_URL') && <span className="block mt-1 text-xs">Aktifkan setelah domain API terpasang & env Vercel diisi.</span>}
        </p>
      )}

      {/* Status Sistem (dipindah dari Dashboard) */}
      <StatusSistem />

      {/* Diagram metrik (gaya Pterodactyl): CPU, Memori, Jaringan In/Out */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Spark label="CPU" nilai={`${v?.cpuPersen ?? 0}%`} data={histCpu} max={100} color="#F19A1A" />
        <Spark label="Memori" nilai={`${v?.ram?.persen ?? 0}%`} data={histRam} max={100} color="#7BA05B" />
        <Spark label="Jaringan Masuk" nilai={fmtBps(v?.net?.rxBps)} data={histNetIn} max={netMaks.current} color="#4A90D9" />
        <Spark label="Jaringan Keluar" nilai={fmtBps(v?.net?.txBps)} data={histNetOut} max={netMaks.current} color="#9B59B6" />
      </div>

      {/* Ringkasan status (kartu ringkas) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <MiniKartu label="Status Bot" nilai={online ? 'Online' : 'Offline'} warna={online ? 'text-success' : 'text-danger'} />
        <MiniKartu label="RAM Bot" nilai={b?.memMb != null ? `${b.memMb} MB` : '-'} />
        <MiniKartu label="Uptime Bot" nilai={b?.uptime?.teks || '-'} />
        <MiniKartu label="Ping WS" nilai={b?.ping != null ? `${b.ping} ms` : '-'} />
        <MiniKartu label="Uptime VPS" nilai={fmtUptime(v?.uptimeVpsDetik)} />
        <MiniKartu label="Disk" nilai={v?.disk ? `${v.disk.persen}%` : '-'} sub={v?.disk ? `${v.disk.usedGb}/${v.disk.totalGb} GB` : ''} />
      </div>

      {/* RENDER CANVAS */}
      <div className="rounded-xl border border-border-soft bg-card-cream/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Render Canvas</p>
          <span className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold ${(r?.aktif || 0) > 0 ? 'bg-accent text-white' : 'bg-bg-soft text-ink-muted'}`}>
            {(r?.aktif || 0) > 0 ? 'SEDANG MERENDER' : 'IDLE'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="text-ink-muted">Sedang render: <b className="text-ink">{r ? r.aktif : '-'}</b></span>
          <span className="text-ink-muted">Menunggu: <b className="text-ink">{r ? r.antrean : '-'}</b></span>
          <span className="text-ink-muted">Worker: <b className="text-ink">{r ? r.workers : '-'}</b></span>
          {r && r.puncak != null && <span className="text-ink-muted">Puncak: <b className="text-ink">{r.puncak}</b></span>}
          {r && r.total != null && <span className="text-ink-muted">Total sejak start: <b className="text-ink">{r.total}</b></span>}
        </div>
        <p className="mt-1.5 text-[0.65rem] text-ink-faint">
          Semua jalur render terhitung (worker thread + in-process). Rincian saat ini: worker {r ? r.aktifPool : '-'}, limiter {r ? r.aktifLimiter : '-'}.
        </p>
      </div>

      {/* CONSOLE besar (gaya Pterodactyl) */}
      {pantau && (
        <div className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
          pantau.startsWith('✓') ? 'border-success/40 bg-success/10 text-success'
            : pantau.startsWith('✗') ? 'border-danger/40 bg-danger/10 text-danger'
              : 'border-accent/40 bg-accent/10 text-accent'
        }`}>
          {pantau}
        </div>
      )}
      <ConsoleLog riwayat={riwayat} refresh={muatLog} online={online} />

      {/* Modal konfirmasi kontrol bot (Mulai/Restart/Hentikan). WAJIB dirender
          - dulu pernah hilang saat rewrite -> tombol terasa "tidak berfungsi"
          karena setKonfirm jalan tapi modalnya tak muncul. */}
      {konfirm && (
        <ConfirmModal
          title={konfirm.judul}
          body={konfirm.body}
          busy={busy}
          onCancel={() => setKonfirm(null)}
          onConfirm={() => jalankanKontrol(konfirm.aksi)}
        />
      )}
    </div>
  );
}

function MiniKartu({ label, nilai, sub, warna }) {
  return (
    <div className="rounded-xl border border-border-soft bg-card-cream/60 px-3 py-2">
      <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-bold ${warna || 'text-ink'}`}>{nilai}</p>
      {sub && <p className="text-[0.62rem] text-ink-muted">{sub}</p>}
    </div>
  );
}

// ── Console: area besar + input command (whitelist) ──
function ConsoleLog({ riwayat, refresh, online }) {
  const [baris, setBaris] = useState('');
  const [jalan, setJalan] = useState(false);
  const autoRef = useRef(true);
  const boxRef = useRef(null);

  // Auto-scroll ke bawah kalau user belum menggulir ke atas.
  useEffect(() => {
    const el = boxRef.current;
    if (el && autoRef.current) el.scrollTop = el.scrollHeight;
  }, [riwayat]);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    autoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  const kirim = useCallback(async (e) => {
    e.preventDefault();
    const cmd = baris.trim();
    if (!cmd || jalan) return;
    setBaris('');
    setJalan(true);
    try {
      await fetch('/api/admin/vps/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perintah: cmd }),
      });
      // Muat ulang konsol dari server (riwayat persisten + log bot).
      if (refresh) await refresh();
    } catch { /* diamkan */ } finally {
      setJalan(false);
    }
  }, [baris, jalan, refresh]);

  return (
    <div className="overflow-hidden rounded-xl border border-border-soft bg-[#0b1020]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">Console</span>
        <span className={`flex items-center gap-1.5 text-[0.7rem] font-bold ${online ? 'text-[#7BA05B]' : 'text-[#C74B3C]'}`}>
          <span className={`h-2 w-2 rounded-full ${online ? 'bg-[#7BA05B]' : 'bg-[#C74B3C]'}`} /> {online ? 'Terhubung' : 'Terputus'}
        </span>
      </div>

      <div
        ref={boxRef}
        onScroll={onScroll}
        className="h-72 overflow-y-auto px-3 py-3 font-mono text-xs leading-relaxed sm:h-96 sm:px-4"
      >
        {riwayat.length === 0 ? (
          <p className="text-slate-500">Console siap. Ketik <span className="text-slate-300">help</span> lalu Enter untuk daftar perintah, atau ketik mis. <span className="text-slate-300">logs</span>, <span className="text-slate-300">df</span>, <span className="text-slate-300">free</span>.</p>
        ) : riwayat.map((x, i) => (
          <pre key={i} className={`whitespace-pre-wrap break-words ${
            x.jenis === 'user' ? 'text-[#F19A1A]'
              : x.jenis === 'err' ? 'text-[#E57366]'
              : x.jenis === 'out' ? 'text-[#8FD08F]'
              : 'text-slate-300'
          }`}>
            {x.jenis === 'bot' && x.t ? <span className="text-slate-500">{x.t} </span> : null}{x.teks}
          </pre>
        ))}
      </div>

      <form onSubmit={kirim} className="flex items-center gap-2 border-t border-white/10 px-3 py-2">
        <span className="font-mono text-sm text-[#7BA05B]">$</span>
        <input
          value={baris}
          onChange={(e) => setBaris(e.target.value)}
          placeholder="Ketik perintah… (ketik: help)"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
        />
        <button type="submit" disabled={jalan || !baris.trim()} className="btn-solid btn-solid-dark text-xs disabled:opacity-40">
          {jalan ? '…' : 'Kirim'}
        </button>
      </form>
    </div>
  );
}

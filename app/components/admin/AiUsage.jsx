'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fmt, fmtRingkas, timeAgo } from '../../lib/formatClient';

// ==========================================
// AiUsage - kartu pemakaian AI (permintaan pemilik 2026-10-04)
// ==========================================
// "ada usage seperti [Total Requests, Input/Cached/Output Tokens, Est. Cost,
//  Recent Requests] ... ada graphicnya di bawah chat AI ... real ga halu
//  berdasarkan data ... bisa di hide ... di semua platform walau sekecil
//  apapun enak dilihatnya ... buat card baru dibawah biar ga numpuk di atas".
//
// Data diambil dari /api/admin/ai/usage-log (dicatat lib/aiUsage.js tiap
// permintaan AI). Est. Cost = token x tarif publik (PERKIRAAN, bukan tagihan).
//
// Dibuka dari AnalisisAI sebagai kartu TERPISAH di bawah kolom chat - supaya
// tidak menumpuk di atas. Bisa disembunyikan (default terlihat).

function fmtToken(n) {
  return fmtRingkas(Number(n) || 0);
}
function fmtCost(usd) {
  const v = Number(usd) || 0;
  if (v === 0) return '$0.00';
  if (v < 0.01) return '<$0.01';
  return '$' + v.toFixed(2);
}

// Bar chart token per jam (24 jam) - batang setinggi total token (input+output)
// per jam, muat di layar kecil. Sesuai contoh pemilik: grafik pemakaian
// TOKEN (bukan cuma jumlah permintaan) - angkanya besar & jelas kelihatan.
function GrafikJam({ hourly }) {
  // Total token per jam = input + output (cached sudah termasuk di input).
  const nilai = (h) => (Number(h.inputTokens) || 0) + (Number(h.outputTokens) || 0);
  const maks = Math.max(1, ...hourly.map(nilai));
  return (
    <div className="flex h-32 items-end gap-[3px] sm:h-36" role="img" aria-label="Grafik token AI per jam (24 jam terakhir)">
      {hourly.map((h) => {
        const v = nilai(h);
        const tinggi = v ? Math.max(6, Math.round((v / maks) * 100)) : 2;
        const jam = String(h.jam).padStart(2, '0');
        const tip = `${jam}:00 - ${fmt(v)} token (in ${fmt(h.inputTokens)} / out ${fmt(h.outputTokens)} / ${h.requests} req)`;
        return (
          <div key={h.jam} className="group relative flex-1" title={tip}>
            <div
              className={`w-full rounded-t-sm transition-all ${v ? 'bg-accent' : 'bg-border-soft/60'}`}
              style={{ height: `${tinggi}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function AiUsage() {
  const [data, setData] = useState(null);
  const [sibuk, setSibuk] = useState(false);
  const [err, setErr] = useState(null);
  const [tersembunyi, setTersembunyi] = useState(false);
  const [tampilGrafik, setTampilGrafik] = useState(true);
  const batal = useRef(false);

  const muat = useCallback(async () => {
    setSibuk(true);
    try {
      const res = await fetch('/api/admin/ai/usage-log', { cache: 'no-store' });
      // .catch: kalau response kosong (koneksi DB penuh/putus) jangan crash
      // "Unexpected end of JSON input" - anggap gagal dengan pesan.
      const d = await res.json().catch(() => ({}));
      if (batal.current) return;
      if (d.ok) { setData(d); setErr(null); }
      else setErr(d.error || 'Gagal memuat pemakaian AI (koneksi bermasalah - coba lagi).');
    } catch (e) {
      if (!batal.current) setErr(e?.message || 'Gagal menghubungi server.');
    } finally {
      if (!batal.current) setSibuk(false);
    }
  }, []);

  useEffect(() => {
    batal.current = false;
    muat();
    const iv = setInterval(() => { if (!document.hidden) muat(); }, 30000);
    return () => { batal.current = true; clearInterval(iv); };
  }, [muat]);

  const t = data?.totals;
  const adaToken = t?.adaToken;

  // Kartu terlipat: hanya baris ringkas + tombol.
  if (tersembunyi) {
    return (
      <div className="nx-card flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="font-display text-sm text-ink">Pemakaian AI</p>
          <p className="truncate text-[0.7rem] text-ink-muted">
            {t ? `${fmt(t.requests)} permintaan • ${fmtCost(t.estCostUsd)} (estimasi)` : 'Tersembunyi'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTersembunyi(false)}
          className="shrink-0 rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-accent/50 hover:text-ink cursor-pointer"
        >
          Tampilkan
        </button>
      </div>
    );
  }

  return (
    <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft pb-3">
        <div>
          <h3 className="font-display text-ink">Pemakaian AI</h3>
          <p className="mt-0.5 text-[0.7rem] text-ink-muted">
            Data nyata dari log pemakaian - estimasi biaya, bukan tagihan asli.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={muat}
            disabled={sibuk}
            className="rounded-lg border border-border-soft px-2.5 py-1.5 text-[0.7rem] font-bold text-ink-muted transition hover:border-accent/50 hover:text-ink disabled:opacity-50 cursor-pointer"
          >
            {sibuk ? 'Memuat...' : 'Segarkan'}
          </button>
          <button
            type="button"
            onClick={() => setTersembunyi(true)}
            className="rounded-lg border border-border-soft px-2.5 py-1.5 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
            title="Sembunyikan kartu pemakaian"
          >
            Sembunyikan
          </button>
        </div>
      </div>

      {err && <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{err}</p>}
      {!err && !data && sibuk && <p className="mt-3 text-xs text-ink-muted"><span className="pulse-dot" aria-hidden="true" /> Memuat pemakaian...</p>}

      {data && (
        <>
          {/* Stat tiles: responsif, wrap di layar kecil. */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Total Requests" value={fmt(t.requests)} sub={`${fmt(t.okRequests)} sukses`} />
            <Stat label="Input Tokens" value={fmtToken(t.inputTokens)} sub="konteks dikirim" />
            <Stat label="Cached Tokens" value={fmtToken(t.cachedTokens)} sub="dari cache provider" />
            <Stat label="Output Tokens" value={fmtToken(t.outputTokens)} sub="jawaban AI" />
            <Stat label="Est. Cost" value={fmtCost(t.estCostUsd)} sub="perkiraan, bukan tagihan" aksen />
          </div>
          {!adaToken && (
            <p className="mt-2 rounded-lg bg-warning/10 px-3 py-1.5 text-[0.7rem] font-semibold text-warning">
              Provider tidak mengirim data token untuk permintaan ini - angka token kosong (bukan nol pemakaian).
            </p>
          )}

          {/* Grafik per jam + ringkasan hari ini */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-xl border border-border-soft bg-bg-soft/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold text-ink">Grafik per jam (24 jam terakhir)</p>
                <button
                  type="button"
                  onClick={() => setTampilGrafik((v) => !v)}
                  className="text-[0.65rem] font-bold text-accent hover:underline cursor-pointer"
                >
                  {tampilGrafik ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              {tampilGrafik && (
                <>
                  <GrafikJam hourly={data.hourly} />
                  <p className="mt-1.5 text-center text-[0.6rem] text-ink-faint">00:00 - 23:00 (WIB) - batang = total token (input+output) per jam</p>
                </>
              )}
            </div>

            {/* Recent Requests */}
            <div className="rounded-xl border border-border-soft bg-bg-soft/30 p-3">
              <p className="mb-2 text-xs font-bold text-ink">Recent Requests</p>
              {data.recent.length === 0 ? (
                <p className="text-[0.7rem] text-ink-muted">Belum ada permintaan tercatat.</p>
              ) : (
                <ul className="space-y-1">
                  {data.recent.slice(0, 8).map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-[0.68rem]">
                      <span className="min-w-0 truncate text-ink" title={`${r.provider} • ${r.model}`}>
                        {r.model}
                      </span>
                      <span className="shrink-0 text-ink-muted">
                        {fmtToken(r.promptTokens)}<span className="text-ink-faint">↑</span> {fmtToken(r.completionTokens)}<span className="text-ink-faint">↓</span> • {timeAgo(r.ts)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Usage by Model + By Provider - FORMAT KARTU (mobile-friendly) */}
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border-soft bg-bg-soft/30 p-3">
              <p className="mb-2 text-xs font-bold text-ink">Usage by Model</p>
              {data.byModel.length === 0 ? (
                <p className="text-[0.75rem] text-ink-muted">Belum ada data model.</p>
              ) : (
                <ul className="space-y-2">
                  {data.byModel.map((m, i) => (
                    <li key={i} className="rounded-lg border border-border-soft bg-card-cream px-3 py-2">
                      {/* Baris atas: nama model + biaya. */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[0.82rem] font-semibold text-ink" title={`${m.provider} • ${m.model}`}>{m.model}</p>
                        <p className="shrink-0 text-[0.78rem] font-bold text-ink">{fmtCost(m.estCostUsd)}</p>
                      </div>
                      {/* Provider di bawah nama - membedakan model serupa di provider beda. */}
                      <p className="text-[0.68rem] text-ink-faint">{m.provider}</p>
                      {/* Grid statistik 4 kolom - muat di layar HP sempit. */}
                      <div className="mt-1.5 grid grid-cols-4 gap-1">
                        <StatMini label="Req" value={fmt(m.requests)} />
                        <StatMini label="In" value={fmtToken(m.inputTokens)} />
                        <StatMini label="Cached" value={fmtToken(m.cachedTokens)} />
                        <StatMini label="Out" value={fmtToken(m.outputTokens)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border-soft bg-bg-soft/30 p-3">
              <p className="mb-2 text-xs font-bold text-ink">By Provider</p>
              {data.byProvider.length === 0 ? (
                <p className="text-[0.75rem] text-ink-muted">Belum ada data provider.</p>
              ) : (
                <ul className="space-y-2">
                  {data.byProvider.map((p, i) => (
                    <li key={i} className="rounded-lg border border-border-soft bg-card-cream px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[0.82rem] font-semibold text-ink">{p.provider}</p>
                        <p className="shrink-0 text-[0.78rem] font-bold text-ink">{fmtCost(p.estCostUsd)}</p>
                      </div>
                      <div className="mt-1.5 grid grid-cols-4 gap-1">
                        <StatMini label="Req" value={fmt(p.requests)} />
                        <StatMini label="In" value={fmtToken(p.inputTokens)} />
                        <StatMini label="Cached" value={fmtToken(p.cachedTokens)} />
                        <StatMini label="Out" value={fmtToken(p.outputTokens)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="mt-3 text-[0.62rem] text-ink-faint">{data.catatan}</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub, aksen }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${aksen ? 'border-accent/40 bg-accent/5' : 'border-border-soft bg-card-cream/60'}`}>
      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`mt-0.5 truncate font-semibold ${aksen ? 'text-accent' : 'text-ink!'}`} title={value}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[0.58rem] text-ink-faint">{sub}</p>}
    </div>
  );
}

// Statistik mini untuk kartu Usage by Model / By Provider - muat di HP sempit
// (grid 4 kolom, label kecil + angka jelas).
function StatMini({ label, value }) {
  return (
    <div className="rounded-md bg-bg-soft/50 px-1 py-1 text-center">
      <p className="text-[0.55rem] leading-tight text-ink-faint">{label}</p>
      <p className="text-[0.7rem] font-semibold leading-tight text-ink" title={value}>{value}</p>
    </div>
  );
}

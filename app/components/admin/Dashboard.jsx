'use client';

import { useMemo, useState } from 'react';
import { fmt, fmtRingkas, fmtUptime, timeAgo } from '../../lib/formatClient';
import { emojiSrc } from '../../lib/emojisClient';
import { GAME_META } from '../../lib/game-meta';

// Mode beta -> emoji ikon grup (pola sama seperti Games.jsx: nama utama,
// fallback ke nama registry yang benar-benar ada).
const BETA_MODE_ICON = { solo: ['controller'], mp: ['loadingbox', 'mp'], coop: ['399536hd2hellvictory', 'coop'] };

// Identitas tampilan untuk satu game_type: prioritas beta (nama + ikon mode
// dari payload bot), lalu katalog reguler, terakhir nama mentah.
function gameDisplay(key, betaMap) {
  const beta = betaMap[key];
  if (beta) {
    const names = BETA_MODE_ICON[beta.mode] || BETA_MODE_ICON.solo;
    const icon = names.map((n) => emojiSrc(n, 32)).find(Boolean) || null;
    return { name: beta.name, icon, beta: true };
  }
  const meta = GAME_META[key];
  if (meta) {
    return { name: meta.name, icon: emojiSrc(meta.emoji, 32) || emojiSrc(meta.fb, 32), beta: false };
  }
  return { name: key, icon: null, beta: false };
}

function nowMs() {
  return Date.now();
}

// ── Chart modern (tanpa lib): grid, area, crosshair + tooltip, titik terakhir ──
function Chart({ series, pick, color = '#2B2118', label, unit = '', formatter = fmt }) {
  const [hover, setHover] = useState(null);
  const pts = useMemo(
    () => series.map((s) => ({ t: s.ts, v: pick(s) })).filter((p) => p.v != null),
    [series, pick]
  );
  if (pts.length < 2) {
    return <p className="mt-3 text-sm text-ink-muted">Belum cukup data untuk grafik, perlu sekitar 2 snapshot.</p>;
  }
  const max = Math.max(...pts.map((p) => p.v), 1);
  const min = Math.min(...pts.map((p) => p.v));
  const w = 600, h = 170, padX = 6, padY = 10;
  const stepX = (w - padX * 2) / (pts.length - 1);
  const x = (i) => padX + i * stepX;
  const y = (v) => h - padY - (v / max) * (h - padY * 2);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.v)}`).join(' ');
  const area = `${line} L ${x(pts.length - 1)} ${h - padY} L ${x(0)} ${h - padY} Z`;

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round((rel - padX) / stepX)));
    setHover(i);
  }

  const hp = hover != null ? pts[hover] : null;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="font-display text-lg text-ink">
          {formatter(pts[pts.length - 1].v)}<span className="ml-1 text-xs text-ink-muted">{unit}</span>
        </p>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="w-full"
          role="img"
          aria-label={`Grafik ${label}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* garis bantu horizontal (4 tingkat) */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1={padX} x2={w - padX} y1={y(max * f)} y2={y(max * f)} stroke={color} strokeOpacity="0.08" strokeWidth="1" />
          ))}
          <line x1={padX} x2={w - padX} y1={h - padY} y2={h - padY} stroke={color} strokeOpacity="0.15" strokeWidth="1" />
          <path d={area} fill={color} fillOpacity="0.10" />
          <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {/* titik terakhir */}
          <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].v)} r="4" fill={color} />
          <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].v)} r="8" fill={color} fillOpacity="0.18" />
          {/* crosshair + titik hover */}
          {hp && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={padY} y2={h - padY} stroke={color} strokeOpacity="0.3" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(hp.v)} r="4.5" fill="#FBF7EC" stroke={color} strokeWidth="2.5" />
            </>
          )}
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-soft bg-card-cream px-2.5 py-1.5 text-center shadow-md"
            style={{ left: `${(x(hover) / w) * 100}%` }}
          >
            <p className="font-display text-sm leading-none text-ink">{formatter(hp.v)}</p>
            <p className="mt-0.5 text-[0.6rem] leading-none text-ink-muted">{timeAgo(hp.t)}</p>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[0.65rem] text-ink-muted">
        <span>{timeAgo(pts[0].t)}</span>
        <span>min {formatter(min)} · maks {formatter(max)}</span>
        <span>sekarang</span>
      </div>
    </div>
  );
}

// Sparkline kecil di kartu metrik (24 jam terakhir).
function Spark({ series, pick, color = '#D98510' }) {
  const pts = series.map((s) => pick(s)).filter((v) => v != null).slice(-24);
  if (pts.length < 2) return null;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts);
  const range = max - min || 1;
  const w = 90, h = 26;
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (pts.length - 1)) * w} ${h - 3 - ((v - min) / range) * (h - 6)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-6 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Delta 24 jam: bandingkan titik terakhir vs titik paling dekat 24 jam lalu.
function delta24(series, pick) {
  const pts = series.map((s) => ({ t: s.ts, v: pick(s) })).filter((p) => p.v != null);
  if (pts.length < 2) return null;
  const cut = pts[pts.length - 1].t - 86400000;
  let before = pts[0];
  for (const p of pts) if (p.t <= cut) before = p;
  const d = pts[pts.length - 1].v - before.v;
  if (!Number.isFinite(d) || d === 0) return null;
  return d;
}

const DAY_MS = 86400000;

export default function Dashboard({ data }) {
  const snap = data.snapshot;
  const fullSeries = useMemo(() => data.series || [], [data.series]);
  const [range, setRange] = useState(7); // 1 | 7 hari
  const series = useMemo(() => {
    if (range === 1) {
      const cut = nowMs() - DAY_MS;
      return fullSeries.filter((s) => s.ts >= cut);
    }
    return fullSeries;
  }, [fullSeries, range]);

  if (!snap) {
    return (
      <div className="nx-card px-6 py-10 text-center text-ink-muted">
        <span className="pulse-dot" aria-hidden="true" />{' '}
        Menunggu push pertama dari bot (POST /api/bot/stats). Pastikan bridge bot aktif.
      </div>
    );
  }

  const m = snap.monitor || {};
  // Peta invite permanen per server (guildId -> {url, code, updatedAt}) yang
  // dibuat bot lewat utils/guildInvite.js. Dipakai tombol "Gabung" di kartu
  // Top Server supaya admin bisa langsung masuk ke server itu.
  //
  // PETA ADA DI DALAM `monitor` (hasil collectMonitorStats), sama seperti
  // m.servers di kartu ini. Fallback ke level atas untuk snapshot lama.
  const invites = (m.invites && typeof m.invites === 'object')
    ? m.invites
    : (snap.invites && typeof snap.invites === 'object' ? snap.invites : {});
  const live = m.live || {};
  const liveTotal = (live.playing || 0) + (live.lobby || 0) + (live.mp || 0) + (live.solo || 0);
  const stale = nowMs() - snap.ts > 3 * 60_000;
  // Peta beta dari payload bot: key (dice/sum/heal) -> nama & mode resmi.
  const betaMap = {};
  for (const b of snap.betaGames || []) betaMap[String(b.key).toLowerCase()] = b;

  const cards = [
    { label: 'Player Terdaftar', value: fmt(m.totalUsers), pick: (s) => s.totalUsers },
    { label: 'Total Users (all)', value: fmt(m.totalUsersAll), pick: null },
    { label: 'Poin Beredar', value: fmt(m.totalMoney), pick: (s) => s.totalMoney, color: '#C74B3C' },
    { label: 'Member NEXO Pass', value: fmt(m.premiumCount), pick: null },
    { label: 'Game Hari Ini', value: fmt(m.gamesToday), pick: (s) => s.gamesToday },
    { label: 'Game 7 Hari', value: fmt(m.gamesWeek), pick: null },
    { label: 'Sesi LIVE', value: fmt(liveTotal), pick: null },
    { label: 'Loans Aktif', value: fmt(m.loans?.count), pick: null },
    { label: 'Loans Telat', value: fmt(m.loans?.overdue), pick: null },
    { label: 'RAM Bot', value: `${fmt(snap.bot?.memMb)} MB`, pick: null },
    { label: 'Ping WS', value: `${snap.bot?.wsPing ?? '-'} ms`, pick: null },
    { label: 'Uptime', value: fmtUptime(snap.bot?.uptimeSec), pick: null },
  ];

  const maxPlays = Math.max(...(m.topGamesToday || []).map((g) => g.plays), 1);

  return (
    <div className="space-y-6">
      {/* Bridge status: pita solid - status sistem jangan samar */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 text-white ${stale ? 'bg-danger' : 'bg-success'}`}>
        <p className="text-sm font-bold">
          {stale ? '⚠ BOT OFFLINE · Snapshot terakhir lebih dari 3 menit lalu' : '● Bridge aktif, data mengalir'}
        </p>
        <p className="text-xs text-white/80">
          {snap.bot?.guildCount ?? 0} server · snapshot {timeAgo(snap.ts)}
          {m.botVersion && <span className="ml-3 font-mono">bot v{m.botVersion}</span>}
          {snap.maintenance?.active && <span className="ml-3 rounded bg-ink px-2 py-0.5 font-bold text-card-cream">MAINTENANCE: {snap.maintenance.reason || 'aktif'}</span>}
        </p>
      </div>

      {/* Kartu metrik: angka + delta 24 jam + sparkline */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => {
          const d = c.pick ? delta24(fullSeries, c.pick) : null;
          return (
            <div key={c.label} className="nx-card px-4 py-4">
              <div className="font-display text-xl text-ink">{c.value}</div>
              <div className="mt-1 text-xs text-ink-muted">{c.label}</div>
              {d != null && (
                <div className={`mt-0.5 text-[0.65rem] font-bold ${d > 0 ? 'text-success' : 'text-danger'}`} title="Perubahan 24 jam">
                  {d > 0 ? '▲' : '▼'} {fmtRingkas(Math.abs(d))} <span className="font-normal">/24 jam</span>
                </div>
              )}
              {c.pick && <Spark series={fullSeries} pick={c.pick} color={c.color || '#D98510'} />}
            </div>
          );
        })}
      </div>

      {/* Grafik besar + pemilih rentang */}
      <div className="nx-card px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-ink">Tren Ekonomi & Aktivitas</h3>
          <div className="flex gap-1.5">
            {[1, 7].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-sm transition cursor-pointer ${
                  range === r ? 'border-transparent bg-accent text-ink! text-white' : 'border-border-soft bg-white text-ink-muted hover:border-accent/50 hover:text-ink'
                }`}
              >
                {r === 1 ? '24 jam' : '7 hari'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          <Chart series={series} pick={(s) => s.totalMoney} color="#C74B3C" label="Poin beredar" unit="pts" />
          <Chart series={series} pick={(s) => s.gamesToday} color="#2B2118" label="Game dimainkan hari ini" unit="main" />
          <Chart series={series} pick={(s) => s.totalUsers} color="#7BA05B" label="Player terdaftar" unit="orang" />
        </div>
      </div>

      {/* Top games (bar relatif) + top servers */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="nx-card px-5 py-5">
          <h3 className="font-display text-ink">Top Game Hari Ini</h3>
          {(m.topGamesToday || []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Belum ada game hari ini.</p>
          ) : (
            <ul className="mt-3 space-y-2.5 text-sm">
              {m.topGamesToday.map((g) => {
                const gd = gameDisplay(String(g.game_type).toLowerCase(), betaMap);
                return (
                  <li key={g.game_type}>
                    <div className="flex justify-between">
                      <span className="flex items-center gap-2 text-ink">
                        {gd.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={gd.icon} alt="" width={18} height={18} className="h-4.5 w-4.5 shrink-0" />
                        ) : (
                          <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-accent/15 text-[0.55rem] font-bold text-accent-hover">
                            {gd.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        {gd.name}
                        {gd.beta && (
                          <span className="rounded-full bg-accent px-2 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-wider text-ink" title="Game beta - belum dirilis publik">
                            Beta
                          </span>
                        )}
                      </span>
                      <span className="text-ink-muted">{fmtRingkas(g.plays)}x main</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-soft">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (g.plays / maxPlays) * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="nx-card px-5 py-5">
          <h3 className="font-display text-ink">Top Server</h3>
          {(m.servers || m.topServers || []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Belum ada data server.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {(m.servers || m.topServers).slice(0, 10).map((s) => {
                // Invite permanen dari bot. Server yang bot-nya belum bisa
                // membuat invite (izin Create Instant Invite kurang) TIDAK
                // punya entri -> tombol tidak ditampilkan, bukan link mati.
                const inviteUrl = invites[s.guildId]?.url || null;
                return (
                <li key={s.guildId} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    {s.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.iconUrl} alt="" width={26} height={26} className="h-[26px] w-[26px] shrink-0 rounded-full border border-border-soft bg-bg-soft object-cover" />
                    ) : (
                      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-accent/15 text-[0.6rem] font-bold text-accent-hover">{(s.name || '?').slice(0, 2).toUpperCase()}</span>
                    )}
                    <span className="truncate text-ink">{s.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    {/* Jumlah member dipindah ke tooltip (title): kartu ini cuma
                        438px (grid 3 kolom), dan baris penuh + tombol 80px bikin
                        nama server terpanjang harus terpotong. Pemain adalah
                        metrik peringkat, jadi ia yang tampil; member tetap bisa
                        dibaca dengan hover. */}
                    <span
                      className="text-ink-muted"
                      title={s.members ? `${fmtRingkas(s.members)} member` : undefined}
                    >
                      {fmtRingkas(s.players)} pemain
                    </span>
                    {inviteUrl && (
                      <a
                        href={inviteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Gabung ke ${s.name} di Discord`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-soft bg-bg-soft px-2.5 py-1 text-[0.68rem] font-bold text-ink transition hover:border-accent hover:bg-accent/15"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.419 0 1.334-.946 2.419-2.157 2.419z" />
                        </svg>
                        Gabung
                      </a>
                    )}
                  </span>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { fmt, fmtRingkas, timeAgo } from '../../lib/formatClient';
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
  // Heartbeat bot LANGSUNG dari DB (public.bridge_meta.last_seen) - akurat
  // walau snapshot push belum masuk. Fallback ke snap.ts untuk kompatibilitas.
  const heartbeat = data.botHeartbeat || snap?.ts || 0;
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
    // Status Sistem TETAP tampil walau snapshot bot belum masuk - justru di
    // saat seperti inilah info health paling dibutuhkan (permintaan pemilik
    // 2026-10-04: "infonya di mana kok di admin panel gada").
    return (
      <div className="space-y-4">
        <div className="nx-card px-6 py-10 text-center text-ink-muted">
          <span className="pulse-dot" aria-hidden="true" />{' '}
          Menunggu push pertama dari bot (POST /api/bot/stats). Pastikan bridge bot aktif.
        </div>
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
  // Stale = bot tidak terlihat >3 menit (pakai heartbeat DB, bukan snapshot push).
  const stale = heartbeat > 0 && nowMs() - heartbeat > 3 * 60_000;
  // Peta beta dari payload bot: key (dice/sum/heal) -> nama & mode resmi.
  const betaMap = {};
  for (const b of snap.betaGames || []) betaMap[String(b.key).toLowerCase()] = b;

  // Item terjual (permintaan pemilik 2026-09-30): kartu "Sesi LIVE" diganti
  // jumlah item yang sudah dibeli pemain. Sesi LIVE diukur dari `live` yang
  // hampir selalu 0 di jam sepi, sehingga kartunya jarang memberi informasi;
  // angka item terjual selalu bergerak dan langsung berguna.
  // botKirimItem: apakah bot SUDAH memuat kode rekap item. Kalau false, angka 0
  // berarti "belum ada datanya", BUKAN "tidak ada penjualan" - dua hal yang
  // harus dibedakan supaya tidak terlihat seperti kerusakan.
  const botKirimItem = m.itemTerjualAll !== undefined;
  const totalItemTerjual = m.totalItemTerjual ?? 0;
  const totalPoinBelanja = m.totalPoinBelanja ?? 0;
  const itemHariIni = (m.itemTerjualToday || []).reduce((a, b) => a + (b.kali || 0), 0);

  // ==========================================
  // TOP GAME SEPANJANG MASA (permintaan pemilik 2026-10-04)
  // ==========================================
  // Kartu "Total Users (all)" (angka 235 - ganda dengan Player Terdaftar)
  // DIGANTI jadi highlight game paling sering dimainkan SEJAK AWAL: nama +
  // emoji + poin yang dihasilkan game itu. Data dari data.topGamesAll (grup
  // SELURUH public.game_scores, bukan cuma hari ini).
  const topGamesAll = Array.isArray(data.topGamesAll) ? data.topGamesAll : [];
  const topAll = topGamesAll[0] || null;
  const gdTopAll = topAll ? gameDisplay(String(topAll.game || '').toLowerCase(), betaMap) : null;

  const cards = [
    { label: 'Player Terdaftar', value: fmt(m.totalUsers), pick: (s) => s.totalUsers },
    // Kartu Top Game Sepanjang Masa - pakai icon (emoji) + sub (main + poin).
    // wide=true: full-width di mobile (2 kolom jadi sempit, kartu ini perlu
    // ruang supaya nama game + statistik terbaca - permintaan pemilik).
    {
      label: 'Top Game Sepanjang Masa',
      value: gdTopAll ? gdTopAll.name : '-',
      icon: gdTopAll?.icon || null,
      wide: true,
      sub: topAll
        ? `${fmt(topAll.plays)} main · ${fmtRingkas(topAll.points)} poin`
        : 'belum ada data game',
      pick: null,
    },
    { label: 'Poin Beredar', value: fmt(m.totalMoney), pick: (s) => s.totalMoney, color: '#C74B3C' },
    { label: 'Member NEXO Pass', value: fmt(m.premiumCount), pick: null },
    { label: 'Game Hari Ini', value: fmt(m.gamesToday), pick: (s) => s.gamesToday },
    // "Game 7 Hari" diganti "Pemain In-Game" (permintaan pemilik 2026-10-03):
    // lebih berguna untuk memantau kondisi LIVE daripada kumulatif mingguan.
    // Sumber: liveStats.inGameNow (public.playing_users, real-time dari DB).
    {
      label: 'Pemain In-Game',
      value: fmt(data.liveStats?.inGameNow ?? 0),
      sub: 'sedang main sekarang',
      pick: null,
    },
    {
      label: 'Item Terjual',
      value: botKirimItem ? fmt(totalItemTerjual) : '-',
      // Keterangan tambahan di bawah angka: hari ini + poin yang dibelanjakan,
      // supaya satu kartu menjawab "berapa banyak" dan "berapa nilainya".
      sub: botKirimItem
        ? `${fmt(itemHariIni)} hari ini · ${fmt(totalPoinBelanja)} poin`
        : 'bot belum kirim data ini',
      pick: null,
    },
    { label: 'Hutang Aktif', value: fmt(m.loans?.count), pick: null },
    { label: 'Hutang Telat', value: fmt(m.loans?.overdue), pick: null },
    // RAM Bot / Ping WS / Uptime bot DIHAPUS dari Dashboard (permintaan pemilik
    // 2026-10-05): info itu sudah lengkap & realtime di tab "Terminal VPS",
    // jadi di sini hanya duplikat yang bikin panel penuh.
  ];

  const maxPlays = Math.max(...(m.topGamesToday || []).map((g) => g.plays), 1);

  return (
    <div className="space-y-4">
      {/* Bridge status: pita solid - status sistem jangan samar.
          Status dihitung dari HEARTBEAT DB (public.bridge_meta.last_seen),
          bukan snapshot push - jadi akurat walau push gagal.
          Pernyataan "aksi admin menunggu bot" sengaja ditampilkan (2026-10-03)
          supaya admin & pembeli NEXO Pass tidak salah paham: datanya sudah
          tersimpan di antrean, hanya eksekusinya menunggu bot online. */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-4 sm:px-5 sm:py-5 text-white ${stale ? 'bg-danger' : 'bg-success'}`}>
        <p className="text-sm font-bold">
          {/* SEDERHANA (permintaan pemilik 2026-10-03): cukup BOT ONLINE / BOT OFFLINE */}
          {stale ? '⚠ BOT OFFLINE' : '● BOT ONLINE'}
        </p>
        <p className="text-xs text-white/80">
          {snap.bot?.guildCount ?? 0} server · snapshot {timeAgo(snap.ts)}
          {m.botVersion && <span className="ml-3 font-mono">bot v{m.botVersion}</span>}
          {snap.maintenance?.active && <span className="ml-3 rounded bg-ink px-2 py-0.5 font-bold text-card-cream">MAINTENANCE: {snap.maintenance.reason || 'aktif'}</span>}
        </p>
      </div>

      {/* Kartu metrik: 2 kolom mobile, 3 kolom sm, 4 kolom lg.
          min-w-0 wajib agar konten panjang tidak menarik kolom keluar layar.
          truncate pada teks panjang (label, sub, delta) supaya kartu tidak
          meluber di layar sempit. */}
      <div className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => {
          const d = c.pick ? delta24(fullSeries, c.pick) : null;
          return (
            <div key={c.label} className={`nx-card flex h-full min-w-0 flex-col px-3 py-3 sm:px-4 sm:py-4 ${c.wide ? 'col-span-2 sm:col-span-1' : ''}`}>
              <div className="flex min-w-0 items-center gap-1.5">
                {c.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" width={c.wide ? 28 : 22} height={c.wide ? 28 : 22} className={`${c.wide ? 'h-7 w-7' : 'h-[22px] w-[22px]'} shrink-0`} />
                )}
                <div className={`truncate font-display leading-tight text-ink ${c.wide ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'}`}>{c.value}</div>
              </div>
              <div className={`mt-0.5 truncate text-ink-muted ${c.wide ? 'text-sm' : 'text-xs'}`}>{c.label}</div>
              {c.sub && (
                <div className={`mt-0.5 truncate text-ink-faint ${c.wide ? 'text-[0.72rem]' : 'text-[0.62rem]'}`} title={c.sub}>{c.sub}</div>
              )}
              {d != null && (
                <div className={`mt-0.5 text-[0.62rem] font-bold ${d > 0 ? 'text-success' : 'text-danger'}`} title="Perubahan 24 jam">
                  {d > 0 ? '▲' : '▼'} {fmtRingkas(Math.abs(d))} <span className="font-normal">/24 jam</span>
                </div>
              )}
              {c.pick && (
                <div className="mt-auto pt-1">
                  <Spark series={fullSeries} pick={c.pick} color={c.color || '#D98510'} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Grafik besar + pemilih rentang */}
      <div className="nx-card min-w-0 px-4 py-4 sm:px-5 sm:py-5">
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
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Chart series={series} pick={(s) => s.totalMoney} color="#C74B3C" label="Poin beredar" unit="pts" />
          <Chart series={series} pick={(s) => s.gamesToday} color="#2B2118" label="Game dimainkan hari ini" unit="main" />
          <Chart series={series} pick={(s) => s.totalUsers} color="#7BA05B" label="Player terdaftar" unit="orang" />
        </div>
      </div>

      {/* Top games (bar relatif) + top servers + item terlaris + pengundang.
          Semua panel full-width, konsisten dengan panel Tren Ekonomi di atas.
          Sebelumnya pakai grid md:grid-cols-2 sehingga ukurannya berbeda
          dengan Tren Ekonomi yang full-width - pemilik meminta disamakan.
          min-w-0 tetap dipertahankan sebagai jaga-jaga. */}
      <div className="space-y-4">
        <div className="nx-card min-w-0 px-4 py-4 sm:px-5 sm:py-5">
          <h3 className="font-display text-ink">Top Game Hari Ini</h3>
          {(m.topGamesToday || []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Belum ada game hari ini.</p>
          ) : (
            <ul className="mt-3 space-y-2.5 text-sm">
              {m.topGamesToday.map((g) => {
                const gd = gameDisplay(String(g.game_type).toLowerCase(), betaMap);
                return (
                  <li key={g.game_type}>
                    <div className="flex justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-ink">
                        {/* Emoji game dikembalikan (permintaan pemilik
                            2026-09-30). "Rock Paper Scissors (Seri)" memakai
                            emoji RPS yang sama karena bot mencatat seri dengan
                            game_type terpisah (rps_draw) - lihat game-meta.js. */}
                        {gd.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={gd.icon} alt="" width={18} height={18} className="h-4.5 w-4.5 shrink-0" />
                        ) : (
                          <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded bg-accent/15 text-[0.55rem] font-bold text-accent-hover">
                            {gd.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate">{gd.name}</span>
                        {gd.beta && (
                          <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-wider text-ink" title="Game beta - belum dirilis publik">
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

        {/* Item Paling Sering Dibeli
            Sumbernya transaksi asli (kolom item_key), bukan tebakan dari teks.
            Menampilkan 10 terlaris sepanjang masa + jumlah hari ini, supaya
            kelihatan item mana yang masih laku dan mana yang sudah dingin. */}
        <div className="nx-card min-w-0 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-ink">Item Paling Sering Dibeli</h3>
            <span className="text-[0.65rem] text-ink-faint">{fmt(totalItemTerjual)} total</span>
          </div>
          {(() => {
            const daftar = m.itemTerjualAll || [];
            if (daftar.length === 0) {
              // BEDAKAN dua sebab yang berbeda (fix 2026-09-30).
              //
              // Keluhan nyata: kartu menulis "Belum ada pembelian item yang
              // tercatat" padahal toko sudah jalan - sehingga terlihat seperti
              // fiturnya rusak. Penyebabnya BOT BELUM memuat kode baru, jadi
              // kolom itemTerjualAll tidak ada sama sekali di snapshot.
              // Tanpa pembedaan ini, "bot belum kirim" dan "memang belum ada
              // penjualan" tampil dengan kalimat yang sama.
              const botBelumKirim = m.itemTerjualAll === undefined;
              return (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  {botBelumKirim ? (
                    <>
                      Bot belum mengirim data penjualan item. Jalankan ulang bot
                      dengan versi terbaru - rekapnya mulai terisi sejak saat itu,
                      karena pembelian lama tidak punya penanda item.
                    </>
                  ) : (
                    <>
                      Belum ada pembelian item sejak bot diperbarui. Pembelian
                      SEBELUM pembaruan tidak ikut terhitung, jadi rekapnya mulai
                      kosong dan terisi begitu pemain membeli item baru.
                    </>
                  )}
                </p>
              );
            }
            // Peta "hari ini" untuk anotasi tiap baris.
            const hariIni = new Map((m.itemTerjualToday || []).map((x) => [x.itemKey, x.kali]));
            // Nama item diambil dari katalog toko; kalau item sudah dihapus
            // dari katalog, tampilkan itemKey-nya apa adanya (jangan dikosongkan).
            const katalog = new Map((snap.shopItems || []).map((it) => [it.itemKey, it]));
            const maks = Math.max(...daftar.map((x) => x.kali), 1);
            // Permintaan pemilik: "list itu tu muncul 4 paling banyak item
            // terjual" - jadi daftar dipangkas jadi 4, tidak 10.
            const baris = daftar.slice(0, 4).map((x) => {
              // Bot sudah mengirim nama + emojiUrl lewat JOIN ke katalog.
              // Katalog lokal tetap dipakai sebagai cadangan kalau bot versi
              // lama belum mengirimnya; terakhir, itemKey ditampilkan apa adanya
              // supaya baris tidak pernah kosong.
              const it = katalog.get(x.itemKey);
              return {
                nama: x.nama || it?.name || x.itemKey,
                // DUA bentuk emoji: gambar (custom Discord) atau teks (Unicode).
                // Bot mengirim keduanya; katalog lokal jadi cadangan.
                emojiUrl: x.emojiUrl || it?.emojiUrl || null,
                emoji: x.emoji || it?.emoji || null,
                ...x,
              };
            });
            return (
              <ul className="mt-3 space-y-2.5 text-sm">
                {baris.map((b) => (
                  <li key={b.itemKey}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-ink">
                        {/* Emoji custom Discord -> gambar. Emoji Unicode
                            (🎁, ⚡, 🎲) tidak punya ID sehingga TIDAK BISA
                            jadi gambar - harus dirender sebagai teks.
                            Tanpa cabang kedua ini, item ber-emoji Unicode
                            tampil polos tanpa ikon sama sekali. */}
                        {b.emojiUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.emojiUrl} alt="" width={16} height={16} className="h-4 w-4 shrink-0" />
                        ) : b.emoji ? (
                          <span className="w-4 shrink-0 text-center text-sm leading-none" aria-hidden="true">
                            {b.emoji}
                          </span>
                        ) : null}
                        <span className="truncate" title={b.nama}>{b.nama}</span>
                      </span>
                      <span className="shrink-0 text-ink-muted">
                        {fmtRingkas(b.kali)}x
                        {hariIni.get(b.itemKey) ? (
                          <span className="ml-1.5 text-[0.65rem] text-success">+{hariIni.get(b.itemKey)} hari ini</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-soft">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (b.kali / maks) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>

        {/* Pengundang Terbanyak (Referral)
            Permintaan pemilik 2026-09-30: tampilkan 10 orang yang paling
            banyak mengundang lewat referral, lengkap dengan namanya.
            Nama sudah di-JOIN di sisi bot, jadi di sini tinggal ditampilkan. */}
        <div className="nx-card min-w-0 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-ink">Pengundang Terbanyak</h3>
            <span className="text-[0.65rem] text-ink-faint">
              {m.referral ? fmt(m.referral.total) + ' pemakaian kode' : ''}
            </span>
          </div>
          {(() => {
            const ref = m.referral;
            if (!ref) {
              return (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  Bot belum mengirim data referral. Jalankan ulang bot dengan versi terbaru.
                </p>
              );
            }
            const atas = ref.teratas || [];
            if (!atas.length) {
              return <p className="mt-3 text-sm text-ink-muted">Belum ada yang memakai kode referral.</p>;
            }
            const maks = Math.max(...atas.map((x) => x.jumlah), 1);
            return (
              <ul className="mt-3 space-y-2.5 text-sm">
                {atas.slice(0, 10).map((x, i) => (
                  <li key={x.userId || i}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 text-ink">
                        <span className="w-4 shrink-0 font-display text-xs text-ink-muted">{i + 1}</span>
                        {/* Foto profil: bot mengambil URL terbaru dari Discord
                            (cache dulu, lalu REST), jadi ganti PP ikut kebaca.
                            Kalau belum ada, jatuh ke inisial nama - bukan
                            gambar rusak. */}
                        {x.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={x.avatarUrl}
                            alt=""
                            width={22}
                            height={22}
                            loading="lazy"
                            className="h-[22px] w-[22px] shrink-0 rounded-full border border-border-soft bg-bg-soft object-cover"
                          />
                        ) : (
                          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent/15 text-[0.55rem] font-bold text-accent-hover">
                            {String(x.username || '?').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span className="truncate" title={x.username || x.userId}>
                          {x.username || x.userId}
                        </span>
                      </span>
                      <span className="shrink-0 text-ink-muted">
                        {fmtRingkas(x.jumlah)} orang
                        <span className="ml-1.5 text-[0.65rem] text-success">+{fmtRingkas(x.poin)}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-soft">
                      <div className="h-full rounded-full bg-success" style={{ width: `${Math.max(4, (x.jumlah / maks) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>

        <div className="nx-card min-w-0 px-4 py-4 sm:px-5 sm:py-5">
          <h3 className="font-display text-ink">Top Server</h3>
          {(m.servers || m.topServers || []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Belum ada data server.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {/* 5 server di HP, 10 di layar lebar. Di HP daftar 10 baris
                  bikin halaman sangat panjang dan mendorong kartu lain jauh
                  ke bawah - padahal admin biasanya cuma perlu lihat teratas. */}
              {(m.servers || m.topServers).slice(0, 5).map((s) => {
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

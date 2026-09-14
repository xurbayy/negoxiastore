'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { emojiSrc } from '../lib/emojisClient';
// Helper bersama diambil dari lib/formatClient - SATU sumber untuk fmt, timeAgo,
// dan gameName. Dulu file ini punya salinan sendiri-sendiri (fmt, stripEmoji,
// GAME_NAMES) sehingga isinya bisa menyimpang dari halaman lain.
import { gameName, fmt as fmtLib } from '../lib/formatClient';
import { stripEmojiToken as stripEmoji } from '../lib/snapshot';

function relTime(ts) {
  const diff = Date.now() - Number(ts);
  if (diff < 0 || !ts) return '-';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

// fmt punya aturan berbeda di sini: nilai kosong jadi 0 (bukan '-') karena
// dipakai untuk angka statistik pemain yang selalu ada.
function fmt(n) {
  return fmtLib(Number(n ?? 0));
}

// Isi placeholder {n} pada deskripsi misi dengan target aslinya.
function missionDesc(mi) {
  return String(mi.desc || '').replace(/{n}/g, fmt(mi.target ?? 0));
}

function nowMs() {
  return Date.now();
}

const BOT_INVITE_URL =
  'https://discord.com/oauth2/authorize?client_id=1497924277301936300&scope=bot+applications.commands&permissions=277025508352';

// ── Stat icon per label: custom emoji Discord resmi (web-emojis.json).
// fire = streak harian - winstreak = mp - trophy = menang - dice = pasang.
const STAT_ICONS = {
  'Streak Harian': '267042fire',
  'Winstreak': 'winstreak',
  'Total Won': 'trophy',
  'Total Bet': 'dice',
};

// Fallback daftar game beta - HANYA dipakai kalau snapshot bot belum pernah
// push (bot offline baru pertama). Sumber utama: payload bot betaGames.
const BETA_FALLBACK = [
  { key: 'dice', mode: 'solo', name: 'Lucky Dice', desc: 'Lempar 2 dadu - 7 x2, 11 x3, dobel bonus!' },
  { key: 'sum', mode: 'mp', name: 'Sum Duel', desc: 'Pilih angka terdekat ke target - butuh 2+ pemain.' },
  { key: 'heal', mode: 'coop', name: 'Heal Squad', desc: 'Kalahkan Virus bareng tim - butuh 2+ pemain.' },
];
const MODE_LABEL = { solo: 'Solo', mp: 'Multiplayer', coop: 'Co-op' };
// Ikon mode = emoji resmi yang SAMA dengan header grup di halaman Game
// (Games.jsx GROUP_EMOJI): coba nama baru dulu, fallback nama registry.
// Emoji-only sesuai permintaan; label teks tetap ada sbg tooltip/alt.
const MODE_EMOJI = {
  solo: ['game', 'controller'],
  mp: ['loadingbox', 'mp'],
  coop: ['399536hd2hellvictory', 'coop'],
};

export default function MeClient({ betaGames = null }) {
  const [state, setState] = useState({ loading: true, authenticated: false, user: null, profile: null });
  const [upsellDismissed, setUpsellDismissed] = useState(false);
  const [histPage, setHistPage] = useState(0);
  const [invPage, setInvPage] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      const data = await res.json();
      setState({ loading: false, authenticated: Boolean(data.authenticated), user: data.user || null, profile: data.profile || null });
      return data;
    } catch {
      setState((s) => ({ ...s, loading: false }));
      return null;
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  // AUTO-REFRESH ADAPTIF (2026-09-14, tanpa tombol Refresh):
  //  - Tab AKTIF & data belum lengkap  -> 5 dtk (nunggu bot balas cepat)
  //  - Tab AKTIF & data sudah ada      -> 20 dtk (update admin/grant kebaca)
  //  - Tab TIDAK aktif (idle/background) -> berhenti total, hemat
  //  - Tab kembali aktif                -> langsung load() sekali (terasa instan)
  //  - Ada perubahan data              -> load() tambahan (langsung tampil)
  useEffect(() => {
    if (!state.authenticated) return;
    let iv = null;
    let stopped = false;

    const intervalFor = () => (state.profile?.exists ? 20000 : 5000);

    const start = () => {
      if (stopped) return;
      if (iv) clearInterval(iv);
      iv = setInterval(load, intervalFor());
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (iv) { clearInterval(iv); iv = null; } // idle: berhenti, hemat kuota
      } else {
        load();   // balik ke tab: langsung segarkan (terasa tanpa delay)
        start();
      }
    };

    const onFocus = () => { if (!document.hidden) load(); };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      stopped = true;
      if (iv) clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [state.authenticated, state.profile?.exists, load]);

  useEffect(() => {
    const t = setTimeout(() => {
      try { setUpsellDismissed(sessionStorage.getItem('nexo_upsell_hidden') === '1'); } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function hideUpsell() {
    setUpsellDismissed(true);
    try { sessionStorage.setItem('nexo_upsell_hidden', '1'); } catch {}
  }

  if (state.loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-44 w-full" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-2/3" />
      </div>
    );
  }

  if (!state.authenticated) {
    return (
      <div className="nx-card px-6 py-10 text-center">
        <p className="text-ink-muted">Kamu belum login.</p>
        <a href="/api/auth/login?returnTo=%2Fme" className="btn-primary mt-5 inline-flex cursor-pointer">Login dengan Discord</a>
      </div>
    );
  }

  // Identitas fresh: profil bot (avatarUrl) diutamakan, fallback avatar OAuth
  const freshAvatar = state.profile?.avatarUrl || state.profile?.profile?.avatarUrl || state.user?.avatar;
  const freshName = state.profile?.username || state.profile?.profile?.username || state.user?.username;

  const p = state.profile?.profile;
  // Daftar beta dari payload bot (sinkron otomatis dengan registry nxtest);
  // fallback cuma saat snapshot belum pernah sampai.
  const betaList = (Array.isArray(betaGames) && betaGames.length
    ? betaGames
    : BETA_FALLBACK
  ).map(g => ({ ...g, type: g.type || MODE_LABEL[g.mode] || g.mode || 'Beta' }));
  const exists = state.profile?.exists === true;
  const needsOnboarding = Boolean(state.profile?.needsOnboarding);
  // PENTING: profile === null BUKAN berarti "user tidak terdaftar". Itu bisa
  // berarti bot belum sempat menjawab permintaan data (baru login pertama kali,
  // request masih mengantre di bot_commands). Dulu dua keadaan ini disatukan,
  // sehingga pemain yang SUDAH lama main di NEXO tapi baru pertama buka web
  // langsung disuguhi "Data kamu belum ada / belum terdaftar, aku bukan dukun".
  // Sekarang: menunggu balasan bot = tampilkan status "sedang menyiapkan data".
  const menungguBot = !state.profile;

  const isBanned = Boolean(state.profile?.isBanned);
  if (isBanned) {
    return (
      <div className="space-y-6 text-center py-10">
        <h1 className="font-display text-8xl font-extrabold text-danger/20" style={{ textShadow: '0 0 40px rgba(199,75,60,0.12)' }}>404</h1>
        <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Profil Tidak Ditemukan.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
          Sistem tidak dapat menemukan data profil untuk akun Discord-mu. Hal ini biasanya terjadi jika data kamu <strong>telah dihapus</strong>, atau akunmu terkena <strong>banned</strong> dari layanan NEXO.
        </p>
        
        <div className="mx-auto mt-7 flex flex-col items-center justify-center rounded-xl border border-border-soft bg-card-dark p-4 max-w-md">
          <div className="flex items-center w-full justify-center">
            <span className="font-mono text-sm text-warning">$ nexobot profile --user me</span>
          </div>
          <div className="mt-2 text-left w-full border-t border-white/5 pt-2 font-mono text-xs text-danger">
            [!] ERROR: DATA_WIPED_OR_BANNED<br/>
            {state.profile?.banReason && <><span className="text-white/40">Reason:</span> {state.profile.banReason}</>}
            {state.profile?.timeoutUntil > 0 && <><br/><span className="text-white/40">Timeout until:</span> {new Date(state.profile.timeoutUntil).toLocaleString('id-ID')}</>}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <a href="/api/auth/logout" className="btn-primary cursor-pointer text-sm">
            Logout Discord
          </a>
          <Link href="/" className="btn-ghost cursor-pointer text-sm">
            Ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  // ---------- MENUNGGU BOT (bukan "tidak terdaftar") ----------
  // User sudah login, tapi bot belum menjawab permintaan data. Jangan tampilkan
  // pesan onboarding yang bikin salah paham - cukup beri tahu datanya menyusul.
  if (menungguBot) {
    return (
      <div className="space-y-6">
        <div className="nx-dark px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {freshAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={freshAvatar} alt="" width={56} height={56} className="h-14 w-14 rounded-full ring-2 ring-accent shadow-[0_0_16px_rgba(241,154,26,0.3)]" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-lg text-white shadow-[0_0_16px_rgba(241,154,26,0.3)]">
                  {(freshName || '?').slice(0, 2).toUpperCase()}
                </span>
              )}
              <div>
                <h1 className="font-display text-xl text-card-cream">{freshName}</h1>
                <p className="text-sm text-ink-faint">Login Discord berhasil</p>
              </div>
            </div>
            <a href="/api/auth/logout" className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-white px-3.5 py-1.5 text-sm font-semibold text-danger shadow-sm transition hover:-translate-y-px hover:bg-danger hover:text-white active:translate-y-0 active:shadow-none cursor-pointer">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              Logout
            </a>
          </div>
        </div>

        <div className="nx-card px-6 py-10 text-center">
          <span className="mx-auto mb-4 inline-flex h-10 w-10 animate-spin items-center justify-center rounded-full border-2 border-border-soft border-t-accent" aria-hidden="true" />
          <h2 className="font-display text-2xl tracking-tight text-ink">Menyiapkan datamu</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
            Bot sedang mengirim profil kamu dari Discord. Halaman ini menyegarkan sendiri,
            jadi kamu tinggal tunggu beberapa detik - tidak perlu logout atau daftar ulang.
          </p>
          <p className="mx-auto mt-4 max-w-md text-xs text-ink-faint">
            Sudah main di NEXO? Tenang, datamu aman. Kalau belum pernah daftar, ketik{' '}
            <code className="rounded bg-bg-soft px-2 py-0.5 font-mono">nxd</code> di server yang ada botnya.
          </p>
        </div>
      </div>
    );
  }

  // ---------- SMART ONBOARDING: 3 kondisi ----------
  if (!exists || needsOnboarding) {
    const unknown = state.profile?.reason === 'unknown_user';
    return (
      <div className="space-y-6">
        {/* Header mini */}
        <div className="nx-dark px-6 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {freshAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={freshAvatar} alt="" width={56} height={56} className="h-14 w-14 rounded-full ring-2 ring-accent shadow-[0_0_16px_rgba(241,154,26,0.3)]" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent font-display text-lg text-white shadow-[0_0_16px_rgba(241,154,26,0.3)]">
                  {(freshName || '?').slice(0, 2).toUpperCase()}
                </span>
              )}
              <div>
                <h1 className="font-display text-xl text-card-cream">{freshName}</h1>
                <p className="text-sm text-ink-faint">Login Discord berhasil</p>
              </div>
            </div>
            <a href="/api/auth/logout" className="inline-flex items-center gap-1.5 rounded-lg border border-danger/40 bg-white px-3.5 py-1.5 text-sm font-semibold text-danger shadow-sm transition hover:-translate-y-px hover:bg-danger hover:text-white active:translate-y-0 active:shadow-none cursor-pointer">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              Logout
            </a>
          </div>
        </div>

        <div className="nx-card px-6 py-10 text-center">
          <h2 className="font-display text-5xl tracking-tight text-ink">404.</h2>
          <p className="mt-1 font-display text-xl tracking-tight text-ink">
            {unknown ? 'Data kamu belum ada di sini.' : 'Tapi hampir loh.'}
          </p>
          <div className="nx-dark mx-auto mt-5 max-w-md px-5 py-4 text-left">
            <p className="text-sm leading-relaxed text-card-cream">
              <span className="font-bold text-accent">NEXO</span>{' '}
              <span className="text-ink-faint">&gt;</span>{' '}
              <span className="text-ink-steel">&lt;@{freshName || 'kamu'}&gt;</span>{' '}
              belum terdaftar di database-ku. Aku ini bot, bukan dukun. 🔮
            </p>
          </div>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
            Website ini mencerminkan profilmu di Discord, dan kita belum pernah ketemu.
            Daftar 10 detik, balik lagi.
          </p>

          <ol className="mx-auto mt-6 max-w-md space-y-3 text-left">
            <li className="flex items-start gap-3 rounded-xl border border-border-soft bg-card-cream px-4 py-3 transition hover:border-accent/40">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-sm">1</span>
              <span className="text-sm text-ink">Invite NEXO Games ke server Discord kamu</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl border border-border-soft bg-card-cream px-4 py-3 transition hover:border-accent/40">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-sm">2</span>
              <span className="text-sm text-ink">Ketik <code className="rounded bg-bg-soft px-2 py-0.5 font-mono">nxd</code> di server itu untuk mendaftar</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl border border-border-soft bg-card-cream px-4 py-3 transition hover:border-accent/40">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white shadow-sm">3</span>
              <span className="text-sm text-ink">Kembali ke halaman ini - data muncul <strong>otomatis</strong> begitu bot memproses</span>
            </li>
          </ol>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className={unknown ? 'btn-primary cursor-pointer' : 'btn-ghost px-4! py-2! text-sm cursor-pointer'}>
              Invite NEXO ke Server Kamu
            </a>
          </div>

          {state.profile?.hint && (
            <p className="mx-auto mt-5 max-w-md text-xs italic text-ink-muted">{state.profile.hint}</p>
          )}
          <p className="mx-auto mt-4 max-w-md text-[0.7rem] text-ink-faint">
            Halaman ini menyegarkan sendiri - data muncul otomatis begitu bot selesai memproses.
            Pastikan kamu login pakai akun Discord yang sama.
          </p>
        </div>
      </div>
    );
  }

  // ---------- PROFIL LENGKAP ----------
  // Normalisasi status premium: bot mengirim `premium` sebagai OBJEK
  // ({tier, expiresAt, lifetime, daysLeft, betaAccess}) atau null. Boolean(obj)
  // selalu true untuk objek apa pun - termasuk objek yang sudah KEDALUWARSA dari
  // cache profil lama (<5 menit). Karena itu objeknya diperiksa isinya, sama
  // seperti userHasPremium di lib/snapshot.js. Aturannya: lifetime = aktif;
  // kalau tidak, expiresAt harus masih di depan now.
  const isPremium = (() => {
    const pr = p.premium;
    if (pr === true) return true;
    if (!pr || typeof pr !== 'object') return false;
    if (pr.lifetime) return true;
    const exp = Number(pr.expiresAt);
    return Number.isFinite(exp) ? exp > nowMs() : false;
  })();
  const premiumActive = isPremium
    ? p.premium.lifetime
      ? 'LIFETIME'
      : `sisa ${p.premium.daysLeft ?? Math.max(0, Math.ceil((Number(p.premium.expiresAt) - nowMs()) / 86400000))} hari`
    : null;
  // Premium: riwayat di-paging 10/halaman (tombol next), gratis: tetap 10 terakhir.
  const HISTORY_PER_PAGE = 10;
  const historyPages = isPremium ? Math.max(1, Math.ceil((p.history || []).length / HISTORY_PER_PAGE)) : 1;
  const safeHistoryPage = Math.min(histPage, historyPages - 1);
  const historySlice = isPremium
    ? (p.history || []).slice(safeHistoryPage * HISTORY_PER_PAGE, (safeHistoryPage + 1) * HISTORY_PER_PAGE)
    : (p.history || []).slice(0, 10);

  return (
    <div className="space-y-5">
      {/* ═══ HEADER: kartu dark ala Discord ═══ */}
      <div className="nx-dark overflow-hidden">
        <div className="nx-dark-header flex items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <span className="truncate font-mono text-xs uppercase tracking-wider text-ink-faint">profil pemain</span>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <a
              href="/api/auth/logout"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/40 bg-white px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap text-danger shadow-sm transition hover:-translate-y-px hover:bg-danger hover:text-white active:translate-y-0 active:shadow-none cursor-pointer sm:px-3.5 sm:text-xs"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              Logout
            </a>
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Avatar with gaming glow */}
              {p.avatarUrl || freshAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.avatarUrl || freshAvatar} alt="" width={64} height={64} className="h-16 w-16 rounded-full ring-2 ring-accent/80 shadow-[0_0_24px_rgba(241,154,26,0.3)]" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent font-display text-xl text-white shadow-[0_0_24px_rgba(241,154,26,0.3)]">
                  {(freshName || '?').slice(0, 2).toUpperCase()}
                </span>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl text-card-cream" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}>{p.username}</h1>
                  {/* Title badge - standardized with nx-badge */}
                  {p.titleInfo && (
                    <span
                      className="nx-badge"
                      style={{
                        background: (p.titleInfo.color || '#F19A1A') + '22',
                        color: p.titleInfo.color || '#F19A1A',
                        border: '1px solid ' + (p.titleInfo.color || '#F19A1A') + '55',
                      }}
                    >
                      {p.titleInfo.emojiUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.titleInfo.emojiUrl} alt="" width={14} height={14} className="h-3.5 w-3.5" />
                      )}
                      {String(p.titleInfo.label || '').replace(/<a?:[A-Za-z0-9_]+:\d+>/g, '').trim()}
                    </span>
                  )}
                  {/* Admin title badge - standardized */}
                  {Array.isArray(p.adminTitleInfo?.parts) && p.adminTitleInfo.parts.length > 0 && (
                    <span className="nx-badge bg-bg-soft tracking-wide text-ink-muted">
                      {p.adminTitleInfo.parts.map((pt, i) =>
                        pt.emojiUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={pt.emojiUrl} alt="" width={14} height={14} className="inline h-3.5 w-3.5 align-middle" />
                        ) : (
                          <span key={i}>{pt.text}</span>
                        )
                      )}
                    </span>
                  )}
                  {/* STATUS NEXO PASS - standardized nx-badge */}
                  {isPremium ? (
                    <span className="nx-badge bg-success px-3 py-1 text-white shadow-sm">
                      {emojiSrc('download3') && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={emojiSrc('download3')} alt="" width={12} height={12} className="h-3 w-3" />
                      )}
                      NEXO Pass · {premiumActive}
                    </span>
                  ) : (
                    <span className="nx-badge bg-card-dark-2 px-3 py-1 text-ink-faint">NEXO Pass · Belum aktif</span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-ink-faint">
                  {isPremium && p.usernameInGame && p.usernameInGame !== p.username && (
                    <span className="mr-2 text-xs">in-game: {p.usernameInGame}</span>
                  )}
                  Level {p.level} · Rank #{p.globalRank ?? '-'} global
                  {p.guild && <span> · {stripEmoji(p.guild.name)}</span>}
                </p>
              </div>
            </div>

            {/* Points with glow */}
            <div className="text-right">
              <div className="font-display text-3xl text-accent" style={{ textShadow: '0 0 20px rgba(241,154,26,0.3)' }}>
                {emojiSrc('goldcoin') && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={emojiSrc('goldcoin')} alt="" width={22} height={22} className="mr-1.5 inline h-5 w-5" />
                )}
                {fmt(p.points)}
              </div>
              <div className="text-xs font-medium uppercase tracking-wider text-ink-faint">poin</div>
            </div>
          </div>

          {/* XP bar with shimmer */}
          {p.xpNext != null && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-ink-faint">
                <span className="font-semibold">Level {p.level}</span>
                <span>{fmt(p.xp)} / {fmt(p.xpNext)} XP</span>
              </div>
              <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-card-dark-2">
                <div
                  className="shimmer h-full rounded-full bg-linear-to-r from-accent to-accent-hover"
                  style={{ width: `${Math.min(100, Math.round((Number(p.xp) / Math.max(1, Number(p.xpNext))) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Stat tiles with icons + hover */}
          <dl className={`mt-5 grid grid-cols-2 gap-3 ${isPremium ? 'sm:grid-cols-4' : ''}`}>
            {[
              ['Streak Harian', p.dailyStreak], ['Winstreak', p.winstreak],
              ...(isPremium ? [['Total Won', p.totalWon], ['Total Bet', p.totalBet]] : []),
            ].map(([k, v]) => (
              <div key={k} className="stat-tile">
                <dt className="flex items-center text-[0.65rem] uppercase tracking-wider text-ink-faint">
                  {emojiSrc(STAT_ICONS[k]) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emojiSrc(STAT_ICONS[k])} alt="" width={14} height={14} className="mr-1.5 inline h-3.5 w-3.5 shrink-0" />
                  ) : null}
                  {k}
                </dt>
                <dd className="mt-1 font-display text-lg text-card-cream">{fmt(v)}</dd>
              </div>
            ))}
            {!isPremium && (
              <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl border border-dashed border-ink-faint/30 px-4 py-3">
                <span className="pl-1 flex items-center text-xs text-ink-faint">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {emojiSrc('trophy') && <img src={emojiSrc('trophy')} alt="" width={13} height={13} className="mr-1 inline h-3 w-3" />} Total Won &amp;
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {emojiSrc('dice') && <img src={emojiSrc('dice')} alt="" width={13} height={13} className="ml-2 mr-1 inline h-3 w-3" />} Total Bet · statistik lengkap
                </span>
                <span className="nx-badge bg-accent px-2.5 py-0.5 font-extrabold text-ink">NEXO Pass</span>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* ═══ STATUS AKUN BANNER ═══ */}
      {isPremium ? (
        <div className="glow-success flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/40 bg-success/10 px-6 py-5">
          <div>
            <p className="font-display text-lg text-ink">
              Akun Premium · NEXO Pass
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              {premiumActive === 'LIFETIME' ? 'Berlaku LIFETIME' : `Aktif sampai ${new Date(Number(p.premium.expiresAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`}
              {p.premium.betaAccess && <span className="nx-badge bg-accent font-extrabold text-ink">Beta Access</span>}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2 text-sm font-bold text-white shadow-sm">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
            Semua perk aktif
          </span>
        </div>
      ) : (
        !upsellDismissed && (
          <div className="overflow-hidden rounded-2xl border border-border-soft bg-card-cream">
            {/* Accent strip kiri */}
            <div className="flex">
              <div className="w-1.5 shrink-0 bg-accent" aria-hidden="true" />
              <div className="flex flex-1 flex-wrap items-center justify-between gap-4 px-6 py-6">
                <div className="flex items-center gap-4">
                  {emojiSrc('download3') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emojiSrc('download3')} alt="" width={40} height={40} className="h-10 w-10 shrink-0" />
                  )}
                  <div>
                    <p className="font-display text-lg text-ink">Buka semua fitur dengan NEXO Pass.</p>
                    <p className="mt-0.5 max-w-sm text-sm text-ink-muted">
                      Statistik lengkap, riwayat 25 game, inventori unlimited, kuota +5.000, dan akses game beta.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-display text-2xl text-ink">Rp 20.000</p>
                    <p className="text-xs text-ink-muted">per bulan</p>
                  </div>
                  <Link href="/premium" className="btn-primary cursor-pointer">
                    Upgrade
                  </Link>
                  <button type="button" onClick={hideUpsell} aria-label="Sembunyikan" className="text-ink-faint transition hover:text-ink cursor-pointer">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* ═══ GRID 2 KOLOM ═══ */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* ── Misi harian ── */}
          {p.missions?.missions?.length > 0 && (
            <div className="nx-card px-6 py-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg text-ink">Misi Harian</h3>
                {isPremium && <span className="nx-badge bg-success font-extrabold text-white">4 slot / hari</span>}
              </div>
              <ul className="mt-4 space-y-3">
                {p.missions.missions.map((m) => {
                  const done = m.progress >= m.target;
                  return (
                    <li key={m.id} className="overflow-hidden rounded-xl border border-border-soft bg-card-cream/70">
                      <div className="flex">
                        {/* Left accent border per mission */}
                        <div className={`w-1 shrink-0 ${done ? 'bg-success' : m.progress > 0 ? 'bg-accent' : 'bg-border-soft'}`} aria-hidden="true" />
                        <div className="flex-1 px-4 py-3">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex items-center gap-2 text-ink">
                              {m.emojiUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={m.emojiUrl} alt="" width={18} height={18} className="h-4.5 w-4.5 shrink-0" />
                              ) : (
                                <span aria-hidden="true">{m.icon}</span>
                              )}
                              {missionDesc(m)}
                            </span>
                            {m.claimed ? (
                              <span className="nx-badge bg-success/15 font-extrabold text-success">✓ Dicairkan</span>
                            ) : (
                              <span className="rounded-full bg-bg-soft px-2.5 py-0.5 text-xs font-semibold text-ink-muted">{m.progress}/{m.target}</span>
                            )}
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-soft">
                            <div className={`h-full rounded-full ${done ? 'bg-success' : 'bg-accent'}`} style={{ width: `${Math.min(100, Math.round((m.progress / Math.max(1, m.target)) * 100))}%` }} />
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ── Riwayat game ── */}
          <div className="nx-dark overflow-hidden">
            <div className="nx-dark-header flex items-center justify-between px-6 py-3">
              <h3 className="font-display text-lg text-card-cream">Riwayat Game</h3>
              {!isPremium && <span className="nx-badge bg-card-dark-2 text-ink-faint">10 terakhir</span>}
              {isPremium && historyPages > 1 && (
                <span className="text-xs text-ink-faint">
                  halaman {safeHistoryPage + 1} dari {historyPages}
                </span>
              )}
            </div>
            <div className="px-6 py-4">
              {(p.history || []).length === 0 ? (
                <p className="py-3 text-sm text-ink-faint">Belum ada game dimainkan.</p>
              ) : (
                <ul className="divide-y divide-card-dark-2">
                  {historySlice.map((h, i) => (
                    <li key={`${safeHistoryPage}-${i}`} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-card-cream">{gameName(h.gameType)}</span>
                      <span className="flex items-center gap-4">
                        <span className={Number(h.points) >= 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>
                          {Number(h.points) >= 0 ? '+' : ''}{fmt(h.points)}
                        </span>
                        <span className="w-24 text-right text-xs text-ink-faint">{relTime(h.playedAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {isPremium && historyPages > 1 && (
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setHistPage(Math.max(0, safeHistoryPage - 1))}
                    disabled={safeHistoryPage === 0}
                    className="rounded-xl border border-card-dark-2 px-4 py-2 text-xs font-semibold text-card-cream transition hover:bg-card-dark-2 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
                  >
                    ← Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistPage(Math.min(historyPages - 1, safeHistoryPage + 1))}
                    disabled={safeHistoryPage >= historyPages - 1}
                    className="rounded-xl border border-card-dark-2 px-4 py-2 text-xs font-semibold text-card-cream transition hover:bg-card-dark-2 disabled:cursor-not-allowed disabled:opacity-35 cursor-pointer"
                  >
                    Berikutnya →
                  </button>
                </div>
              )}
              {!isPremium && (p.history || []).length > 10 && (
                <p className="mt-3 text-center text-xs text-ink-faint">
                  Riwayat lengkap 25 game terlihat dengan NEXO Pass.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ═══ KOLOM KANAN ═══ */}
        <div className="space-y-5">
          {/* ── Inventori ── */}
          <div className="nx-card px-6 py-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-ink">Inventori</h3>
              {isPremium ? (
                <span className="nx-badge bg-success font-extrabold text-white">Unlimited</span>
              ) : (
                // Indikator kapasitas gratis. Dulu bar-nya nempel banget ke teks
                // "2/5" (gap-2 + bar tipis) sehingga terbaca mepet. Sekarang bar
                // lebih longgar, ada pemisah, dan angka diberi lebar tetap supaya
                // tidak bergeser saat nilainya berubah.
                <span className="flex items-center gap-2.5" title="Maksimal 5 item berbeda untuk akun gratis">
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`h-2 w-4 rounded-full transition-colors ${i < (p.inventory || []).length ? 'bg-accent' : 'bg-border-soft'}`}
                      />
                    ))}
                  </span>
                  <span className="h-3.5 w-px bg-border-soft" aria-hidden="true" />
                  <span className="min-w-[2.25rem] text-right text-xs font-semibold tabular-nums text-ink-muted">
                    {(p.inventory || []).length}/5
                  </span>
                </span>
              )}
            </div>
            {(p.inventory || []).length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                Masih kosong. Belanja di{' '}
                <code className="rounded bg-bg-soft px-2 py-0.5 font-mono text-ink">nxshop</code>!
              </p>
            ) : (
              <>
                <ul className="mt-4 space-y-2">
                  {p.inventory.slice(invPage * 10, (invPage + 1) * 10).map((it) => (
                    <li key={it.itemKey} className="inv-item flex items-center justify-between gap-2 rounded-xl border border-border-soft bg-card-cream/70 px-3.5 py-2.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-ink">
                        {it.emojiUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.emojiUrl} alt="" width={18} height={18} className="h-4.5 w-4.5 shrink-0" />
                        ) : it.emoji ? (
                          <span aria-hidden="true">{it.emoji}</span>
                        ) : null}
                        <span className="truncate">{it.name}</span>
                      </span>
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-xs font-bold text-accent-hover">×{it.quantity}</span>
                    </li>
                  ))}
                </ul>
                {p.inventory.length > 10 && (
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setInvPage(Math.max(0, invPage - 1))}
                      disabled={invPage === 0}
                      className="text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-30"
                    >
                      &larr; Prev
                    </button>
                    <span className="text-xs text-ink-muted">
                      {invPage * 10 + 1}-{Math.min((invPage + 1) * 10, p.inventory.length)} dari {p.inventory.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setInvPage(Math.min(Math.floor((p.inventory.length - 1) / 10), invPage + 1))}
                      disabled={(invPage + 1) * 10 >= p.inventory.length}
                      className="text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-30"
                    >
                      Next &rarr;
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Beta games ── */}
          <div className={`nx-card px-6 py-6 ${isPremium && p.premium?.betaAccess ? 'border-success/30' : ''}`}>
            <h3 className="font-display text-lg text-ink">Beta Games</h3>
            {isPremium && p.premium?.betaAccess ? (
              <>
                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-success">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
                  Akses beta terbuka
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  Game beta aktif bisa langsung kamu mainkan lewat{' '}
                  <code className="rounded bg-bg-soft px-2 py-0.5 font-mono text-ink">nxtest</code>{' '}
                  di Discord. Semua game beta jalannya lewat lobi ini, khusus member premium.
                </p>
                <ul className="mt-4 space-y-2">
                  {(betaList || []).map(g => {
                    // Ikon mode = emoji resmi (sama dgn header grup di halaman Game):
                    // game=solo, mp=multiplayer, coop=co-op. Emoji-only sesuai
                    // permintaan; label teks tetap ada sbg tooltip/alt.
                    const modeIcon = (MODE_EMOJI[g.mode] || []).map((n) => emojiSrc(n, 64)).find(Boolean) || null;
                    return (
                      <li key={g.key} className="flex items-center gap-3 rounded-xl border border-border-soft bg-card-cream/70 px-4 py-3 text-sm">
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="font-bold text-ink">{g.name}</span>
                          <span className="text-xs leading-relaxed text-ink-muted">{g.desc}</span>
                        </div>
                        {modeIcon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={modeIcon} alt={g.type} title={g.type} width={24} height={24} className="h-6 w-6 shrink-0" />
                        ) : (
                          <span className="shrink-0 rounded-md bg-accent/15 px-2 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-accent-hover">{g.type}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <>
                <div className="mt-3 rounded-xl border border-dashed border-border-soft bg-bg-soft/50 px-4 py-4 text-center">
                  <p className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-muted">
                    {emojiSrc('lock') && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc('lock')} alt="" width={16} height={16} className="h-4 w-4 opacity-60" />
                    )}
                    Terkunci
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                    Coba game baru sebelum rilis publik, khusus member NEXO Pass.
                  </p>
                  <Link href="/premium" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-hover underline-offset-2 hover:underline cursor-pointer">
                    Lihat NEXO Pass →
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══ HUTANG BANK ═══ */}
      {p.loan && (Number(p.loan.amount) > 0 || Number(p.loan.totalDue) > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-6 py-5">
          <div>
            <p className="font-display text-lg text-danger">Hutang Bank</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              Pinjaman <span className="font-semibold text-ink">{fmt(p.loan.amount)}</span> ·
              Total due <span className="font-semibold text-ink">{fmt(p.loan.totalDue)}</span> ·
              Jatuh tempo {new Date(p.loan.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              {p.loan.dueDate < nowMs() && (
                <span className="nx-badge ml-2 bg-danger font-bold text-white">Telat</span>
              )}
            </p>
          </div>
          <code className="rounded-xl bg-card-cream px-3 py-1.5 font-mono text-sm text-ink">nxbank</code>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { emojiSrc } from '../lib/emojisClient';
import { SITE_URL } from '../lib/site';
import { fmtRingkas } from '../lib/formatClient';

// Kartu "Sharing" - dipakai DUA konteks dengan desain yang SAMA (konsisten):
//   1. Leaderboard : peringkat pemain (#N) + poin + level
//   2. Profil Saya : kartu pemain sendiri + status NEXOPASS
// 1080x? (rasio 4:5 utk kartu biasa, lebih tinggi kalau member NEXOPASS karena
// dapat 4 stat tile) dengan palet resmi tema Warm Cream Studio (card-dark
// #1E1E26 / cream #FBF7EC / accent #F19A1A), logo NEXO, dan custom emoji
// in-game dari registry. Dibagikan lewat Web Share API (HP) atau diunduh
// (desktop). Tanpa library.

const W = 1080;
const INK = '#FBF7EC';      // teks terang di atas dark card
const ACCENT = '#F19A1A';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function renderCard({ player, coinImg, crownImg, medalImg, logoImg }) {
  // TINGGI DINAMIS: kartu member NEXOPASS dapat 4 stat tile (2 baris) sehingga
  // butuh ruang ekstra. Dihitung SEBELUM canvas dibuat supaya tidak ada area
  // kosong di bawah (dulu tinggi dipatok 1350 -> kartu premium kepotong).
  const kartuPremium = Boolean(player.premium && player.board === 'profil');
  const H = kartuPremium ? 1350 + 220 : 1350;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ═══ Desain meniru PlayerProfileCard: header dark + badan cream, bersih ═══
  const HDR = 320;

  // Badan cream (latar utama kartu)
  ctx.fillStyle = '#FBF7EC';
  ctx.fillRect(0, 0, W, H);

  // Header dark solid, rounded di canvas lewat clip
  ctx.save();
  ctx.fillStyle = '#1E1E26';
  ctx.beginPath();
  ctx.moveTo(0, 64);
  ctx.arcTo(0, 0, 64, 0, 64);
  ctx.lineTo(W - 64, 0);
  ctx.arcTo(W, 0, W, 64, 64);
  ctx.lineTo(W, HDR);
  ctx.lineTo(0, HDR);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.textBaseline = 'middle';

  // Header: logo + wordmark + sublabel, pill rank di kanan
  let hx = 76;
  if (logoImg) {
    ctx.drawImage(logoImg, 64, 52, 84, 84);
    hx = 168;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('NEXO GAMES', hx, 82);
  ctx.fillStyle = 'rgba(169,156,142,1)';
  ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
  // Subjudul menyesuaikan KONTEKS kartu:
  //   - dari leaderboard : "LEADERBOARD · TOP PLAYERS" + pill peringkat
  //   - dari profil      : "PROFIL PEMAIN" (tidak ada peringkat)
  const dariProfil = player.board === 'profil';
  ctx.fillText(dariProfil ? 'PROFIL PEMAIN' : 'LEADERBOARD  ·  TOP PLAYERS', hx, 126);

  const rank = Number(player.rank) || 0;
  const isPodium = rank >= 1 && rank <= 3;
  if (rank > 0) {
    // Pill peringkat di kanan header (emas utk podium, outline utk lainnya)
    const rankTxt = `#${rank}`;
    ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
    const pw = ctx.measureText(rankTxt).width + 68;
    const px = W - 64 - pw;
    if (isPodium) {
      ctx.fillStyle = ACCENT;
      roundRect(ctx, px, 60, pw, 72, 36);
      ctx.fill();
      ctx.fillStyle = '#1E1E26';
    } else {
      ctx.strokeStyle = 'rgba(251,247,236,0.25)';
      ctx.lineWidth = 3;
      roundRect(ctx, px, 60, pw, 72, 36);
      ctx.stroke();
      ctx.fillStyle = INK;
    }
    ctx.textAlign = 'center';
    ctx.fillText(rankTxt, px + pw / 2, 98);
    ctx.textAlign = 'left';
  } else if (player.premium) {
    // Tanpa peringkat (kartu profil) + member NEXOPASS: badge emas di kanan
    // header - penanda status yang langsung terlihat saat dibagikan.
    const badge = 'NEXOPASS';
    ctx.font = '800 32px "Plus Jakarta Sans", system-ui, sans-serif';
    const bw = ctx.measureText(badge).width + 52;
    const bx = W - 64 - bw;
    ctx.fillStyle = ACCENT;
    roundRect(ctx, bx, 68, bw, 56, 28);
    ctx.fill();
    ctx.fillStyle = '#1E1E26';
    ctx.textAlign = 'center';
    ctx.fillText(badge, bx + bw / 2, 98);
    ctx.textAlign = 'left';
  }

  // ═══ Avatar besar menumpuk batas header (identik kartu profil) ═══
  const avR = 120;
  const avCx = W / 2, avCy = HDR;
  const av = await loadImg(player.avatarUrl);
  ctx.save();
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#EFE7D3';
  ctx.fillRect(avCx - avR, avCy - avR, avR * 2, avR * 2);
  if (av) ctx.drawImage(av, avCx - avR, avCy - avR, avR * 2, avR * 2);
  ctx.restore();
  // ring: garis cream pemisah + aksen tipis
  ctx.strokeStyle = '#FBF7EC';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(avCx, avCy, avR + 6, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(avCx, avCy, avR + 13, 0, Math.PI * 2); ctx.stroke();

  // Ornamen peringkat di atas avatar: mahkota untuk #1, medali untuk #2 dan #3.
  // (Dulu medalImg dimuat tapi tidak pernah dipakai - rank 2/3 tanpa ornamen.)
  if (rank === 1 && crownImg) ctx.drawImage(crownImg, avCx - 30, avCy - avR - 78, 60, 60);
  if ((rank === 2 || rank === 3) && medalImg) ctx.drawImage(medalImg, avCx - 26, avCy - avR - 72, 52, 52);

  // ═══ Nama + sub ═══
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2B2118';
  ctx.font = '800 68px "Plus Jakarta Sans", system-ui, sans-serif';
  const name = String(player.username || '?');
  ctx.fillText(name.length > 17 ? name.slice(0, 16) + '…' : name, W / 2, avCy + avR + 86);
  ctx.fillStyle = '#6E6157';
  ctx.font = '600 30px "Plus Jakarta Sans", system-ui, sans-serif';
  if (dariProfil) {
    // Kartu profil: tidak ada peringkat. Tampilkan status langganan - ini
    // pembeda utama antara member NEXOPASS dan pemain biasa saat dibagikan.
    ctx.fillText(player.premium ? 'Member NEXOPASS  ·  langganan aktif' : 'Pemain NEXO Games', W / 2, avCy + avR + 152);
  } else {
    ctx.fillText(`Peringkat ${rank} Top Pemain${isPodium ? '  ·  masuk podium' : ''}`, W / 2, avCy + avR + 152);
  }

  // ═══ Stat tile cream-soft, gaya kartu profil ═══
  // Angka RINGKAS (fmtRingkas): poin bisa ratusan juta dan di kartu gambar
  // tidak ada tooltip - kalau kepanjangan akan keluar batas tile. Ringkas =
  // selalu muat, dan tetap jujur (1,2 jt) bukan terpotong.
  //
  // ISI TILE MENYESUAIKAN STATUS (pintar):
  //   - member NEXOPASS : Poin + Level + Menang + Streak (4 tile, 2x2)
  //   - pemain biasa    : Poin + Level (2 tile, seperti kartu leaderboard)
  //   - kartu leaderboard: selalu Poin + Level (tidak berubah)
  const points = fmtRingkas(player.points || 0);
  const tileY = avCy + avR + 208;
  const tileH = player.premium && dariProfil ? 200 : 240;
  const duaBaris = Boolean(player.premium && dariProfil);
  const tiles = duaBaris
    ? [
        { icon: coinImg, label: 'Poin', value: points },
        { icon: null, label: 'Level', value: String(player.level || 1) },
        { icon: null, label: 'Menang', value: fmtRingkas(player.totalWon || 0) },
        { icon: null, label: 'Streak', value: String(player.dailyStreak || 0) },
      ]
    : [
        { icon: coinImg, label: 'Poin', value: points },
        { icon: null, label: 'Level', value: String(player.level || 1) },
      ];

  // Grid: 2 kolom. Kalau 4 tile -> 2 baris (jarak lebih rapat, tinggi tetap).
  const kolom = 2;
  const gap = 24;
  const tileW = (W - 128 - gap * (kolom - 1)) / kolom;
  ctx.textAlign = 'center';
  for (let i = 0; i < tiles.length; i++) {
    const baris = Math.floor(i / kolom);
    const kol = i % kolom;
    const tx = 64 + kol * (tileW + gap);
    const ty = tileY + baris * (tileH + gap);
    ctx.fillStyle = '#F4EEDF';
    roundRect(ctx, tx, ty, tileW, tileH, 28);
    ctx.fill();
    ctx.strokeStyle = '#E3D9C2';
    ctx.lineWidth = 2;
    roundRect(ctx, tx, ty, tileW, tileH, 28);
    ctx.stroke();
    const tcx = tx + tileW / 2;
    if (tiles[i].icon) ctx.drawImage(tiles[i].icon, tcx - 24, ty + 38, 48, 48);
    else {
      ctx.fillStyle = ACCENT;
      ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('★', tcx, ty + 64);
    }
    ctx.fillStyle = '#2B2118';
    ctx.font = '800 54px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tiles[i].value, tcx, ty + 148);
    ctx.fillStyle = '#A99C8E';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tiles[i].label.toUpperCase(), tcx, ty + 198 - (duaBaris ? 10 : 0));
  }
  // Geser Y strip ajakan kalau tile-nya 2 baris.
  const tinggiTiles = duaBaris ? tileH * 2 + gap : tileH;

  // ═══ Strip ajakan (dark, selaras header) ═══
  const ctaY = tileY + tinggiTiles + 48;
  ctx.fillStyle = '#1E1E26';
  roundRect(ctx, 64, ctaY, W - 128, 150, 28);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '700 38px "Plus Jakarta Sans", system-ui, sans-serif';
  // Ajakan menyesuaikan status: member NEXOPASS diajak main, pemain biasa
  // ditawari ikut (biar kartu yang dibagikan juga jadi promosi halus).
  ctx.fillText(
    player.premium ? 'Main bareng di NEXO Games, gratis!' : 'Main gratis di Discord, kamu mau nyusul?',
    W / 2, ctaY + 56
  );
  // Domain di kartu SELALU domain resmi (SITE_URL dari env NEXT_PUBLIC_SITE_URL),
  // BUKAN location.host - dulu kartu ikut menampilkan domain tempat pemain
  // membuka web, jadi gambar bisa memuat domain lama/alias Vercel.
  // Saat dev (localhost) tetap tampilkan branding studio, bukan localhost:3000.
  const isDev = typeof window !== 'undefined' && window.location.host.includes('localhost');
  const domainTxt = isDev
    ? 'NEXO Games  ·  xurbaybase'
    : `NEXO Games  ·  ${String(SITE_URL).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  ctx.fillStyle = 'rgba(169,156,142,1)';
  ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(domainTxt, W / 2, ctaY + 106);
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * Tombol bagikan kartu.
 *
 * @param {object} props
 * @param {object} props.player - data pemain. Field yang dipakai:
 *        username, avatarUrl, points, level, rank? (leaderboard),
 *        premium? (true bila NEXOPASS aktif), totalWon?, dailyStreak?,
 *        board? ('profil' untuk kartu profil, kosong/undefined untuk leaderboard)
 * @param {boolean} props.loggedIn
 * @param {'icon'|'label'} [props.variant] - 'icon' (default, tombol bulat kecil)
 *        atau 'label' (tombol dengan tulisan "Bagikan", untuk halaman profil)
 */
export default function ShareCardButton({ player, loggedIn, variant = 'icon' }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  async function share(e) {
    e.stopPropagation(); // jangan buka kartu profil saat klik share
    if (!loggedIn) {
      window.location.href = '/login?returnTo=%2Fleaderboard';
      return;
    }
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const [coinImg, crownImg, medalImg, logoImg] = await Promise.all([
        loadImg(emojiSrc('goldcoin')),
        loadImg(emojiSrc('crown')),
        loadImg(emojiSrc('medal')),
        loadImg('/nexo-logo-256.png'),
      ]);
      const canvas = await renderCard({ player, coinImg, crownImg, medalImg, logoImg });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png', 0.95));
      if (!blob) throw new Error('render gagal');

      // Nama file & teks berbagi menyesuaikan konteks (peringkat vs profil).
      const dariProfil = player.board === 'profil';
      const namaFile = dariProfil
        ? 'nexo-profil.png'
        : `nexo-rank-${player.rank}.png`;
      const judul = dariProfil
        ? (player.premium ? `Profil NEXOPASS ${player.username}` : `Profil ${player.username} - NEXO Games`)
        : `Peringkat #${player.rank} NEXO Games`;
      const teks = dariProfil
        ? (player.premium
            ? 'Aku member NEXOPASS di NEXO Games!'
            : 'Aku main di NEXO Games, keseruan gratisnya kebangetan!')
        : `Aku lagi di peringkat #${player.rank} leaderboard NEXO Games!`;

      const file = new File([blob], namaFile, { type: 'image/png' });
      const nav = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: judul, text: teks });
      } else {
        // Desktop tanpa Web Share: unduh gambar + tautan ke clipboard.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = namaFile;
        a.click();
        URL.revokeObjectURL(url);
        try {
          await nav.clipboard.writeText(`${SITE_URL}${dariProfil ? '/me' : '/leaderboard'}`);
        } catch {}
        setNote('Gambar tersimpan & tautan tersalin ke clipboard.');
        setTimeout(() => setNote(null), 3500);
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') setNote('Share dibatalkan.');
      setTimeout(() => setNote(null), 3500);
    } finally {
      setBusy(false);
    }
  }

  const dariProfil = player.board === 'profil';
  const labelAria = loggedIn
    ? (dariProfil ? 'Bagikan profilku' : `Bagikan peringkat ${player.username}`)
    : 'Login dulu untuk share';

  // ── Varian 'label': tombol dengan tulisan (dipakai di halaman profil) ──
  if (variant === 'label') {
    return (
      <span className="relative inline-flex items-center">
        <button
          type="button"
          onClick={share}
          disabled={busy}
          aria-label={labelAria}
          title={labelAria}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-soft bg-white px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap text-ink shadow-sm transition hover:-translate-y-px hover:border-accent hover:text-accent-hover active:translate-y-0 active:shadow-none disabled:opacity-50 cursor-pointer sm:px-3.5 sm:text-xs"
        >
          {busy ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          ) : (
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
            </svg>
          )}
          Bagikan
        </button>
        {note && (
          <span className="absolute right-0 top-full z-10 mt-1 w-max max-w-[180px] rounded-lg bg-ink px-3 py-1.5 text-[0.65rem] font-semibold text-card-cream shadow-lg">
            {note}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        aria-label={labelAria}
        title={labelAria}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border-soft bg-white text-ink-muted shadow-sm transition hover:-translate-y-px hover:border-accent hover:text-accent-hover active:translate-y-0 active:shadow-none disabled:opacity-50 cursor-pointer"
      >
        {busy ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
          </svg>
        )}
      </button>
      {note && (
        <span className="absolute right-0 top-full z-10 mt-1 w-max max-w-[180px] rounded-lg bg-ink px-3 py-1.5 text-[0.65rem] font-semibold text-card-cream shadow-lg">
          {note}
        </span>
      )}
    </span>
  );
}

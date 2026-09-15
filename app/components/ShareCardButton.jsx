'use client';

import { useState } from 'react';
import { emojiSrc } from '../lib/emojisClient';
import { SITE_URL } from '../lib/site';
import { fmtRingkas } from '../lib/formatClient';

// Kartu "Sharing Leaderboard": menggambar peringkat pemain ke <canvas>
// 1080x1350 (rasio 4:5, ideal utk IG/WA/story) dengan palet resmi tema
// Warm Cream Studio (card-dark #1E1E26 / cream #FBF7EC / accent #F19A1A),
// logo NEXO, dan custom emoji in-game (goldcoin, crown) dari registry.
// Dibagikan lewat Web Share API (HP) atau diunduh (desktop). Tanpa library.

const W = 1080;
const H = 1350;
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
  ctx.fillText('LEADERBOARD  ·  TOP PLAYERS', hx, 126);

  const rank = Number(player.rank) || 0;
  const isPodium = rank >= 1 && rank <= 3;
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
  ctx.fillText(`Peringkat ${rank} Top Pemain${isPodium ? '  ·  masuk podium' : ''}`, W / 2, avCy + avR + 152);

  // ═══ Dua stat tile cream-soft, gaya kartu profil ═══
  // Angka RINGKAS (fmtRingkas): poin bisa ratusan juta dan di kartu gambar
  // tidak ada tooltip - kalau kepanjangan akan keluar batas tile. Ringkas =
  // selalu muat, dan tetap jujur (1,2 jt) bukan terpotong.
  const points = fmtRingkas(player.points || 0);
  const tileY = avCy + avR + 208;
  const tileH = 240;
  const tileW = (W - 128 - 24) / 2;
  const tiles = [
    { icon: coinImg, label: 'Poin', value: points },
    { icon: null, label: 'Level', value: String(player.level || 1) },
  ];
  ctx.textAlign = 'center';
  for (let i = 0; i < tiles.length; i++) {
    const tx = 64 + i * (tileW + 24);
    ctx.fillStyle = '#F4EEDF';
    roundRect(ctx, tx, tileY, tileW, tileH, 28);
    ctx.fill();
    ctx.strokeStyle = '#E3D9C2';
    ctx.lineWidth = 2;
    roundRect(ctx, tx, tileY, tileW, tileH, 28);
    ctx.stroke();
    const tcx = tx + tileW / 2;
    if (tiles[i].icon) ctx.drawImage(tiles[i].icon, tcx - 24, tileY + 38, 48, 48);
    else {
      ctx.fillStyle = ACCENT;
      ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('★', tcx, tileY + 64);
    }
    ctx.fillStyle = '#2B2118';
    ctx.font = '800 54px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tiles[i].value, tcx, tileY + 148);
    ctx.fillStyle = '#A99C8E';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tiles[i].label.toUpperCase(), tcx, tileY + 198);
  }

  // ═══ Strip ajakan (dark, selaras header) ═══
  const ctaY = tileY + tileH + 48;
  ctx.fillStyle = '#1E1E26';
  roundRect(ctx, 64, ctaY, W - 128, 150, 28);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '700 38px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('Main gratis di Discord, kamu mau nyusul?', W / 2, ctaY + 56);
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

export default function ShareCardButton({ player, loggedIn }) {
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
      const file = new File([blob], `nexo-rank-${player.rank}.png`, { type: 'image/png' });
      const nav = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({
          files: [file],
          title: `Peringkat #${player.rank} NEXO Games`,
          text: `Aku lagi di peringkat #${player.rank} leaderboard NEXO Games!`,
        });
      } else {
        // Desktop tanpa Web Share: unduh gambar + tautan ke clipboard.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexo-rank-${player.rank}.png`;
        a.click();
        URL.revokeObjectURL(url);
        try { await nav.clipboard.writeText(`${SITE_URL}/leaderboard`); } catch {}
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

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={share}
        disabled={busy}
        aria-label={loggedIn ? `Bagikan peringkat ${player.username}` : 'Login dulu untuk share'}
        title={loggedIn ? 'Bagikan peringkat ini' : 'Login dulu untuk share'}
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

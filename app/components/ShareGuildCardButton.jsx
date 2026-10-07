'use client';

import { useState } from 'react';
import { emojiSrcStatis } from '../lib/emojisClient';
import { SITE_URL } from '../lib/site';
import { fmtRingkas } from '../lib/formatClient';
import { avatarUser } from '../lib/avatarClient';

// ==========================================
// KARTU BAGIKAN GUILD (permintaan pemilik 2026-10-07)
// ==========================================
// Versi GUILD dari ShareCardButton pemain: kartu canvas 1080x1350 (4:5,
// rasio aman untuk media sosial) berisi:
//   - Header gelap: wordmark NEXO + pill peringkat guild (#N)
//   - Emoji + nama guild + kode + jumlah member
//   - 3 tile: Total Poin / War Wins / Member
//   - DAFTAR SEMUA ANGGOTA (owner, admin, member) + POIN MASING-MASING,
//     supaya orang paham "kok total poinnya segini" (transparan, permintaan
//     pemilik). Pemegang NEXO Pass dapat badge resmi di samping namanya.
//     Penanda peran: mahkota = owner, tameng = admin.
//   - Strip CTA + domain
//
// Share: Web Share API (HP) / unduh + tautan clipboard (desktop).
// WAJIB login (pola sama dengan kartu pemain) - kalau belum, diarahkan
// ke /login?returnTo=/leaderboard.
//
// Data: `detail` (dari modal GuildDetailCard, sudah dimuat) dipakai langsung;
// kalau tidak ada (tombol di baris tabel), fetch /api/guild/[code] saat klik.
export default function ShareGuildCardButton({ guild, detail = null, loggedIn, variant = 'icon' }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  async function share(e) {
    e.stopPropagation(); // jangan buka modal detail saat klik share
    if (!loggedIn) {
      window.location.href = '/login?returnTo=%2Fleaderboard';
      return;
    }
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      // Detail guild: pakai yang sudah dimuat (dari modal) atau ambil sekarang.
      let d = detail;
      if (!d) {
        const res = await fetch(`/api/guild/${encodeURIComponent(guild.code)}`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!j.ok || !j.guild) throw new Error('detail gagal dimuat');
        d = j.guild;
      }
      const anggota = [d.owner, ...(d.admins || []), ...(d.members || [])].filter(Boolean).slice(0, 10);

      // Semua gambar dimuat paralel. Emoji custom pakai PNG STATIS
      // (emojiSrcStatis) karena canvas tidak bisa menggambar GIF.
      const [coinImg, trophyImg, userImg, crownImg, shieldImg, nexopassImg, castleImg, logoImg, guildEmojiImg, ...avatarImgsArr] = await Promise.all([
        loadImg(emojiSrcStatis('goldcoin', 128)),
        loadImg(emojiSrcStatis('trophy', 128)),
        loadImg(emojiSrcStatis('user', 128)),
        loadImg(emojiSrcStatis('crown', 128)),
        loadImg(emojiSrcStatis('shield', 128)),
        loadImg(emojiSrcStatis('download3', 128)), // merek NEXO Pass resmi
        loadImg(emojiSrcStatis('castle', 128)),    // cadangan kalau emoji guild kosong
        loadImg('/nexo-logo-256.png'),
        loadImg(tokenEmojiUrl(d.emoji)),
        ...anggota.map((m) => loadImg(avatarUser(m.userId, m.avatarUrl, 96))),
      ]);
      const avatarImgs = {};
      anggota.forEach((m, i) => { avatarImgs[m.userId] = avatarImgsArr[i]; });

      const canvas = await renderCard({
        detail: d, anggota,
        coinImg, trophyImg, userImg, crownImg, shieldImg, nexopassImg, castleImg, logoImg, guildEmojiImg, avatarImgs,
      });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png', 0.95));
      if (!blob) throw new Error('render gagal');

      const namaFile = `nexo-guild-${String(d.code || 'guild').toLowerCase()}.png`;
      const judul = `Guild ${d.name} - NEXO Games`;
      const teks = `Guild ${d.name} ada di peringkat #${d.rank} leaderboard NEXO Games!`;

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
          await nav.clipboard.writeText(`${SITE_URL}/leaderboard`);
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

  const namaGuild = String((guild && guild.name) || (detail && detail.name) || 'Guild');
  const labelAria = loggedIn ? `Bagikan guild ${namaGuild}` : 'Login dulu untuk share';

  // ── Varian 'label': tombol dengan tulisan (kalau nanti dipakai di tempat lain) ──
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
            <ShareIkon />
          )}
          Bagikan
        </button>
        {note && <Catatan note={note} />}
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
          <ShareIkon />
        )}
      </button>
      {note && <Catatan note={note} />}
    </span>
  );
}

function ShareIkon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
    </svg>
  );
}

function Catatan({ note }) {
  return (
    <span className="absolute right-0 top-full z-10 mt-1 w-max max-w-[180px] rounded-lg bg-ink px-3 py-1.5 text-[0.65rem] font-semibold text-card-cream shadow-lg">
      {note}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Helper gambar
// ─────────────────────────────────────────────────────────────

const INK = '#FBF7EC';
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

// Badge NEXO Pass di canvas: lingkaran cream + cincin oranye + logo.
// SAMA PERSIS dengan kartu pemain (satu tampilan untuk satu makna).
function gambarBadgeNexoPass(ctx, cx, cy, d, logoImg) {
  const r = d / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FBF7EC';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();
  if (logoImg) {
    const ikon = d * 0.68;
    ctx.drawImage(logoImg, cx - ikon / 2, cy - ikon / 2, ikon, ikon);
  }
}

// Potong teks agar MUAT secara lebar (diukur dengan measureText, bukan jumlah
// karakter - lebar huruf tidak seragam). Font harus sudah di-set di ctx.
function potongByLebar(ctx, teks, maksLebar) {
  const t = String(teks || '');
  if (ctx.measureText(t).width <= maksLebar) return t;
  let n = t.length;
  while (n > 1) {
    n -= 1;
    const coba = t.slice(0, n) + '…';
    if (ctx.measureText(coba).width <= maksLebar) return coba;
  }
  return '…';
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

// Token emoji Discord (<:nama:id> / <a:nama:id>) -> URL PNG statis untuk canvas.
// Mengembalikan null kalau bukan token (mis. emoji unicode atau kosong).
function tokenEmojiUrl(token) {
  const m = /<(a)?:([A-Za-z0-9_]+):(\d{15,25})>/.exec(String(token || ''));
  if (!m) return null;
  return `https://cdn.discordapp.com/emojis/${m[3]}.png?size=128&quality=lossless`;
}

// ─────────────────────────────────────────────────────────────
// Render kartu 1080x1350
// ─────────────────────────────────────────────────────────────
async function renderCard({ detail, anggota, coinImg, trophyImg, userImg, crownImg, shieldImg, nexopassImg, castleImg, logoImg, guildEmojiImg, avatarImgs }) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

  // Latar cream
  ctx.fillStyle = '#FBF7EC';
  ctx.fillRect(0, 0, W, H);

  // ── Header gelap + wordmark ──
  const HDR = 250;
  ctx.fillStyle = '#1E1E26';
  ctx.fillRect(0, 0, W, HDR);

  if (logoImg) ctx.drawImage(logoImg, 56, 42, 72, 72);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText('NEXO GAMES', 148, 84);
  ctx.fillStyle = 'rgba(169,156,142,1)';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('LEADERBOARD  ·  TOP GUILDS', 148, 118);

  // Pill peringkat guild (kanan atas). Peringkat #1 = pill oranye solid,
  // lainnya outline - bahasa visual yang sama dengan kartu pemain.
  const rank = Number(detail.rank) || 0;
  if (rank > 0) {
    const rankTxt = `#${rank}`;
    ctx.font = `800 38px ${FONT}`;
    const pw = ctx.measureText(rankTxt).width + 60;
    const px = W - 56 - pw;
    if (rank === 1) {
      ctx.fillStyle = ACCENT;
      roundRect(ctx, px, 48, pw, 64, 32);
      ctx.fill();
      ctx.fillStyle = '#1E1E26';
    } else {
      ctx.strokeStyle = 'rgba(251,247,236,0.25)';
      ctx.lineWidth = 3;
      roundRect(ctx, px, 48, pw, 64, 32);
      ctx.stroke();
      ctx.fillStyle = INK;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rankTxt, px + pw / 2, 48 + 32);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  // ── Emoji guild: lingkaran cream menumpuk batas header ──
  const er = 84;
  const ecx = W / 2;
  const ecy = HDR;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ecx, ecy, er, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#EFE7D3';
  ctx.fillRect(ecx - er, ecy - er, er * 2, er * 2);
  const tUrl = tokenEmojiUrl(detail.emoji);
  if (tUrl && guildEmojiImg) {
    const s = er * 1.3;
    ctx.drawImage(guildEmojiImg, ecx - s / 2, ecy - s / 2, s, s);
  } else if (!tUrl && detail.emoji && String(detail.emoji).trim()) {
    // Emoji unicode (mis. 👑) - digambar sebagai teks; font emoji bawaan OS.
    ctx.font = `${Math.round(er * 1.05)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(detail.emoji).trim(), ecx, ecy + 6);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  } else if (castleImg) {
    const s = er * 1.1;
    ctx.drawImage(castleImg, ecx - s / 2, ecy - s / 2, s, s);
  }
  ctx.restore();
  ctx.strokeStyle = '#FBF7EC';
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(ecx, ecy, er + 5, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(ecx, ecy, er + 11, 0, Math.PI * 2); ctx.stroke();

  // ── Nama guild + kode ──
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2B2118';
  ctx.font = `800 60px ${FONT}`;
  ctx.fillText(potongByLebar(ctx, detail.name || 'Guild', W - 220), W / 2, ecy + er + 70);
  ctx.fillStyle = '#6E6157';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(potongByLebar(ctx, `Kode ${detail.code}  ·  ${detail.membersCount} Member`, W - 220), W / 2, ecy + er + 116);

  // ── 3 tile statistik ──
  const tileY = 482;
  const tileH = 132;
  const tiles = [
    { icon: coinImg, label: 'Total Poin', value: fmtRingkas(detail.points) },
    { icon: trophyImg, label: 'War Wins', value: String(detail.warWins || 0) },
    { icon: userImg, label: 'Member', value: String(detail.membersCount || 0) },
  ];
  const gap = 20;
  const tileW = (W - 128 - gap * 2) / 3;
  for (let i = 0; i < tiles.length; i++) {
    const tx = 64 + i * (tileW + gap);
    ctx.fillStyle = '#F4EEDF';
    roundRect(ctx, tx, tileY, tileW, tileH, 24);
    ctx.fill();
    ctx.strokeStyle = '#E3D9C2';
    ctx.lineWidth = 2;
    roundRect(ctx, tx, tileY, tileW, tileH, 24);
    ctx.stroke();
    const tcx = tx + tileW / 2;
    if (tiles[i].icon) ctx.drawImage(tiles[i].icon, tcx - 20, tileY + 24, 40, 40);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2B2118';
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(tiles[i].value, tcx, tileY + 96);
    ctx.fillStyle = '#A99C8E';
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(tiles[i].label.toUpperCase(), tcx, tileY + 122);
    ctx.textAlign = 'left';
  }

  // ── Judul daftar anggota + total poin member (transparansi) ──
  ctx.fillStyle = '#6E6157';
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText(`ANGGOTA (${anggota.length})`, 64, 664);
  const totalMember = anggota.reduce((a, m) => a + (m.points || 0), 0);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#A99C8E';
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText(`Total poin member: ${fmtRingkas(totalMember)}`, W - 64, 664);
  ctx.textAlign = 'left';

  // ── Daftar anggota 2 kolom (maks 10 - kapasitas guild bot) ──
  const rowH = 72;
  const rowGap = 12;
  const stride = rowH + rowGap;
  const zoneTop = 686;
  const zoneH = 408; // sampai 1094 (di atas strip CTA)
  const rows = Math.ceil(anggota.length / 2);
  const rowsH = rows > 0 ? rows * stride - rowGap : 0;
  const startY = zoneTop + Math.max(0, (zoneH - rowsH) / 2);
  const cellW = (W - 128 - 20) / 2;

  if (anggota.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#A99C8E';
    ctx.font = `600 28px ${FONT}`;
    ctx.fillText('Belum ada anggota.', W / 2, zoneTop + 120);
    ctx.textAlign = 'left';
  }

  for (let i = 0; i < anggota.length; i++) {
    const m = anggota[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x0 = 64 + col * (cellW + 20);
    const y0 = startY + row * stride;
    const acy = y0 + rowH / 2;

    // Sel cream
    ctx.fillStyle = '#F4EEDF';
    roundRect(ctx, x0, y0, cellW, rowH, 16);
    ctx.fill();
    ctx.strokeStyle = '#E3D9C2';
    ctx.lineWidth = 2;
    roundRect(ctx, x0, y0, cellW, rowH, 16);
    ctx.stroke();

    // Avatar bulat
    const avr = 22;
    const acx = x0 + 12 + avr;
    ctx.save();
    ctx.beginPath();
    ctx.arc(acx, acy, avr, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#EFE7D3';
    ctx.fillRect(acx - avr, acy - avr, avr * 2, avr * 2);
    const av = avatarImgs[m.userId];
    if (av) ctx.drawImage(av, acx - avr, acy - avr, avr * 2, avr * 2);
    ctx.restore();
    ctx.strokeStyle = '#E3D9C2';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(acx, acy, avr, 0, Math.PI * 2); ctx.stroke();

    // Poin (rata kanan) - lalu badge NEXO Pass & ikon peran dihitung dari kiri
    const ptsTxt = fmtRingkas(m.points);
    ctx.font = `700 26px ${FONT}`;
    const ptsW = ctx.measureText(ptsTxt).width;
    const ptsRight = x0 + cellW - 16;
    ctx.fillStyle = '#2B2118';
    ctx.textAlign = 'right';
    ctx.fillText(ptsTxt, ptsRight, acy + 9);
    ctx.textAlign = 'left';
    let cursor = ptsRight - ptsW - 12;

    // Badge NEXO Pass (kalau premium) - PERSIS di samping nama, seperti
    // di leaderboard web & Discord.
    if (m.premium && nexopassImg) {
      gambarBadgeNexoPass(ctx, cursor - 14, acy, 28, nexopassImg);
      cursor -= 28 + 8;
    }

    // Ikon peran: mahkota = owner, tameng = admin (member polos).
    const role = String(m.role || 'member').toLowerCase();
    if (role === 'owner' && crownImg) {
      ctx.drawImage(crownImg, cursor - 22, acy - 11, 22, 22);
      cursor -= 22 + 8;
    } else if (role === 'admin' && shieldImg) {
      ctx.drawImage(shieldImg, cursor - 22, acy - 11, 22, 22);
      cursor -= 22 + 8;
    }

    // Nama (dipotong agar tidak menabrak badge/poin)
    const nameX = acx + avr + 12;
    const nameMax = Math.max(60, cursor - nameX - 6);
    ctx.fillStyle = '#2B2118';
    ctx.font = `700 26px ${FONT}`;
    ctx.fillText(potongByLebar(ctx, m.username || '?', nameMax), nameX, acy + 9);
  }

  // ── Strip CTA ──
  const ctaY = 1126;
  ctx.fillStyle = '#1E1E26';
  roundRect(ctx, 64, ctaY, W - 128, 150, 28);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText('Gabung serunya NEXO Games, gratis!', W / 2, ctaY + 64);
  // Domain di kartu SELALU domain resmi (pola sama dengan kartu pemain).
  const isDev = typeof window !== 'undefined' && window.location.host.includes('localhost');
  const domainTxt = isDev
    ? 'NEXO Games  ·  xurbaybase'
    : `NEXO Games  ·  ${String(SITE_URL).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  ctx.fillStyle = 'rgba(169,156,142,1)';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(domainTxt, W / 2, ctaY + 112);
  ctx.textAlign = 'left';

  return canvas;
}

'use client';

import { useState } from 'react';
import { emojiSrcStatis } from '../lib/emojisClient';
import { SITE_URL } from '../lib/site';
import { fmtRingkas } from '../lib/formatClient';

// Kartu "Sharing" - dipakai DUA konteks dengan desain yang SAMA (konsisten):
//   1. Leaderboard : peringkat pemain (#N) + poin + level
//   2. Profil Saya : kartu pemain sendiri + status NEXO Pass
// 1080x? (rasio 4:5 utk kartu biasa, lebih tinggi kalau member NEXO Pass karena
// dapat 4 stat tile) dengan palet resmi tema Warm Cream Studio (card-dark
// #1E1E26 / cream #FBF7EC / accent #F19A1A), logo NEXO, dan custom emoji
// in-game dari registry. Dibagikan lewat Web Share API (HP) atau diunduh
// (desktop). Tanpa library.

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

/** Bintang 5 sudut sebagai VEKTOR (bukan emoji/font) - tajam & selalu ada. */
function gambarBintang(ctx, cx, cy, r, warna) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.44;
    const sudut = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(sudut) * radius;
    const y = cy + Math.sin(sudut) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = warna;
  ctx.fill();
  ctx.restore();
}

/**
 * Badge NEXO Pass: LINGKARAN dengan latar CREAM CERAH + logo di tengahnya.
 *
 * KENAPA CREAM, BUKAN ORANYE: badge ini duduk di atas header gelap (#1E1E26).
 * Latar oranye membuat logo tenggelam (kurang kontras) sehingga statusnya
 * tidak "menonjol". Cream cerah (#FBF7EC) memberi kontras tinggi terhadap
 * header gelap - logo langsung terbaca dan terlihat elegan. Sama seperti
 * desain kartu profil.
 *
 * Dipakai KONSISTEN di kartu leaderboard maupun kartu profil (satu tampilan
 * untuk satu makna) supaya user tidak melihat dua gaya badge berbeda.
 *
 * @param {number} cx - titik tengah X
 * @param {number} cy - titik tengah Y
 * @param {number} d  - diameter lingkaran
 * @param {Image} logoImg - logo/emoji NEXO Pass (sudah dimuat)
 */
function gambarBadgeNexoPass(ctx, cx, cy, d, logoImg) {
  const r = d / 2;
  // cincin tipis oranye di luar + isi cream → tetap ada aksen merek, tanpa
  // mengorbankan keterbacaan logo.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FBF7EC';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();
  if (logoImg) {
    const ikon = d * 0.68; // sisakan padding di dalam lingkaran
    ctx.drawImage(logoImg, cx - ikon / 2, cy - ikon / 2, ikon, ikon);
  }
}

/**
 * Potong teks agar MUAT secara lebar (bukan berdasarkan jumlah karakter).
 *
 * KENAPA: lebar karakter tidak seragam - "iiii" jauh lebih sempit dari "WWWW".
 * Dulu nama dipotong pakai name.slice(0,16), sehingga nama 16 huruf KAPITAL
 * LEBAR bisa melebihi ruang kartu dan MENIMPA elemen lain (mis. badge NEXO Pass
 * di header). Sekarang diukur dengan measureText: potong bertahap sampai muat,
 * lalu tambahkan elipsis. Font harus sudah di-set di ctx sebelum memanggil ini.
 */
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

async function renderCard({ player, coinImg, crownImg, medalImg, logoImg, nexopassImg, trophyImg, streakImg }) {
  const dariProfilHitung = player.board === 'profil';
  // Leaderboard portrait 4:5 (1080x1350), Profil Banner landscape (1200x630)
  const W = dariProfilHitung ? 1200 : 1080;
  const H = dariProfilHitung ? 630 : 1350;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ══════════════════════════════════════════════════════════════════════
  // DUA DESAIN KARTU YANG SENGAJA BERBEDA TOTAL
  // ----------------------------------------------------------------------
  // Dulu kepala kedua kartu IDENTIK (header gelap + avatar besar menumpuk),
  // jadi meski isinya beda, user merasa "sama aja". Sekarang:
  //
  //   KARTU LEADERBOARD = tema GELAP  (header dark, avatar menumpuk,
  //                        pill peringkat, grid kotak) -> kesan "papan skor"
  //   KARTU PROFIL      = tema TERANG gaya KARTU ID/MEMBER
  //                        (tanpa header gelap, pita nama, avatar di kiri,
  //                        blok statistik berlabel) -> kesan "kartu identitas"
  //
  // Perbedaan langsung terlihat sejak pandangan pertama.
  // ══════════════════════════════════════════════════════════════════════
  const dariProfil = player.board === 'profil';
  const rank = Number(player.rank) || 0;
  const isPodium = rank >= 1 && rank <= 3;
  const points = fmtRingkas(player.points || 0);
  const av = await loadImg(player.avatarUrl);

  if (dariProfil) {
    // ══════════════════════════════════════════════════════════════
    // KARTU PROFIL BANNER (Landscape 1200x630)
    // ══════════════════════════════════════════════════════════════
    ctx.fillStyle = '#FBF7EC'; // Panel kanan (terang)
    ctx.fillRect(0, 0, W, H);

    // Watermark di panel kanan
    if (logoImg) {
      ctx.save();
      ctx.globalAlpha = 0.04;
      ctx.drawImage(logoImg, W - 600, H - 600, 700, 700);
      ctx.restore();
    }

    // ── Panel Kiri (Gelap - Identitas) ──
    const leftW = 420;
    ctx.fillStyle = '#1E1E26';
    ctx.fillRect(0, 0, leftW, H);
    // Aksen vertikal oranye di ujung kiri banget
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, 10, H);

    // ── Header Panel Kiri ──
    let currentX = 48;

    // 1. Nexo Pass Badge (Jika Premium) - di sebelah kiri logo
    if (player.premium && nexopassImg) {
      gambarBadgeNexoPass(ctx, currentX + 24, 48 + 24, 48, nexopassImg);
      currentX += 48 + 16;
    }

    // 2. Logo Nexo Games
    if (logoImg) {
      ctx.drawImage(logoImg, currentX, 48, 48, 48);
      currentX += 48 + 16;
    }

    // 3. Teks Header
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FBF7EC';
    ctx.font = '800 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('NEXO GAMES', currentX, 64);
    ctx.fillStyle = 'rgba(169,156,142,1)';
    ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('AKUN MEMBER', currentX, 88);

    // ── Avatar (Tengah Panel Kiri) ──
    const avR = 80;
    const avCx = leftW / 2;
    const avCy = 260;
    ctx.save();
    ctx.beginPath(); ctx.arc(avCx, avCy, avR, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#EFE7D3'; ctx.fillRect(avCx - avR, avCy - avR, avR * 2, avR * 2);
    if (av) ctx.drawImage(av, avCx - avR, avCy - avR, avR * 2, avR * 2);
    ctx.restore();
    
    // Cincin
    ctx.strokeStyle = '#1E1E26'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(avCx, avCy, avR + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(avCx, avCy, avR + 8, 0, Math.PI * 2); ctx.stroke();

    // Nama & ID
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FBF7EC';
    ctx.font = '800 42px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(potongByLebar(ctx, player.username || '?', leftW - 80), avCx, avCy + avR + 60);
    
    ctx.fillStyle = 'rgba(169,156,142,1)';
    ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
    const idTxt = player.discordId ? `ID ${String(player.discordId).slice(-6)}` : 'PEMAIN NEXO';
    ctx.fillText(idTxt, avCx, avCy + avR + 94);

    // ── Data di Panel Kanan (Terang) ──
    const rightX = leftW + 60;
    
    // TOTAL POIN
    let y = 110;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#A99C8E';
    ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('TOTAL POIN', rightX, y);

    let ukFont = 100;
    ctx.fillStyle = '#2B2118';
    const maksAngka = (W - rightX) - 80;
    ctx.font = `800 ${ukFont}px "Plus Jakarta Sans", system-ui, sans-serif`;
    while (ctx.measureText(points).width > maksAngka && ukFont > 40) {
      ukFont -= 4;
      ctx.font = `800 ${ukFont}px "Plus Jakarta Sans", system-ui, sans-serif`;
    }
    ctx.fillText(points, rightX, y + ukFont);
    if (coinImg) {
      const wAngka = ctx.measureText(points).width;
      const posX = Math.min(rightX + wAngka + 20, W - 80);
      ctx.drawImage(coinImg, posX, y + ukFont - 74, 68, 68);
    }

    // Blok Statistik
    y += ukFont + 60;
    const stat = [
      { bintang: true, label: 'LEVEL', value: String(player.level || 1) },
      { icon: trophyImg, label: 'MENANG', value: fmtRingkas(player.totalWon || 0) },
      { icon: streakImg, label: 'STREAK', value: `${player.dailyStreak || 0}H` },
    ];
    
    const boxW = W - rightX - 60;
    const boxH = 130;
    ctx.strokeStyle = 'rgba(169,156,142,0.4)';
    ctx.lineWidth = 2;
    roundRect(ctx, rightX, y, boxW, boxH, 20);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rightX + boxW / 3, y + 24);
    ctx.lineTo(rightX + boxW / 3, y + boxH - 24);
    ctx.moveTo(rightX + (boxW / 3) * 2, y + 24);
    ctx.lineTo(rightX + (boxW / 3) * 2, y + boxH - 24);
    ctx.stroke();

    ctx.textAlign = 'center';
    for (let i = 0; i < stat.length; i++) {
      const cx = rightX + (boxW / 3) * i + (boxW / 6);
      if (stat[i].icon) ctx.drawImage(stat[i].icon, cx - 18, y + 16, 36, 36);
      else if (stat[i].bintang) gambarBintang(ctx, cx, y + 34, 17, ACCENT);
      
      ctx.fillStyle = '#2B2118';
      ctx.font = '800 40px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(stat[i].value, cx, y + 94);
      ctx.fillStyle = '#A99C8E';
      ctx.font = '700 16px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(stat[i].label, cx, y + 118);
    }

    // ── Strip Ajakan ──
    y += boxH + 46;
    ctx.fillStyle = '#1E1E26';
    roundRect(ctx, rightX, y, boxW, 80, 16);
    ctx.fill();
    ctx.fillStyle = '#FBF7EC';
    ctx.textAlign = 'left';
    ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      player.premium ? 'Gabung juga di NEXO Games, gratis!' : 'Main gratis di Discord, kamu mau nyusul?',
      rightX + 24, y + 46
    );
    const domP = typeof window !== 'undefined' && window.location.host.includes('localhost') 
      ? 'xurbaybase' : String(SITE_URL).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    ctx.textAlign = 'right';
    ctx.fillStyle = ACCENT;
    ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(domP, rightX + boxW - 24, y + 46);

    ctx.textAlign = 'left';
    return canvas;
  }

  // ═══════════════════════════════════════════════════════════════════
  // KARTU LEADERBOARD - tetap grid kotak (ciri khas kartu peringkat).
  // Member NEXO Pass dapat emoji di sebelah pill peringkat (lihat header).
  // ═══════════════════════════════════════════════════════════════════
  // (Blok ini sempat ikut terhapus saat kartu profil dirombak - sekarang
  //  dipulihkan: header gelap + wordmark + pill peringkat + badge + avatar
  //  menumpuk + ornamen mahkota/medali untuk podium.)
  
  // Isi background seluruh canvas dengan cream
  ctx.fillStyle = '#FBF7EC';
  ctx.fillRect(0, 0, W, H);

  const HDR_LB = 320;
  // Header gelap
  ctx.fillStyle = '#1E1E26';
  ctx.fillRect(0, 0, W, HDR_LB);

  const avRLb = 120;
  const avCxLb = W / 2;
  const avCyLb = HDR_LB;

  let hxLb = 76;
  if (logoImg) {
    ctx.drawImage(logoImg, 64, 52, 84, 84);
    hxLb = 168;
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('NEXO GAMES', hxLb, 94);
  ctx.fillStyle = 'rgba(169,156,142,1)';
  ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText('LEADERBOARD  ·  TOP PLAYERS', hxLb, 134);

  // pill peringkat + badge NEXO Pass di kanan header
  if (rank > 0) {
    const rankTxt = `#${rank}`;
    ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
    const pw = ctx.measureText(rankTxt).width + 68;
    const adaBadgeLb = Boolean(player.premium && nexopassImg);
    const ikonBadgeLb = 76;
    const jarakBadgeLb = 14;
    const totalWLb = pw + (adaBadgeLb ? ikonBadgeLb + jarakBadgeLb : 0);
    const pxLb = W - 64 - totalWLb;
    if (isPodium) {
      ctx.fillStyle = ACCENT;
      roundRect(ctx, pxLb, 60, pw, 72, 36);
      ctx.fill();
      ctx.fillStyle = '#1E1E26';
    } else {
      ctx.strokeStyle = 'rgba(251,247,236,0.25)';
      ctx.lineWidth = 3;
      roundRect(ctx, pxLb, 60, pw, 72, 36);
      ctx.stroke();
      ctx.fillStyle = INK;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rankTxt, pxLb + pw / 2, 60 + 72 / 2); // Center vertically in the 72px tall pill
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    if (adaBadgeLb) {
      gambarBadgeNexoPass(ctx, pxLb + pw + jarakBadgeLb + ikonBadgeLb / 2, (60 + 132) / 2, ikonBadgeLb, nexopassImg);
    }
  }

  // Avatar besar menumpuk batas header
  ctx.save();
  ctx.beginPath();
  ctx.arc(avCxLb, avCyLb, avRLb, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#EFE7D3';
  ctx.fillRect(avCxLb - avRLb, avCyLb - avRLb, avRLb * 2, avRLb * 2);
  if (av) ctx.drawImage(av, avCxLb - avRLb, avCyLb - avRLb, avRLb * 2, avRLb * 2);
  ctx.restore();
  ctx.strokeStyle = '#FBF7EC';
  ctx.lineWidth = 12;
  ctx.beginPath(); ctx.arc(avCxLb, avCyLb, avRLb + 6, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(avCxLb, avCyLb, avRLb + 13, 0, Math.PI * 2); ctx.stroke();

  // Ornamen podium: mahkota #1, medali #2/#3
  if (rank === 1 && crownImg) ctx.drawImage(crownImg, avCxLb - 30, avCyLb - avRLb - 78, 60, 60);
  if ((rank === 2 || rank === 3) && medalImg) ctx.drawImage(medalImg, avCxLb - 26, avCyLb - avRLb - 72, 52, 52);

  // Nama + sub-judul peringkat
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2B2118';
  ctx.font = '800 68px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(potongByLebar(ctx, player.username || '?', W - 128), W / 2, avCyLb + avRLb + 86);
  ctx.fillStyle = '#6E6157';
  ctx.font = '600 30px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(potongByLebar(ctx, `Peringkat ${rank} Top Pemain${isPodium ? '  ·  masuk podium' : ''}`, W - 128), W / 2, avCyLb + avRLb + 152);

  // Perbaikan gap untuk 1 baris tile di layar tinggi 1350
  const tileY = avCyLb + avRLb + 252; // 692
  
  const tileH = 212;
  const tiles = [
    { icon: coinImg, label: 'Poin', value: points },
    { bintang: true, label: 'Level', value: String(player.level || 1) },
  ];

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
    // Ikon di posisi yang SAMA untuk semua tile (bintang & emoji sejajar).
    const ikonY = ty + 54;
    if (tiles[i].icon) {
      // Emoji custom sebagai GAMBAR (PNG statis dari registry) - tampilannya
      // sama dengan emoji yang dipakai bot di Discord.
      ctx.drawImage(tiles[i].icon, tcx - 24, ikonY - 24, 48, 48);
    } else if (tiles[i].bintang) {
      gambarBintang(ctx, tcx, ikonY, 23, ACCENT);
    } else {
      // Cadangan kalau ikon gagal dimuat: penanda netral, bukan kotak kosong.
      ctx.fillStyle = ACCENT;
      ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText('•', tcx, ikonY + 15);
    }
    ctx.fillStyle = '#2B2118';
    ctx.font = '800 54px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tiles[i].value, tcx, ty + 132);
    ctx.fillStyle = '#A99C8E';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tiles[i].label.toUpperCase(), tcx, ty + 178);
  }
  // Kartu leaderboard kembali ke 1 baris tile.
  const tinggiTiles = tileH;

  // ═══ Strip ajakan (dark, selaras header) ═══
  const ctaY = tileY + tinggiTiles + 148;
  ctx.fillStyle = '#1E1E26';
  roundRect(ctx, 64, ctaY, W - 128, 150, 28);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '700 38px "Plus Jakarta Sans", system-ui, sans-serif';
  // Ajakan menyesuaikan status: member NEXO Pass diajak main, pemain biasa
  // ditawari ikut (biar kartu yang dibagikan juga jadi promosi halus).
  ctx.fillText(
    player.premium ? 'Main bareng di NEXO Games, gratis!' : 'Main gratis di Discord, kamu mau nyusul?',
    W / 2, ctaY + 66
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
  ctx.fillText(domainTxt, W / 2, ctaY + 116);
  ctx.textAlign = 'left';

  return canvas;
}

/**
 * Tombol bagikan kartu.
 *
 * @param {object} props
 * @param {object} props.player - data pemain. Field yang dipakai:
 *        username, avatarUrl, points, level, rank? (leaderboard),
 *        premium? (true bila NEXO Pass aktif), totalWon?, dailyStreak?,
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
      // Semua emoji kartu dimuat sebagai PNG STATIS (emojiSrcStatis) - beberapa
      // di antaranya aslinya GIF dan canvas tidak bisa menggambar GIF.
      // Nama emoji disamakan dengan MeClient.STAT_ICONS supaya kartu & halaman
      // profil memakai ikon yang sama.
      const [coinImg, crownImg, medalImg, logoImg, nexopassImg, trophyImg, streakImg] = await Promise.all([
        loadImg(emojiSrcStatis('goldcoin', 128)),
        loadImg(emojiSrcStatis('crown', 128)),
        loadImg(emojiSrcStatis('medal', 128)),
        loadImg('/nexo-logo-256.png'),
        // download3 = merek NEXO Pass resmi (badge status di header)
        loadImg(emojiSrcStatis('download3', 128)),
        // Level TIDAK memakai emoji custom - digambar sebagai BINTANG VEKTOR
        // (lihat gambarBintang) supaya sederhana & tajam di semua ukuran.
        // trophy = Menang, 267042fire = Streak harian.
        loadImg(emojiSrcStatis('trophy', 128)),
        loadImg(emojiSrcStatis('267042fire', 128)),
      ]);
      const canvas = await renderCard({ player, coinImg, crownImg, medalImg, logoImg, nexopassImg, trophyImg, streakImg });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png', 0.95));
      if (!blob) throw new Error('render gagal');

      // Nama file & teks berbagi menyesuaikan konteks (peringkat vs profil).
      const dariProfil = player.board === 'profil';
      const namaFile = dariProfil
        ? 'nexo-profil.png'
        : `nexo-rank-${player.rank}.png`;
      const judul = dariProfil
        ? (player.premium ? `Profil NEXO Pass ${player.username}` : `Profil ${player.username} - NEXO Games`)
        : `Peringkat #${player.rank} NEXO Games`;
      const teks = dariProfil
        ? (player.premium
            ? 'Aku member NEXO Pass di NEXO Games!'
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

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
  // TINGGI DINAMIS, dihitung dari layout SEBELUM canvas dibuat supaya tidak
  // ada area kosong maupun konten kepotong (pernah terjadi: tinggi dipatok
  // sementara isinya bertambah).
  //   - leaderboard : header gelap + avatar + 2 tile grid -> 1350px (4:5)
  //   - profil      : kartu ID gaya terang (pita nama + data + 3 stat) -> 1340px
  //     Keduanya 4:5, tapi SANGAT berbeda secara visual (gelap vs terang).
  // Pita teks member sudah dihapus -> kartu profil premium & non-premium
  // sekarang TINGGINYA SAMA (status premium cukup ditandai badge di header).
  const dariProfilHitung = player.board === 'profil';
  // TINGGI DIHITUNG DARI LAYOUT, bukan angka bulat yang ditebak.
  // Dulu leaderboard dipatok 1350px padahal kontennya cuma butuh 1126px ->
  // ada ~224px ruang kosong di bawah sehingga kartu terlihat "pincang".
  // Leaderboard tetap 1350px (rasio 4:5 = 0.8, ukuran ideal untuk dibagikan),
  // TAPI ruang kosongnya DIISI (dulu 224px kosong -> kartu terlihat pincang).
  const H = dariProfilHitung ? 1340 : 1350;

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
    // KARTU PROFIL - GAYA KARTU ID / MEMBER (terang, tanpa header gelap)
    // ══════════════════════════════════════════════════════════════
    // Latar cream penuh + garis aksen oranye di tepi atas (bukan header blok).
    ctx.fillStyle = '#FBF7EC';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, W, 14);

    // ── Kepala: logo kecil + wordmark, rata kiri (BUKAN header gelap) ──
    let hx = 64;
    if (logoImg) {
      ctx.drawImage(logoImg, 64, 52, 64, 64);
      hx = 144;
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2B2118';
    ctx.font = '800 34px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('NEXO GAMES', hx, 76);
    ctx.fillStyle = '#A99C8E';
    ctx.font = '700 22px "Jakarta", sans-serif, system-ui';
    ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('KARTU PEMAIN', hx, 106);

    // ── PITA NAMA (ciri khas kartu ID): blok gelap berisi avatar + nama ──
    const pitaY = 152;
    const pitaH = 168;
    ctx.fillStyle = '#1E1E26';
    roundRect(ctx, 64, pitaY, W - 128, pitaH, 28);
    ctx.fill();

    // avatar bulat di KIRI pita (bukan di tengah menumpuk)
    const avR = 54;
    const avCx = 64 + 34 + avR;
    const avCy = pitaY + pitaH / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avCx, avCy, avR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#EFE7D3';
    ctx.fillRect(avCx - avR, avCy - avR, avR * 2, avR * 2);
    if (av) ctx.drawImage(av, avCx - avR, avCy - avR, avR * 2, avR * 2);
    ctx.restore();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(avCx, avCy, avR + 2, 0, Math.PI * 2); ctx.stroke();

    // nama + label di KANAN avatar (sumbu horisontal, bukan tengah)
    const teksKiri = avCx + avR + 30;
    const ruangNama = (W - 64) - teksKiri - (player.premium ? 100 : 20);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FBF7EC';
    ctx.font = '800 56px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(potongByLebar(ctx, player.username || '?', ruangNama), teksKiri, avCy - 12);
    ctx.fillStyle = 'rgba(169,156,142,1)';
    ctx.font = '600 24px "Plus Jakarta Sans", system-ui, sans-serif';
    const idTxt = player.discordId ? `ID ${String(player.discordId).slice(-6)}` : 'PEMAIN NEXO';
    ctx.fillText(potongByLebar(ctx, idTxt, ruangNama), teksKiri, avCy + 34);

    // badge NEXO Pass di UJUNG KANAN pita (konsisten bentuknya)
    if (player.premium) {
      const bd = 76;
      gambarBadgeNexoPass(ctx, W - 64 - 28 - bd / 2, avCy, bd, nexopassImg);
    }
    ctx.textAlign = 'center';

    // ── Data utama: POIN sebagai angka terbesar (identitas kartu) ──
    let y = pitaY + pitaH + 46;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#A99C8E';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('TOTAL POIN', 72, y);

    let ukFont = 104;
    ctx.fillStyle = '#2B2118';
    // angka menyesuaikan: muat di dalam lebar kartu
    const maksAngka = (W - 64) - 72;
    ctx.font = `800 ${ukFont}px "Plus Jakarta Sans", system-ui, sans-serif`;
    while (ctx.measureText(points).width > maksAngka && ukFont > 48) {
      ukFont -= 4;
      ctx.font = `800 ${ukFont}px "Plus Jakarta Sans", system-ui, sans-serif`;
    }
    ctx.fillText(points, 72, y + ukFont);
    // emoji koin di kanan angka (hiasan, tidak menghalangi)
    if (coinImg) {
      const wAngka = ctx.measureText(points).width;
      const posX = Math.min(72 + wAngka + 24, W - 64 - 64);
      ctx.drawImage(coinImg, posX, y + ukFont - 76, 64, 64);
    }
    ctx.textAlign = 'center';
    y += ukFont + 56;

    // ── Blok statistik berlabel (kotak-kotak kecil rapi) ──
    const stat = [
      { bintang: true, label: 'LEVEL', value: String(player.level || 1) },
      { icon: trophyImg, label: 'MENANG', value: fmtRingkas(player.totalWon || 0) },
      { icon: streakImg, label: 'STREAK', value: `${player.dailyStreak || 0}h` },
    ];
    const gapS = 20;
    const lebarS = (W - 128 - gapS * 2) / 3;
    const tingS = 150;
    for (let i = 0; i < stat.length; i++) {
      const bx = 64 + i * (lebarS + gapS);
      ctx.fillStyle = '#F4EEDF';
      roundRect(ctx, bx, y, lebarS, tingS, 22);
      ctx.fill();
      ctx.strokeStyle = '#E3D9C2';
      ctx.lineWidth = 2;
      roundRect(ctx, bx, y, lebarS, tingS, 22);
      ctx.stroke();
      const cx = bx + lebarS / 2;
      if (stat[i].icon) ctx.drawImage(stat[i].icon, cx - 20, y + 24, 40, 40);
      else if (stat[i].bintang) gambarBintang(ctx, cx, y + 44, 19, ACCENT);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#2B2118';
      ctx.font = '800 44px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(stat[i].value, cx, y + 108);
      ctx.fillStyle = '#A99C8E';
      ctx.font = '700 18px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(stat[i].label, cx, y + 136);
    }
    y += tingS + 44;

    // ── Strip ajakan ──
    ctx.fillStyle = '#1E1E26';
    roundRect(ctx, 64, y, W - 128, 138, 24);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      potongByLebar(ctx, player.premium ? 'Gabung juga di NEXO Games, gratis!' : 'Main gratis di Discord, kamu mau nyusul?', W - 160),
      W / 2, y + 64
    );
    const isDevP = typeof window !== 'undefined' && window.location.host.includes('localhost');
    const domP = isDevP ? 'NEXO Games  ·  xurbaybase'
      : `NEXO Games  ·  ${String(SITE_URL).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
    ctx.fillStyle = 'rgba(169,156,142,1)';
    ctx.font = '500 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(domP, W / 2, y + 108);
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
    ctx.fillText(rankTxt, pxLb + pw / 2, 110);
    ctx.textAlign = 'left';
    if (adaBadgeLb) {
      gambarBadgeNexoPass(ctx, pxLb + pw + jarakBadgeLb + ikonBadgeLb / 2, 96, ikonBadgeLb, nexopassImg);
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

  const tileY = avCyLb + avRLb + 252;
  // 4 TILE (2x2): mengisi ruang yang dulu kosong sehingga kartu tidak
  // lagi "pincang", sekaligus memberi informasi lebih banyak ke yang melihat
  // kartu hasil share. Level pakai BINTANG VEKTOR (emoji biasa).
  const tileH = 212;
  const tiles = [
    { icon: coinImg, label: 'Poin', value: points },
    { bintang: true, label: 'Level', value: String(player.level || 1) },
    { icon: trophyImg, label: 'Menang', value: fmtRingkas(player.totalWon || 0) },
    { icon: streakImg, label: 'Streak', value: `${player.dailyStreak || 0} hari` },
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
  // Kartu leaderboard selalu 1 baris tile (2 kotak).
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

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
  //   - leaderboard      : grid 2 tile          -> 1350px (rasio 4:5)
  //   - profil           : hero + baris statistik -> 1340px
  //     (premium & biasa sama; status premium = badge logo di header)
  // Pita teks member sudah dihapus -> kartu profil premium & non-premium
  // sekarang TINGGINYA SAMA (status premium cukup ditandai badge di header).
  const dariProfilHitung = player.board === 'profil';
  const H = dariProfilHitung ? 1340 : 1350;

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
    // Member NEXO Pass: emoji resmi ikut di sebelah pill peringkat (permintaan
    // owner) supaya statusnya terlihat langsung di kartu leaderboard, bukan
    // cuma di kartu profil. Dihitung dulu supaya pill+tema tidak menabrak logo.
    const adaBadge = Boolean(player.premium && nexopassImg);
    const ikonBadge = 48;
    const jarakBadge = 14;
    const totalW = pw + (adaBadge ? ikonBadge + jarakBadge : 0);
    const px = W - 64 - totalW;
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
    if (adaBadge) {
      // Badge NEXO Pass (lingkaran cream cerah + logo) di kanan pill peringkat,
      // sejajar tengah pill (60..132). Sama persis dengan badge di kartu profil.
      gambarBadgeNexoPass(ctx, px + pw + jarakBadge + ikonBadge / 2, (60 + 132) / 2, ikonBadge, nexopassImg);
    }
  } else if (player.premium) {
    // Tanpa peringkat (kartu profil) + member NEXO Pass: BADGE status di kanan
    // header - penanda yang langsung terlihat saat dibagikan.
    // Utamakan EMOJI RESMI NEXO Pass (gambar, konsisten dengan Discord).
    // Kalau emoji gagal dimuat (CDN diblokir/offline), JANGAN biarkan header
    // kosong - jatuh ke badge teks supaya status premium tetap tersampaikan.
    // Badge IDENTIK dengan kartu leaderboard: lingkaran cream cerah + logo,
    // ukuran sama supaya satu makna = satu tampilan di seluruh situs.
    const d = 48;
    gambarBadgeNexoPass(ctx, W - 64 - d / 2, 96, d, nexopassImg);
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
  // Nama dipotong berdasarkan LEBAR (bukan jumlah karakter) supaya tidak
  // pernah melebihi kartu / menimpa badge. Kartu profil punya badge di kanan
  // header, jadi ruangnya sedikit lebih sempit daripada kartu leaderboard.
  const name = potongByLebar(ctx, player.username || '?', W - 128 - (dariProfil ? 60 : 0));
  ctx.fillText(name, W / 2, avCy + avR + 86);
  ctx.fillStyle = '#6E6157';
  ctx.font = '600 30px "Plus Jakarta Sans", system-ui, sans-serif';
  if (!dariProfil) {
    // Sub-judul juga dipotong by-lebar (jaga-jaga kalau rank/teks berubah).
    const sub = potongByLebar(ctx, `Peringkat ${rank} Top Pemain${isPodium ? '  ·  masuk podium' : ''}`, W - 128);
    ctx.fillText(sub, W / 2, avCy + avR + 152);
  }

  const points = fmtRingkas(player.points || 0);
  // Sisa ruang setelah nama dipakai bersama oleh kedua jenis kartu.
  const tileY = avCy + avR + 208;

  // ═══════════════════════════════════════════════════════════════════
  // KARTU PROFIL - DESAIN SENGAJA BERBEDA dari kartu leaderboard.
  // Dulu keduanya memakai grid kotak yang sama sehingga tidak ada bedanya.
  // Kartu profil kini lebih PERSONAL:
  //   1. HERO besar: poin sebagai bintang utama (angka raksasa + emoji koin)
  //   2. Baris statistik ramping di bawahnya (bukan kotak-kotak)
  //   3. Member NEXO Pass dapat baris tambahan + pita "MEMBER NEXO Pass"
  //   4. Kalimat personal + tanggal bergabung (kalau ada)
  // ═══════════════════════════════════════════════════════════════════
  if (dariProfil) {
    const heroY = tileY;
    const heroH = 300;
    const heroTengah = heroY + heroH / 2;
    // Kartu hero cream-soft dengan aksen oranye di tepi (bukan kotak penuh)
    ctx.fillStyle = '#F4EEDF';
    roundRect(ctx, 64, heroY, W - 128, heroH, 32);
    ctx.fill();
    ctx.strokeStyle = '#E3D9C2';
    ctx.lineWidth = 2;
    roundRect(ctx, 64, heroY, W - 128, heroH, 32);
    ctx.stroke();
    // strip aksen kiri di dalam hero
    ctx.fillStyle = ACCENT;
    roundRect(ctx, 64, heroY, 10, heroH, 5);
    ctx.fill();

    // ── Emoji koin + angka poin: RAPI & ADAPTIF ──
    // Dulu posisi teks dipatok (heroY+150 dst) sehingga angka panjang bisa
    // menabrak tepi kanan. Sekarang ukuran huruf MENYESUAIKAN panjang angka
    // (maks 96px, mengecil bila perlu) dan blok teks dipusatkan vertikal
    // terhadap emoji koin - jadi selalu terlihat seimbang.
    const posKoin = 116;
    const ukuranKoin = 88;
    const teksX = posKoin + ukuranKoin + 28;
    const areaKanan = W - 64 - 32;
    const lebarTersedia = areaKanan - teksX;

    let ukFont = 96;
    ctx.font = `800 ${ukFont}px "Plus Jakarta Sans", system-ui, sans-serif`;
    while (ctx.measureText(points).width > lebarTersedia && ukFont > 44) {
      ukFont -= 4;
      ctx.font = `800 ${ukFont}px "Plus Jakarta Sans", system-ui, sans-serif`;
    }

    // ── TINGGI BLOK DIHITUNG DARI METRIK FONT (bukan angka patokan) ──
    // BUG yang diperbaiki: dulu tinggiBlok dipatok 112px, SEDANGKAN font angka
    // bisa sampai 96px. Untuk angka yang punya descender (mis. "999.999.999"),
    // bagian bawah angka turun melewati label "TOTAL POIN" -> teks saling
    // MENIMPA dan terlihat berantakan di kartu yang dibagikan.
    // Sekarang: ukur tinggi angka + tinggi label + jarak, lalu susun dari situ.
    const fontAngka = `800 ${ukFont}px "Plus Jakarta Sans", system-ui, sans-serif`;
    const fontLabel = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    const jarakAngkaLabel = 16; // jarak aman antara angka dan label

    ctx.font = fontAngka;
    const mA = ctx.measureText(points);
    const ascA = mA.actualBoundingBoxAscent || ukFont * 0.72;
    const descA = mA.actualBoundingBoxDescent || ukFont * 0.25;
    ctx.font = fontLabel;
    const mL = ctx.measureText('TOTAL POIN');
    const ascL = mL.actualBoundingBoxAscent || 17;
    const descL = mL.actualBoundingBoxDescent || 6;

    const tinggiBlok = ascA + descA + jarakAngkaLabel + ascL + descL;
    const blokAtas = heroTengah - tinggiBlok / 2;

    const baselineAngka = blokAtas + ascA;
    const baselineLabel = baselineAngka + descA + jarakAngkaLabel + ascL;

    if (coinImg) ctx.drawImage(coinImg, posKoin, heroTengah - ukuranKoin / 2, ukuranKoin, ukuranKoin);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#2B2118';
    ctx.font = fontAngka;
    ctx.fillText(points, teksX, baselineAngka);
    ctx.fillStyle = '#A99C8E';
    ctx.font = fontLabel;
    ctx.fillText('TOTAL POIN', teksX, baselineLabel);
    ctx.textAlign = 'center';

    // ── Baris statistik ramping (ikon + label + nilai), bukan grid kotak ──
    // Level pakai BINTANG VEKTOR (emoji biasa), bukan emoji custom - sesuai
    // permintaan owner, dan tampilannya lebih netral untuk statistik level.
    const baris = [
      { bintang: true, label: 'Level', value: String(player.level || 1) },
      { icon: trophyImg, label: 'Menang', value: fmtRingkas(player.totalWon || 0) },
      { icon: streakImg, label: 'Streak', value: `${player.dailyStreak || 0} hari` },
    ];
    const rowY = heroY + heroH + 34;
    const rowH = 116;
    const rowW = W - 128;
    const kolW = rowW / baris.length;
    ctx.fillStyle = '#F4EEDF';
    roundRect(ctx, 64, rowY, rowW, rowH, 24);
    ctx.fill();
    ctx.strokeStyle = '#E3D9C2';
    ctx.lineWidth = 2;
    roundRect(ctx, 64, rowY, rowW, rowH, 24);
    ctx.stroke();
    for (let i = 0; i < baris.length; i++) {
      const cx = 64 + kolW * i + kolW / 2;
      // pemisah antar kolom
      if (i > 0) {
        ctx.strokeStyle = '#E3D9C2';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(64 + kolW * i, rowY + 22);
        ctx.lineTo(64 + kolW * i, rowY + rowH - 22);
        ctx.stroke();
      }
      // Tata letak dirapikan: ikon DIPUSATKAN di atas label+nilai, bukan
      // menempel di kiri seperti sebelumnya (dulu ikon menggantung di sisi
      // kiri sehingga tiap kolom terlihat tidak seimbang).
      const ikonY = rowY + 30;
      if (baris[i].icon) {
        ctx.drawImage(baris[i].icon, cx - 18, ikonY - 18, 36, 36);
      } else if (baris[i].bintang) {
        gambarBintang(ctx, cx, ikonY, 17, ACCENT);
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#A99C8E';
      ctx.font = '700 19px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(baris[i].label.toUpperCase(), cx, rowY + 62);
      ctx.fillStyle = '#2B2118';
      ctx.font = '800 34px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(baris[i].value, cx, rowY + 88);
    }
    ctx.textAlign = 'center';

    // PITA TEKS "MEMBER NEXO Pass" DIHAPUS (permintaan owner).
    // Status premium cukup ditandai BADGE LOGO di header (sama seperti kartu
    // leaderboard) - tanpa tulisan tambahan, hasilnya lebih bersih & elegan.
    // Kartu jadi lebih ringkas juga: tidak ada baris pita yang memakan tinggi.
    const bawahY = rowY + rowH;

    // ── Strip ajakan (dark, selaras header) ──
    const ctaY = bawahY + 40;
    ctx.fillStyle = '#1E1E26';
    roundRect(ctx, 64, ctaY, W - 128, 150, 28);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = '700 36px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      potongByLebar(ctx, player.premium ? 'Gabung juga di NEXO Games, gratis!' : 'Main gratis di Discord, kamu mau nyusul?', W - 160),
      W / 2, ctaY + 58
    );
    const isDev = typeof window !== 'undefined' && window.location.host.includes('localhost');
    const domainTxt = isDev
      ? 'NEXO Games  ·  xurbaybase'
      : `NEXO Games  ·  ${String(SITE_URL).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
    ctx.fillStyle = 'rgba(169,156,142,1)';
    ctx.font = '500 26px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(domainTxt, W / 2, ctaY + 108);
    ctx.textAlign = 'left';
    return canvas;
  }

  // ═══════════════════════════════════════════════════════════════════
  // KARTU LEADERBOARD - tetap grid kotak (ciri khas kartu peringkat).
  // Member NEXO Pass dapat emoji di sebelah pill peringkat (lihat header).
  // ═══════════════════════════════════════════════════════════════════
  const tileH = 240;
  const tiles = [
    { icon: coinImg, label: 'Poin', value: points },
    // Level pakai BINTANG VEKTOR (emoji biasa), bukan emoji custom.
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
    const ikonY = ty + 62;
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
    ctx.fillText(tiles[i].value, tcx, ty + 148);
    ctx.fillStyle = '#A99C8E';
    ctx.font = '700 24px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(tiles[i].label.toUpperCase(), tcx, ty + 198);
  }
  // Kartu leaderboard selalu 1 baris tile (2 kotak).
  const tinggiTiles = tileH;

  // ═══ Strip ajakan (dark, selaras header) ═══
  const ctaY = tileY + tinggiTiles + 48;
  ctx.fillStyle = '#1E1E26';
  roundRect(ctx, 64, ctaY, W - 128, 150, 28);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = '700 38px "Plus Jakarta Sans", system-ui, sans-serif';
  // Ajakan menyesuaikan status: member NEXO Pass diajak main, pemain biasa
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

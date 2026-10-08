// Pemuat emoji KARTU GAMBAR (canvas) dengan fallback berlapis.
//
// KENAPA ADA: kartu share (pemain & guild) digambar ke <canvas>. Canvas hanya
// bisa melukis PNG/JPG, sedangkan banyak emoji kita berbentuk GIF. Karena itu
// kartu memakai versi .png statis dari CDN (emojiSrcStatis). Masalahnya:
// kalau .png itu gagal dimuat, `new Image()` menelan error -> resolve null ->
// drawImage dilewati -> ornamen (mis. medali podium) HILANG tanpa jejak.
//
// SOLUSI: coba .png statis dulu; kalau gagal, coba .gif (browser modern
// menggambar frame pertamanya dengan benar); kalau dua-duanya gagal, tulis
// peringatan ke console supaya tidak lagi gagal secara senyap.
import { emojiSrc, emojiSrcStatis, emojiSrcById, emojiSrcStatisById } from './emojisClient';

export function loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Muat emoji canvas lewat NAMA (untuk ikon yang namanya aman, mis. goldcoin).
export async function loadEmojiCanvas(nama, size = 128) {
  const img = (await loadImg(emojiSrcStatis(nama, size))) || (await loadImg(emojiSrc(nama, size)));
  if (!img) console.warn(`[share-card] emoji "${nama}" gagal dimuat (png & gif) - ornamen dilewati`);
  return img;
}

// Muat emoji canvas lewat ID (untuk ikon yang maknanya DIPAKU, mis. medali
// podium & party). Katalog emoji dinamis memakai nama asli Discord sehingga
// pencarian lewat nama bisa salah (insiden 2026-10-08: "medal" menunjuk
// emoji trophy lama). Selalu pakai ID untuk ornamen bernama tetap.
export async function loadEmojiCanvasById(id, size = 128) {
  const img = (await loadImg(emojiSrcStatisById(id, size))) || (await loadImg(emojiSrcById(id, size)));
  if (!img) console.warn(`[share-card] emoji id ${id} gagal dimuat (png & gif) - ornamen dilewati`);
  return img;
}


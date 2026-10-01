// ==========================================
// app/lib/waktuWib.js
// Bantu konversi & parsing waktu dengan zona WIB (Asia/Jakarta).
// ==========================================
//
// KENAPA DIPISAH: pengingat AI harus memakai WIB (permintaan pemilik: "ingat
// pake waktu WIB di Indonesia Jakarta"). Server Vercel berjalan di UTC,
// sehingga tanpa konversi, "jam 8 malam" akan tersimpan sebagai 20:00 UTC
// (= 03:00 WIB besoknya) - pengingatnya salah 7 jam.
//
// Pendekatan: simpan SEMUA waktu sebagai epoch ms (UTC murni). WIB hanya
// dipakai saat MENAMPILKAN dan saat MENAFSIRKAN teks dari pengguna/AI.

const OFFSET_WIB_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7

/** Format epoch ms menjadi teks WIB yang enak dibaca. */
export function formatWib(ms, denganJam = true) {
  if (!ms) return '-';
  const d = new Date(Number(ms) + OFFSET_WIB_MS);
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getUTCDay()];
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getUTCMonth()];
  const tanggal = `${hari}, ${d.getUTCDate()} ${bulan} ${d.getUTCFullYear()}`;
  if (!denganJam) return tanggal;
  const jam = String(d.getUTCHours()).padStart(2, '0');
  const menit = String(d.getUTCMinutes()).padStart(2, '0');
  return `${tanggal} ${jam}:${menit} WIB`;
}

/** Tanggal hari ini di WIB, sebagai { tahun, bulan(0-11), tanggal }. */
export function hariIniWib() {
  const d = new Date(Date.now() + OFFSET_WIB_MS);
  return { tahun: d.getUTCFullYear(), bulan: d.getUTCMonth(), tanggal: d.getUTCDate() };
}

/**
 * Ubah tanggal+jam WIB menjadi epoch ms.
 * @param {number} tahun
 * @param {number} bulan 0-11
 * @param {number} tanggal
 * @param {number} jam 0-23 (default 09:00 WIB - pagi, waktu yang masuk akal
 *   untuk pengingat promo supaya pemilik masih sempat menyiapkan)
 * @param {number} menit
 */
export function wibKeEpoch(tahun, bulan, tanggal, jam = 9, menit = 0) {
  return Date.UTC(tahun, bulan, tanggal, jam, menit, 0, 0) - OFFSET_WIB_MS;
}

// Hari raya / momen yang sering dipakai pemilik. Dipakai untuk menafsirkan
// sebutan seperti "pas Halloween" tanpa perlu AI menghitung tanggal sendiri
// (AI sering salah hitung, terutama tahun depan).
// Tanggal mengikuti kalender Indonesia (Halloween & Natal tetap tanggalnya).
export const MOMEN = {
  'halloween': { bulan: 9, tanggal: 31, nama: 'Halloween' },
  'natal': { bulan: 11, tanggal: 25, nama: 'Natal' },
  'christmas': { bulan: 11, tanggal: 25, nama: 'Natal' },
  'tahun baru': { bulan: 0, tanggal: 1, nama: 'Tahun Baru' },
  'new year': { bulan: 0, tanggal: 1, nama: 'Tahun Baru' },
  'valentine': { bulan: 1, tanggal: 14, nama: 'Valentine' },
  'kemerdekaan': { bulan: 7, tanggal: 17, nama: 'HUT RI' },
  'idul fitri': null, // tanggal hijriah - TIDAK ditebak, AI harus tanya
  'lebaran': null,
};

/**
 * Cari momen yang disebut di teks, kembalikan epoch ms WIB-nya.
 * Kalau momennya sudah lewat tahun ini, pakai tahun depan.
 * @returns {{epoch:number, nama:string}|null}
 */
export function cariMomen(teks) {
  const t = String(teks || '').toLowerCase();
  for (const [kunci, m] of Object.entries(MOMEN)) {
    if (!m) continue; // tanggal hijriah - lewati
    if (!t.includes(kunci)) continue;
    const ini = hariIniWib();
    let tahun = ini.tahun;
    // Kalau momennya sudah lewat bulan ini (atau bulan lalu), pakai tahun depan.
    const lewat = ini.bulan > m.bulan || (ini.bulan === m.bulan && ini.tanggal > m.tanggal);
    if (lewat) tahun += 1;
    return { epoch: wibKeEpoch(tahun, m.bulan, m.tanggal, 9, 0), nama: m.nama };
  }
  return null;
}

/** Apakah waktu pengingat sudah tiba? */
export function sudahTiba(ms) {
  return Number(ms) <= Date.now();
}

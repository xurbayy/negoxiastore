// ==========================================
// app/lib/hariLibur.js
// Hari libur & perayaan Indonesia dari Google Calendar.
// ==========================================
//
// KENAPA PAKAI GOOGLE CALENDAR (permintaan pemilik 2026-10-01):
//   "gw mau ditambah lagi ya halloween terus tahun baru pokoknya full kalender
//   di Indonesia bisa ga baca semua acaranya".
//
//   Daftar hari libur Indonesia TIDAK BISA di-hardcode karena sebagian
//   memakai kalender Hijriah (Idul Fitri, Idul Adha, Maulid, Muharram) dan
//   Imlek - tanggalnya bergeser tiap tahun. Menghitungnya sendiri rawan salah.
//
//   Google Calendar menyediakan feed ICS PUBLIK untuk hari libur Indonesia.
//   Keunggulan dibanding Google Calendar API ber-kunci:
//     - TIDAK butuh API key / service account (tidak ada setup Google Cloud)
//     - TIDAK ada kuota yang bisa habis
//     - Google yang mengurus pembaruan tanggal, termasuk Hijriah & Imlek
//
//   Data mencakup 2021-2027 (diverifikasi saat implementasi).
//
// CACHE: hasil disimpan di memori 24 jam. Feed ini jarang berubah, dan kita
// tidak mau menariknya setiap kali AI dipanggil.

const URL_ICS = 'https://calendar.google.com/calendar/ical/id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics';
const CACHE_MS = 24 * 60 * 60 * 1000;

let _cache = { ts: 0, daftar: [] };

/**
 * Ambil daftar hari libur (di-cache 24 jam).
 * @returns {Promise<Array<{tanggal:string, nama:string}>>}
 */
export async function ambilHariLibur() {
  const sekarang = Date.now();
  if (_cache.daftar.length && sekarang - _cache.ts < CACHE_MS) return _cache.daftar;

  try {
    const res = await fetch(URL_ICS, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ics = await res.text();
    const daftar = uraikanICS(ics);
    if (daftar.length) {
      _cache = { ts: sekarang, daftar };
      return daftar;
    }
    throw new Error('tidak ada event terbaca');
  } catch {
    // Gagal ambil: pakai cache lama kalau ada (walau kedaluwarsa) - lebih baik
    // daripada kosong. Kalau tidak ada sama sekali, kembalikan array kosong.
    return _cache.daftar || [];
  }
}

/**
 * Uraikan teks ICS menjadi daftar { tanggal: 'YYYY-MM-DD', nama }.
 * Hanya mengambil event bertanggal penuh (VALUE=DATE) - hari libur selalu
 * seharian, bukan jam tertentu.
 */
function uraikanICS(ics) {
  const hasil = [];
  const blok = String(ics || '').split('BEGIN:VEVENT').slice(1);
  for (const b of blok) {
    const mTgl = b.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/);
    const mNama = b.match(/SUMMARY:(.+)/);
    if (!mTgl || !mNama) continue;
    const nama = mNama[1].trim().replace(/\\,/g, ',');
    hasil.push({ tanggal: `${mTgl[1]}-${mTgl[2]}-${mTgl[3]}`, nama });
  }
  return hasil;
}

/**
 * Daftar hari libur yang akan datang (dari hari ini sampai N hari ke depan).
 * @param {number} hariKeDepan default 400 (lebih dari setahun, supaya tahun
 *   depan ikut terlihat - pemilik sering merencanakan promo jauh hari)
 * @returns {Promise<Array<{tanggal:string, nama:string}>>}
 */
export async function hariLiburMendatang(hariKeDepan = 400) {
  const semua = await ambilHariLibur();
  const ini = new Date();
  const batasAwal = ini.toISOString().slice(0, 10);
  const batasAkhir = new Date(ini.getTime() + hariKeDepan * 86400000).toISOString().slice(0, 10);
  return semua
    .filter((h) => h.tanggal >= batasAwal && h.tanggal <= batasAkhir)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

/**
 * Cari hari libur berdasarkan sebutan di teks (mis. "idul fitri", "imlek").
 *
 * PENTING - pencocokan harus LENTUR: nama di Google panjang ("Hari Idul Fitri",
 * "Cuti Bersama Tahun Baru Imlek", "Hari Suci Nyepi (Tahun Baru Saka)")
 * sedangkan pemilik menulis singkat ("idul fitri", "imlek", "nyepi").
 *
 * TIGA aturan supaya hasilnya tepat:
 *   1. Kata umum (hari, cuti, bersama, tahun, baru, ...) diabaikan - kata itu
 *      ada di hampir semua nama libur, jadi tidak menandakan apa pun.
 *   2. Pilih kandidat dengan KATA COCOK TERBANYAK, bukan yang pertama ketemu.
 *      Tanpa ini, "idul adha" salah cocok ke "Cuti Bersama Idul Fitri" karena
 *      kata "idul" ketemu lebih dulu.
 *   3. Kalau ada dua kandidat dengan skor sama, utamakan yang BUKAN
 *      "cuti bersama" - hari libur utamanya yang diinginkan pemilik.
 *
 * @param {string} teks
 * @returns {Promise<{tanggal:string, nama:string}|null>}
 */
export async function cariHariLibur(teks) {
  const t = String(teks || '').toLowerCase();
  if (!t) return null;
  const mendatang = await hariLiburMendatang(400);

  // Kata yang muncul di hampir semua nama libur - tidak berguna sebagai penanda.
  const KATA_UMUM = new Set([
    'hari', 'cuti', 'bersama', 'tahun', 'baru', 'raya', 'nasional',
    'internasional', 'keagamaan', 'peringatan', 'malam', 'belum', 'pasti',
    'joint', 'holiday', 'for', 'the', 'dan', 'atau', 'yang', 'suci',
  ]);

  // Pecah teks pemilik jadi KATA UTUH (bukan potongan huruf).
  //
  // KENAPA: pencocokan dengan `t.includes(kata)` bisa salah - "waisak"
  // mengandung "isa", sehingga "pas waisak" salah cocok ke "Wafat Isa
  // Almasih". Dengan kata utuh, "isa" tidak akan cocok dengan "waisak".
  const kataTeks = new Set(t.split(/[^a-z0-9]+/).filter(Boolean));

  // ALIAS: sebutan populer yang TIDAK ada di nama resmi Google Calendar.
  // Tanpa ini, "promo tahun baru" gagal karena nama resminya "Hari Tahun
  // Baru" - kata "hari" tidak ada di teks pemilik, dan semua kata lain
  // ("tahun","baru") tersaring sebagai kata umum.
  const ALIAS = [
    { cocok: ['tahun', 'baru'], pilih: /tahun baru/i, bukan: /malam/i, nama: 'Tahun Baru' },
    { cocok: ['malam', 'tahun', 'baru'], pilih: /malam tahun baru/i, nama: 'Malam Tahun Baru' },
  ];
  for (const a of ALIAS) {
    if (!a.cocok.every((k) => kataTeks.has(k))) continue;
    const kandidat = mendatang.filter((h) => a.pilih.test(h.nama) && !(a.bukan && a.bukan.test(h.nama)));
    if (kandidat.length) return kandidat[0];
  }

  let terbaik = null;
  let skorTerbaik = 0;

  for (const h of mendatang) {
    const kataKunci = h.nama.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((x) => x.length > 2 && !KATA_UMUM.has(x));

    // Kasus khusus: nama libur yang SEMUA katanya umum (mis. "Hari Tahun
    // Baru" -> setelah 'hari' & 'tahun' & 'baru' dibuang, tidak ada sisa).
    //
    // Untuk itu, periksa apakah FRASA di teks pemilik mengandung semua kata
    // nama liburnya (tanpa kata umum). "promo tahun baru" mengandung "tahun"
    // dan "baru" -> cocok dengan "Hari Tahun Baru".
    let skor = 0;
    if (!kataKunci.length) {
      const kataNama = h.nama.toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((x) => x.length > 2 && !KATA_UMUM.has(x));
      // Kalau semua katanya umum, ambil kata bermakna dari nama (tanpa filter)
      const kataSisa = h.nama.toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((x) => x.length > 2);
      const dasar = kataNama.length ? kataNama : kataSisa;
      if (dasar.length && dasar.every((k) => kataTeks.has(k))) skor = 1;
    } else {
      skor = kataKunci.filter((k) => kataTeks.has(k)).length;
    }
    if (skor === 0) continue;

    // Aturan 2: skor lebih tinggi menang.
    // Aturan 3: skor sama -> yang BUKAN "cuti bersama" menang.
    const diaCuti = /cuti bersama/i.test(h.nama);
    const terbaikCuti = terbaik ? /cuti bersama/i.test(terbaik.nama) : true;
    const lebihBaik = skor > skorTerbaik
      || (skor === skorTerbaik && terbaikCuti && !diaCuti);

    if (lebihBaik) {
      terbaik = h;
      skorTerbaik = skor;
    }
  }

  return terbaik;
}

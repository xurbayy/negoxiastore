// ==========================================
// app/lib/aiAgen.js -> Agen AI (monitoring + usulan aksi)
// ==========================================
//
// Permintaan pemilik 2026-10-02:
//   "agen AI monitoring, tiap jam 12 kasih info + saran aksi (mis. diskon VIP
//    pass 30%). Kalau gw setuju, dia langsung lakuin. Sebelum ngajuin kasih
//    tau risiko & sarannya. Keputusan tetap di tangan gw."
//   "SEMUA HAL BISA DIA LAKUKAN kayak ban user lalu apapun di panel admin tak
//    terkecuali buat kode redeem - tapi kasih info dulu buat gw setuju."
//
// CARA KERJA (hemat token & aman):
//   1. Cron harian (jam 12 WIB) memanggil POST /api/admin/ai/agen.
//   2. Agen baca snapshot + panel, MINTA AI menganalisis SEKALI.
//   3. AI menulis: Ringkasan + Temuan + USULAN AKSI (format khusus).
//   4. Usulan disimpan status 'menunggu' - TIDAK dijalankan otomatis.
//   5. Pemilik lihat di panel: tombol Setujui / Tolak.
//   6. Setujui -> aksi dikirim ke bot (whitelist bot tetap berlaku).
//
// AGEN BOLEH MENGUSULKAN SEMUA AKSI panel admin (termasuk ban, wipe, redeem).
// Karena itu setiap usulan WAJIB menyertakan TINGKAT RISIKO agar pemilik
// memutuskan dengan sadar. Aksi risiko TINGGI ditandai jelas di UI.

// Tingkat risiko per aksi (dipakai UI untuk warna & peringatan).
export const RISIKO_AKSI = {
  // RENDAH - aman, mudah dibalik
  set_discount: 'rendah',
  remove_discount: 'rendah',
  restock_item: 'rendah',
  restock_all: 'rendah',
  set_price: 'rendah',
  set_announcement: 'rendah',
  create_promo: 'rendah',
  delete_promo: 'sedang',
  add_points: 'sedang',
  add_item: 'sedang',
  set_level: 'sedang',
  set_streak: 'sedang',
  set_winstreak: 'sedang',
  set_chemistry: 'sedang',
  reset_daily: 'sedang',
  clear_lock: 'sedang',
  grant_premium: 'sedang',
  add_title: 'sedang',
  set_admin_title: 'sedang',
  clear_admin_title: 'sedang',
  remove_item: 'sedang',
  clear_loan: 'sedang',
  reset_missions: 'tinggi',
  redeem_promo_web: 'sedang',
  revoke_premium: 'tinggi',
  remove_points: 'tinggi',
  set_points: 'tinggi',
  giveaway: 'tinggi',
  set_maintenance: 'tinggi',
  timeout: 'tinggi',
  ban: 'tinggi',
  unban: 'sedang',
  wipe: 'kritis',
};

/** Tingkat risiko sebuah aksi. */
export function risikoAksi(aksi) {
  return RISIKO_AKSI[aksi] || 'sedang';
}

/** Instruksi sistem khusus agen (ditambahkan ke prompt biasa). */
export const PROMPT_AGEN = [
  'PERAN: Agen Pemantau NEXO (berjalan otomatis, laporan SATU ARAH ke pemilik).',
  'Pemilik TIDAK mengobrol denganmu. Kamu membaca data lalu melapor.',
  'Kamu TIDAK menjalankan apa pun sendiri - setiap usulan menunggu persetujuan.',
  '',
  'TUGAS UTAMA - periksa SEMUA ini dan laporkan apa adanya (kalau kosong, bilang kosong):',
  '1. EKSPLOITASI / KECURANGAN: pemain dengan lonjakan poin tak wajar, pola transaksi',
  '   mencurigakan, klaim promo/redeem berlebihan, item/poin ganda, pinjaman tak wajar.',
  '2. PINJAMAN BANK: siapa yang menunggak (sebut NAMA + jumlah + berapa lama),',
  '   total piutang, apakah ada yang mendekati jatuh tempo.',
  '3. AKTIVITAS PER SERVER: server mana paling aktif, mana yang kosong, dan pemain',
  '   yang paling aktif di tiap server (sebut nama).',
  '4. PEMAIN: siapa paling kaya, siapa menimbun item, siapa baru (potensi churn),',
  '   siapa tidak aktif lama.',
  '5. EKONOMI: poin beredar vs pemain, inflasi/penumpukan, item menumpuk & item habis.',
  '6. TOKO: item terlaris, item tak laku, stok kritis, harga janggal.',
  '7. KOMUNITAS: guild, war, partner/chemistry, retensi.',
  '8. ERROR: log error terakhir & dampaknya.',
  '',
  'FORMAT WAJIB (ikuti persis, huruf kapital di awal kata):',
  'Ringkasan: (3-5 baris - kondisi terpenting hari ini, WAJIB ada angka)',
  'Temuan: (5-8 poin, dipisah baris baru dengan "- ", masing-masing ada angka',
  '  DAN nama pemain/server kalau relevan)',
  '',
  'Contoh temuan yang BAGUS (detail, ada nama):',
  '- sweetsucidial menunggak pinjaman 250.000 poin selama 5 hari (paling lama).',
  '- Server "NEXO Utama" naik 12 pemain hari ini; 24 server lain kosong.',
  '- 3 pemain klaim promo NEXOGIFT 8x dalam sehari (normalnya 1x).',
  '',
  'Lalu tulis USULAN AKSI dalam blok khusus. PENTING:',
  '- Usulan BERSIFAT OPSIONAL. Kalau temuanmu cuma perlu DILAPORKAN (tidak butuh',
  '  aksi), TIDAK USAH ada blok [[USUL]] sama sekali.',
  '- Maksimal 3 usulan, dan hanya kalau memang perlu tindakan.',
  'Satu usulan = satu blok:',
  '[[USUL]]',
  'judul: (singkat, mis. "Diskon VIP Pass 30%")',
  'aksi: set_discount',
  'payload: {"itemKey":"vip_pass","discountPrice":10500,"durationHours":24}',
  'alasan: (kenapa bagus, dengan angka & nama)',
  'risiko: (apa yang bisa salah - JUJUR, spesifik)',
  '[[/USUL]]',
  '',
  'AKSI YANG BOLEH DIUSULKAN (persis nama ini):',
  'set_discount, remove_discount, restock_item, restock_all, set_price,',
  'set_announcement, create_promo, delete_promo, add_points, remove_points,',
  'set_points, add_item, remove_item, set_level, set_streak, set_winstreak,',
  'clear_loan, set_chemistry, grant_premium, revoke_premium, reset_daily,',
  'reset_missions, clear_lock, add_title, set_admin_title, clear_admin_title,',
  'timeout, ban, unban, giveaway, set_maintenance, wipe.',
  '',
  'ATURAN USULAN:',
  '- payload harus sesuai aksi (mis. ban: {"userId":"...","reason":"..."}).',
  '- Aksi destruktif (ban, wipe, set_maintenance, set_points, remove_points)',
  '  HANYA kalau ada bukti kuat. Kalau ragu, JANGAN usulkan - cukup laporkan.',
  '- Setiap usulan WAJIB punya alasan (angka) dan risiko (jujur & spesifik).',
  '- Kalau tidak ada yang layak, tulis "Tidak ada usulan hari ini."',
  '- Jangan mengarang angka. Kalau data tidak ada, katakan tidak ada.',
].join('\n');

/**
 * Urai blok [[USUL]]...[[/USUL]] dari jawaban AI.
 * @returns {{ bersih: string, usulan: Array<{judul,aksi,payload,alasan,risiko,tingkat}> }}
 */
export function uraikanUsulan(jawaban) {
  const teks = String(jawaban || '');
  const usulan = [];
  const re = /\[\[\s*USUL\s*\]\]([\s\S]*?)\[\[\s*\/\s*USUL\s*\]\]/gi;
  let m;
  while ((m = re.exec(teks))) {
    const blok = m[1];
    const ambil = (nama) => {
      const r = new RegExp('^\\s*' + nama + '\\s*:\\s*(.+)$', 'im');
      const x = blok.match(r);
      return x ? x[1].trim() : '';
    };
    const judul = ambil('judul');
    const aksi = ambil('aksi');
    const payloadRaw = ambil('payload');
    const alasan = ambil('alasan');
    const risiko = ambil('risiko');
    if (!judul || !aksi) continue;
    let payload = null;
    try { payload = JSON.parse(payloadRaw); } catch { payload = null; }
    usulan.push({ judul, aksi, payload, alasan, risiko, tingkat: risikoAksi(aksi) });
  }
  const bersih = teks.replace(/\[\[\s*USUL\s*\]\][\s\S]*?\[\[\s*\/\s*USUL\s*\]\]/gi, '').replace(/\n{3,}/g, '\n\n').trim();
  return { bersih, usulan };
}

/**
 * Validasi ringan: pastikan aksi dikenal & payload objek. TIDAK membatasi
 * aksi (pemilik bilang semua boleh) - hanya menolak yang jelas rusak.
 * Batas nilai tetap dijaga agar tidak fatal (diskon <= 50%, harga >= 1000).
 */
export function validasiUsulan(u) {
  if (!u.aksi) return { ok: false, alasan: 'Aksi kosong.' };
  if (!u.payload || typeof u.payload !== 'object') return { ok: false, alasan: 'Payload kosong/tidak valid.' };
  if (u.aksi === 'set_discount') {
    const p = Number(u.payload.discountPrice);
    if (!Number.isFinite(p) || p <= 0) return { ok: false, alasan: 'discountPrice tidak valid.' };
  }
  if (u.aksi === 'set_price') {
    const p = Number(u.payload.price);
    if (!Number.isFinite(p) || p < 1000) return { ok: false, alasan: 'Harga minimal 1000 poin.' };
  }
  if (['set_discount', 'remove_discount', 'set_price', 'restock_item'].includes(u.aksi) && !u.payload.itemKey) {
    return { ok: false, alasan: 'itemKey wajib untuk aksi ini.' };
  }
  if (['add_points', 'remove_points', 'set_points', 'ban', 'unban', 'wipe', 'timeout', 'grant_premium', 'revoke_premium'].includes(u.aksi) && !u.payload.userId) {
    return { ok: false, alasan: 'userId wajib untuk aksi ini.' };
  }
  return { ok: true };
}

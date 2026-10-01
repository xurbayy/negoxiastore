// ==========================================
// app/lib/aiKonteks.js
// Rangkum snapshot bot jadi konteks untuk AI.
// ==========================================
//
// PRINSIP: AI hanya boleh menyimpulkan dari angka yang benar-benar ada.
// Jadi konteks ini disusun dari SNAPSHOT ASLI, dan tiap bagian diberi label
// satuan yang jelas. Angka yang tidak tersedia ditulis "tidak tersedia" -
// bukan dikosongkan - supaya AI tidak menebak.
//
// Yang TIDAK dikirim: data pribadi pemain (userId, avatar, dsb). AI hanya
// butuh AGREGAT. Ini juga menghemat token.

const rupiah = (n) => Number(n || 0).toLocaleString('id-ID');

/** Rakit konteks teks dari snapshot. Dipakai baik oleh chat maupun analisis cepat. */
export function susunKonteks(snap) {
  if (!snap) return 'TIDAK ADA DATA. Bot belum pernah mengirim snapshot.';

  const m = snap.monitor || {};
  const L = [];

  // ---------- Ringkasan umum ----------
  L.push('### RINGKASAN');
  L.push(`Snapshot dibuat: ${new Date(Number(snap.ts)).toISOString()}`);
  L.push(`Versi bot: ${m.botVersion || '-'}`);
  L.push(`Pemain terdaftar (aktif): ${m.totalUsers ?? '-'}`);
  L.push(`Pemain terdaftar (semua, termasuk tidak aktif): ${m.totalUsersAll ?? '-'}`);
  L.push(`Total poin beredar: ${rupiah(m.totalMoney)}`);
  L.push(`Member NEXO Pass aktif: ${m.premiumCount ?? '-'}`);
  L.push(`Game dimainkan hari ini: ${m.gamesToday ?? '-'}`);
  L.push(`Game dimainkan 7 hari: ${m.gamesWeek ?? '-'}`);
  L.push(`Sesi sedang berjalan: ${JSON.stringify(m.live || {})}`);
  L.push(`Pinjaman bank: ${JSON.stringify(m.loans || {})}`);
  L.push(`Pemain terbanned: ${(m.bannedUsers || []).length}`);
  L.push('');

  // ---------- Server ----------
  const servers = m.servers || [];
  const invites = m.invites || {};
  const adaPemain = servers.filter((s) => (Number(s.players) || 0) > 0);
  const nolPemain = servers.filter((s) => (Number(s.players) || 0) === 0);

  L.push('### SERVER (komunitas)');
  L.push(`Total server bot: ${servers.length}`);
  L.push(`Server ADA pemainnya: ${adaPemain.length}`);
  L.push(`Server 0 pemain: ${nolPemain.length}`);
  L.push(`Server punya link invite: ${Object.keys(invites).length}`);
  L.push('10 server teramai (nama | pemain | member | game | poin):');
  for (const s of servers.slice(0, 10)) {
    L.push(`- ${s.name} | ${s.players} | ${s.members} | ${s.games} | ${rupiah(s.points)}`);
  }
  L.push('');

  // ---------- Game ----------
  L.push('### GAME');
  L.push(`Top game HARI INI: ${JSON.stringify(m.topGamesToday || [])}`);
  L.push(`Game beta aktif: ${(snap.betaGames || []).map((b) => `${b.name} (${b.mode})`).join(', ') || '-'}`);
  L.push('');

  // ---------- Toko ----------
  const items = snap.shopItems || [];
  const kategori = snap.shopCategories || [];
  L.push('### TOKO');
  L.push(`Jumlah item: ${items.length} | kategori: ${kategori.length}`);
  L.push(`Kategori: ${kategori.map((c) => c.value).join(', ')}`);

  // Stok menipis = sinyal penting untuk keputusan restock/promo.
  const stokNol = items.filter((i) => Number(i.stock) === 0);
  const stokTipis = items.filter((i) => Number(i.stock) > 0 && Number(i.stock) <= 5);
  L.push(`Item stok HABIS (${stokNol.length}): ${stokNol.map((i) => i.name).join(', ') || '-'}`);
  L.push(`Item stok TIPIS <=5 (${stokTipis.length}): ${stokTipis.map((i) => `${i.name}(${i.stock})`).join(', ') || '-'}`);

  // Sebaran item per game_type -> dasar saran "promo item game X".
  const perGame = {};
  for (const i of items) {
    const g = i.gameType || '(tanpa game)';
    perGame[g] = (perGame[g] || 0) + 1;
  }
  L.push('Sebaran item per game_type: ' +
    Object.entries(perGame).map(([g, n]) => `${g}=${n}`).join(', '));
  L.push('Daftar item (nama | harga | stok | game | kategori) - 30 termurah:');
  for (const i of [...items].sort((a, b) => a.price - b.price).slice(0, 30)) {
    L.push(`- ${i.name} | ${rupiah(i.price)} | ${i.stock} | ${i.gameType || '-'} | ${i.category || '-'}`);
  }
  L.push('');

  // ---------- Promo & diskon ----------
  L.push('### PROMO');
  L.push(`Kode promo aktif: ${JSON.stringify(snap.promoCodes || [])}`);
  L.push(`Flash sale aktif: ${(snap.flashSales || []).length}`);
  L.push(`Diskon aktif: ${(snap.discounts || []).length}`);
  L.push('');

  // ---------- Misi & title ----------
  L.push('### MISI & TITLE');
  L.push(`Jumlah misi: ${(snap.missionCatalog || []).length}`);
  const misiCat = {};
  for (const mi of snap.missionCatalog || []) misiCat[mi.cat] = (misiCat[mi.cat] || 0) + 1;
  L.push(`Misi per kategori: ${Object.entries(misiCat).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  L.push(`Jumlah title: ${(snap.titleCatalog || []).length} | harga: ` +
    (snap.titleCatalog || []).map((t) => `${t.key}=${rupiah(t.price)}`).join(', '));
  L.push('');

  // ---------- Ekonomi ----------
  L.push('### EKONOMI');
  L.push(`Pemain terkaya: ${JSON.stringify((snap.richest || []).slice(0, 5))}`);
  L.push(`Leaderboard: ${JSON.stringify((snap.leaderboard || []).slice(0, 5))}`);
  L.push(`Guild terkuat: ${JSON.stringify(snap.guildBoard || [])}`);
  L.push(`Member premium (tier): ` +
    ((snap.premiumMembers || []).length + ' orang'));
  L.push(`Judul admin dipegang: ${(m.adminTitleHolders || []).length}`);

  return L.join('\n');
}

// Instruksi format TERPISAH dari instruksi tugas, supaya bisa dipakai semua
// jalur (chat maupun tombol pintas) tanpa duplikasi.
//
// KENAPA LARANGAN TABEL & EMOJI PENTING:
//   Jawaban ditampilkan di panel sebagai TEKS BIASA (bukan HTML), jadi tabel
//   markdown muncul sebagai pipa-pipa berantakan dan emoji menambah bising
//   tanpa informasi. Diuji: tanpa larangan ini AI menulis tabel penuh dan
//   hasilnya sulit dibaca di layar.
export const ATURAN_FORMAT = [
  'ATURAN FORMAT (wajib):',
  '- Jangan memakai TABEL markdown. Kalau perlu membandingkan, pakai daftar bernomor atau "A: x | B: y" dalam satu baris.',
  '- Jangan memakai emoji sama sekali.',
  '- Jangan memakai em dash. Pakai tanda hubung biasa.',
  '- Judul bagian ditulis KAPITAL diikuti titik dua: TEMUAN:, SARAN:, RISIKO:.',
  '- Bahasa Indonesia santai tapi rapi. Langsung ke isi, jangan mengulang data mentah.',
].join('\n');

// ==========================================
// TOMBOL PINTAS
// ==========================================
// Tiap pintasan punya instruksi sendiri supaya jawabannya fokus dan tidak
// bertele-tele. Semua WAJIB memakai angka dari data, dan menyebut kalau
// datanya belum cukup.

export const PINTASAN = [
  {
    id: 'promo',
    label: 'Saran Promo',
    tanya: 'Susun rencana promo mingguan. Pilih item/game mana yang dipromo dan jelaskan ALASANNYA pakai angka (stok, harga, game_type, jumlah item sejenis). Sebutkan juga promo apa yang sebaiknya DIHENTIKAN karena tidak efektif, kalau ada datanya.',
  },
  {
    id: 'sepi',
    label: 'Item & Game Sepi',
    tanya: 'Cari bagian yang paling sepi: item dengan stok menumpuk, game yang tidak muncul di top game hari ini, kategori yang isinya sedikit, wilayah lain yang angkanya menonjol sebagai masalah. Urutkan dari yang paling mendesak.',
  },
  {
    id: 'retensi',
    label: 'Retensi Pemain',
    tanya: 'Analisis retensi dari data yang ada: pemain terdaftar vs yang bermain, sebaran server (berapa yang 0 pemain), pinjaman bank, member premium. Apa yang paling mungkin membuat pemain berhenti, dan langkah konkret apa yang bisa diambil.',
  },
  {
    id: 'ekonomi',
    label: 'Kesehatan Ekonomi',
    tanya: 'Nilai kesehatan ekonomi: total poin beredar vs jumlah pemain, siapa yang menimbun poin paling banyak (pemain terkaya), pinjaman bank yang beredar, harga barang di toko. Apakah inflasi/penumpukan poin mengkhawatirkan? Jelaskan dengan angka.',
  },
  {
    id: 'komunitas',
    label: 'Pertumbuhan Komunitas',
    tanya: 'Analisis sisi komunitas: 44 server tapi berapa yang benar-benar aktif, sebaran pemain antar server, guild yang cuma sedikit, link invite yang belum jadi. Apa langkah paling berdampak untuk menumbuhkan komunitas.',
  },
  {
    id: 'guild',
    label: 'Masalah Guild & War',
    tanya: 'Fokus ke fitur guild: jumlah guild, jumlah member, hasil war, poin guild. Kenapa fitur ini mungkin kurang hidup dibanding fitur lain? Beri langkah perbaikan yang bisa diukur.',
  },
  {
    id: 'semua',
    label: 'Gambaran Menyeluruh',
    tanya: 'Beri gambaran menyeluruh isi snapshot ini. Sebutkan 5 hal paling penting yang perlu diperhatikan pemilik, urut dari yang paling berdampak, masing-masing dengan angka pendukung dan saran tindakan konkret.',
  },
];

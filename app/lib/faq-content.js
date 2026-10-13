// ==========================================
// FAQ homepage - SETIAP jawaban WAJIB diverifikasi ke kode bot/web.
// ==========================================
// ATURAN (permintaan pemilik 2026-10-13): "hati hati harus real jangan
// halu" - jangan pernah menulis fitur/harga/angka yang tidak ada di kode.
// Sumber kebenaran per jawaban:
//   - Jumlah game & gratis  -> games/ (28 modul) + commands/help.js
//   - Cara mulai/daftar     -> index.js gerbang onboarding + HowToPlay
//   - NEXO Pass             -> commands/help.js blok premium + PLAN_PRICE
//   - Cara beli             -> /premium (durasi 1-12 bln, Duitku checkout)
//   - Poin harian           -> nxdaily, streak lanjut <=48 jam (database.js)
//   - Invite bot            -> InviteButton + NEXT_PUBLIC_BOT_INVITE
//   - Poin virtual          -> tidak ada fitur jual-beli poin
//   - Data dikumpulkan      -> Kebijakan Privasi
//   - Cookie                -> cookie fungsional + Google AdSense
//   - Hapus data            -> FeedbackButton -> admin reset progres
export const FAQS = [
  {
    q: 'Apakah NEXO Games gratis?',
    a: 'Ya, semua game dan fitur inti (ekonomi, guild, bank, shop, leaderboard) gratis dimainkan. NEXO Pass bersifat opsional: menambah kuota, inventori unlimited, akses game beta, dan prioritas render.',
  },
  {
    q: 'Bagaimana cara mulai bermain?',
    a: 'Ketik perintah pertamamu di server yang ada bot NEXO, misalnya nxdaily. Tekan tombol "Daftar & Main" sekali untuk menyetujui ketentuan, dan akunmu langsung dibuat. Tidak perlu daftar akun, email, atau password.',
  },
  {
    q: 'Bagaimana cara menambahkan bot ke server saya?',
    a: 'Klik tombol "Tambahkan ke Discord" di halaman ini, pilih server kamu, dan setujui izin yang diminta. Bot butuh izin kirim pesan, embed, dan lampiran untuk menampilkan visual game.',
  },
  {
    q: 'Apa itu NEXO Pass dan apa keunggulannya?',
    a: 'NEXO Pass adalah keanggotaan premium seharga Rp 20.000 per bulan. Keunggulannya: inventori unlimited, kuota harian +5.000 poin, klaim harian +10%, bunga pinjaman -10%, +1 slot misi harian, prioritas render, akses game beta lewat nxtest, dan badge profil di website.',
  },
  {
    q: 'Bagaimana cara membeli NEXO Pass?',
    a: 'Buka halaman Premium di website ini, pilih durasi 1 sampai 12 bulan, pilih metode pembayaran (QRIS, e-wallet, atau Virtual Account bank), lalu selesaikan pembayaran. Pass aktif otomatis setelah pembayaran terkonfirmasi, tanpa perlu kirim bukti ke admin.',
  },
  {
    q: 'Bagaimana cara klaim poin harian?',
    a: 'Ketik nxdaily setiap hari untuk klaim poin plus bonus streak. Streak berlanjut kalau kamu klaim dalam 48 jam; kalau lewat, streak kembali dari awal.',
  },
  {
    q: 'Apakah poin di NEXO Games punya nilai uang asli?',
    a: 'Tidak. Poin NEXO murni virtual untuk keseruan bermain, tidak memiliki nilai mata uang asli dan tidak bisa dibeli atau dijual.',
  },
  {
    q: 'Data apa yang dikumpulkan bot?',
    a: 'Hanya Discord User ID, username, dan progres game kamu (poin, level, inventori, guild). Tidak ada email, nomor telepon, isi chat, atau data sensitif lainnya. Detail lengkap ada di halaman Kebijakan Privasi.',
  },
  {
    q: 'Bot tidak merespons di server saya. Kenapa?',
    a: 'Pastikan bot punya izin membaca dan mengirim pesan di channel tersebut, dan pastikan pesan kamu diawali prefix (nx, np, nb, nc). Coba ketik nxhelp untuk mengecek bot aktif. Kalau masih diam, hubungi kontak support di bawah.',
  },
  {
    q: 'Kenapa web ini memakai cookie?',
    a: 'Cookie yang kami pasang sendiri hanya untuk keperluan fungsional: menyimpan sesi login kamu supaya tidak perlu masuk Discord berulang kali, menjaga status NEXO Pass dan notifikasi tetap terbawa saat pindah halaman, serta mengunci keamanan 2FA panel admin. Kami TIDAK memakai analitik pelacak. Perlu diketahui: halaman publik menampilkan iklan dari Google AdSense, dan Google dapat memasang cookie-nya sendiri untuk menayangkan iklan yang relevan - itu diatur oleh kebijakan Google, bukan oleh kami. Detailnya ada di halaman Kebijakan Privasi.',
  },
  {
    q: 'Bagaimana jika saya ingin semua data game saya dihapus?',
    a: 'Tentu bisa! Kamu cukup gunakan tombol "Feedback & Laporan" di pojok kanan atas web ini, pilih jenis Laporan, berikan Discord ID kamu, dan sampaikan alasan kenapa ingin dihapus. Admin akan mereset seluruh data progres kamu secepatnya.',
  },
];

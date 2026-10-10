// ==========================================
// KONTEN PANDUAN NEXO (satu sumber kebenaran)
// ==========================================
// Dipakai oleh:
//   - /panduan           -> hub daftar panduan
//   - /panduan/[slug]    -> halaman panduan individual
//
// Semua konten ditulis orisinal (bukan salinan dari tempat lain) dan
// mencerminkan mekanik bot yang SEBENARNYA (kuota 24 jam bergulir, pembagian
// poin war 5%/1%/2%, dsb). Kalau mekanik bot berubah, update di sini.
//
// EMOJI: pakai NAMA dari registry emoji bot (web-emojis.json) - di-render
// sebagai <img> custom (bukan unicode) supaya konsisten dengan tampilan bot.
// Contoh nama valid: controller, book, goldcoin, swords, download3, castle.

export const PANDUAN = [
  {
    slug: 'cara-main',
    judul: 'Cara Main NEXO untuk Pemula',
    ringkas: 'Dari nol sampai main: undang bot, daftar otomatis, kenali perintah dasar, dan game pertama yang cocok buat pemula.',
    emoji: 'controller',
    menit: 7,
    sections: [
      {
        title: 'Undang bot ke server Discord kamu',
        body: [
          'NEXO berjalan sebagai bot Discord - artinya semua permainan terjadi di dalam server, tanpa perlu download aplikasi tambahan. Langkah pertamanya: undang bot NEXO ke server kamu lewat tombol undang di halaman utama situs ini. Kamu butuh izin "Manage Server" di server tersebut untuk melakukannya.',
          'Setelah bot masuk, dia akan muncul di daftar anggota server. Kalau bot tidak langsung online, tunggu beberapa detik - proses koneksi pertama biasanya memakan waktu 5-15 detik.',
        ],
      },
      {
        title: 'Daftar otomatis - nggak ada form',
        body: [
          'NEXO tidak punya proses pendaftaran yang ribet. Begitu kamu mengetik perintah pertamamu (misalnya nxdaily untuk klaim poin harian), akun kamu otomatis dibuat. Nggak ada email, nggak ada password, nggak ada verifikasi.',
          'Poin awalmu mulai dari nol. Kumpulkan lewat game solo, klaim harian, misi harian, atau menang di game multipemain.',
        ],
      },
      {
        title: 'Perintah dasar yang wajib kamu hafal',
        list: [
          'nxhelp - daftar lengkap semua perintah. Ini pintu masuk pertama yang harus kamu ketik.',
          'nxdaily (alias nxd) - klaim poin harian. Semakin rajin (streak panjang), hadiahnya semakin besar. Streak putus kalau kamu bolos lebih dari 48 jam.',
          'np [nama game] - main game solo. Contoh: np math, np trivia, np slot, np rpg.',
          'nb [nama game] [taruhan] - main game multipemain dengan taruhan. Contoh: nb blackjack 100.',
          'nc [nama game] - main game co-op bareng teman. Contoh: nc heal.',
          'nxlb - lihat papan peringkat pemain dan guild.',
        ],
      },
      {
        title: 'Game pertama yang cocok buat pemula',
        body: [
          'Kalau kamu baru mulai, coba np math dulu. Game ini paling sederhana: soal matematika yang kamu jawab dengan mengetik lewat tombol "Jawab Soal", waktunya 20-40 detik per soal tergantung tingkat kesulitan yang kamu pilih (ada tombol Bantuan kalau mentok). Menang atau kalah tetap dapat poin kecil, jadi nggak ada risiko.',
          'Setelah terbiasa, naik ke np trivia (pengetahuan umum), np hangman (tebak kata), atau np guess (tebak angka). Semua game solo ini gratis dimainkan dan nggak memotong poinmu kalau kalah.',
          'Kalau pengin tantangan sosial, coba game multipemain seperti nb blackjack atau nb monopoly. Di sini poin dipotong sebagai taruhan, tapi hadiahnya juga jauh lebih besar.',
        ],
      },
      {
        title: 'Batasan yang perlu kamu tahu',
        body: [
          'Setiap pemain punya kuota poin 24 jam bergulir. Artinya: total poin yang bisa kamu kumpulkan dari game dibatasi per 24 jam, dihitung bergulir - bukan reset tengah malam. Kalau kamu berhenti main selama beberapa jam, kuotamu pulih bertahap.',
          'Kuota ini menjaga ekonomi tetap sehat: pemain baru nggak ketinggalan jauh, dan harga item di toko tetap masuk akal. Kalau kamu punya NEXO Pass, kuota harianmu naik 5.000 poin.',
          'Satu orang satu akun. Akun ganda untuk farming hadiah dilarang dan bisa kena sanksi.',
        ],
      },
      {
        title: 'Langkah selanjutnya',
        body: [
          'Setelah kamu nyaman dengan game solo, baca panduan cara dapat poin cepat untuk strategi ekonomi yang lebih efisien, atau panduan Guild War kalau kamu tertarik membangun tim bersama teman-teman server.',
        ],
      },
    ],
  },
  {
    slug: 'cara-dapat-poin',
    judul: 'Cara Dapat Poin Cepat & Benar',
    ringkas: 'Semua sumber poin di NEXO, strategi kuota 24 jam bergulir, dan kesalahan umum yang bikin pemain baru ketinggalan.',
    emoji: 'goldcoin',
    menit: 8,
    sections: [
      {
        title: 'Semua sumber poin di NEXO',
        list: [
          'Klaim harian (nxdaily): poin gratis setiap 24 jam, jumlahnya naik mengikuti streak. Bonus +10% untuk pemegang NEXO Pass.',
          'Misi harian: 3 misi yang berganti tiap hari (main game tertentu, capai target, dsb). Selesai semua misi dapat hadiah item random. Pemegang NEXO Pass dapat 1 slot misi ekstra.',
          'Game solo (np): poin kecil tapi tanpa risiko. Cocok untuk mengisi kuota dengan santai.',
          'Game multipemain (nb): hadiah besar dari pot taruhan. Menang = dapat poin lawan, kalah = poinmu hilang.',
          'Game co-op (nc): menang bersama-sama, dapat bersama-sama. Setiap anggota tim dapat reward penuh sendiri-sendiri (tidak dipotong), dengan bonus ekstra dari sisa HP.',
          'Guild War: bonus persentase untuk SEMUA anggota guild yang berpartisipasi, menang atau kalah.',
          'Event dan giveaway: kode promo yang ditukar lewat menu Redeem di web.',
        ],
      },
      {
        title: 'Pahami kuota 24 jam bergulir',
        body: [
          'Ini konsep paling penting yang sering disalahpahami pemain baru. NEXO TIDAK mereset kuota poin tiap tengah malam. Sebaliknya, setiap poin yang kamu dapat dicatat waktunya, dan kuotamu dihitung dari total 24 jam terakhir.',
          'Efeknya: kalau kamu main 10.000 poin jam 9 pagi, kuota itu baru "pulih" jam 9 pagi besoknya - bukan jam 00:00. Jadi cara paling efisien adalah main di jam yang konsisten setiap hari, bukan menumpuk semuanya sekaligus.',
          'Cek sisa kuotamu kapan saja dengan nxdaily - perintah itu menampilkan berapa poin yang sudah kamu pakai dan kapan kuotanya pulih.',
        ],
      },
      {
        title: 'Strategi yang benar-benar bekerja',
        list: [
          'Jangan lewatkan klaim harian. Streak 15 hari berturut-turut memberi bonus yang jauh lebih besar daripada main game ekstra. Putus streak = rugi besar.',
          'Selesaikan misi harian setiap hari. Hadiahnya (item random) sering lebih bernilai daripada poinnya sendiri.',
          'Bermain di jam yang konsisten. Karena kuota bergulir, main di jam yang sama setiap hari membuat kuota selalu segar saat kamu main.',
          'Game co-op lebih aman daripada multipemain kalau kamu belum berpengalaman - kalah pun tetap dapat poin hiburan, dan modal tidak hilang.',
          'Pakai item toko dengan tepat. Item seperti Daily Boost dan Coin Magnet memberi efek yang nilainya melebihi harganya kalau dipakai saat sesi panjang.',
        ],
      },
      {
        title: 'Kesalahan umum pemain baru',
        body: [
          'Taruhan terlalu besar di awal. Poin multipemain dipotong sebagai taruhan - kalau kamu taruh 90% poinmu dan kalah, kamu bangkrut. Aturan praktis: jangan taruh lebih dari 10% total poinmu dalam satu game.',
          'Mengabaikan item toko. Beberapa item (misalnya Daily Boost dan Coin Magnet) memberi efek yang nilainya jauh melebihi harganya kalau dipakai dengan benar.',
          'Grinding lewat batas kuota. Setelah kuota habis, game tetap bisa dimainkan tapi poinnya nol. Lebih baik berhenti dan kembali setelah kuota pulih.',
          'Pinjam di bank tanpa rencana bayar. Bank NEXO memberi pinjaman dengan bunga - ada tenggat waktu dan penagih otomatis. Pinjam hanya kalau kamu yakin bisa melunasi.',
        ],
      },
      {
        title: 'Peran NEXO Pass',
        body: [
          'NEXO Pass (Rp 20.000 per bulan) menambah kuota harian 5.000 poin, memberi inventori unlimited, bunga pinjaman bank -10%, 1 slot misi ekstra, dan akses game beta. Pass TIDAK menjual kemenangan - hasil game tetap soal keberuntungan dan strategi.',
          'Kalau kamu main NEXO setiap hari, pass ini menghemat waktu karena kuotamu bertahan lebih lama. Kalau kamu main santai sesekali, main gratis sudah cukup menyenangkan.',
        ],
      },
    ],
  },
  {
    slug: 'guild-war',
    judul: 'Panduan Guild War',
    ringkas: 'Cara membangun guild, alur perang, pilihan aksi tiap giliran, dan pembagian poin menang/kalah yang transparan.',
    emoji: 'swords',
    menit: 9,
    sections: [
      {
        title: 'Apa itu guild dan kenapa penting',
        body: [
          'Guild adalah kelompok pemain (maksimal 10 anggota) yang punya identitas sendiri: nama, emoji, bio, dan papan peringkat. Guild naik level dari kemenangan war, dan level itu menentukan posisi guild di papan peringkat.',
          'Bergabung dengan guild memberi kamu tiga hal: teman main tetap, bonus poin dari war, dan target jangka panjang (naikkan level guild).',
        ],
      },
      {
        title: 'Cara membuat dan bergabung guild',
        list: [
          'Buat guild: ketik nxg lalu pilih menu buat guild. Kamu butuh poin sebagai biaya pembuatan.',
          'Bergabung: cari guild lewat nxlb (papan peringkat), lalu ajukan request ke owner/admin-nya. Kamu juga bisa diundang langsung.',
          'Peran di guild: Owner (pendiri, akses penuh), Admin (bisa ACC member, kick), Member (ikut war dan dapat bonus).',
        ],
      },
      {
        title: 'Alur Guild War dari awal sampai akhir',
        body: [
          'War berjalan dalam tiga fase: Matchmaking, Lobby (Join & Ready), lalu Pertandingan. Di fase matchmaking, guild kamu antre mencari lawan (maksimal 60 detik menunggu lawan). Begitu lawan ditemukan, bot membuat thread publik untuk masing-masing guild - anggota masuk lewat thread itu, tekan Join lalu Ready.',
          'Pertandingan dimulai 10 detik setelah kedua tim menekan Ready. Setiap pemain tampil dengan HP (nyawa) dan Mana. Permainan berjalan bergiliran: A, B, A, B, sampai satu tim kehabisan pemain.',
          'Kalau kamu AFK 45 detik saat giliranmu, kamu otomatis tereliminasi (KO) supaya permainan tidak macet. Jadi pastikan kamu siap ketika giliranmu tiba.',
        ],
      },
      {
        title: 'Empat aksi tiap giliran',
        list: [
          'Serang - aksi dasar, memberi damage ke target pilihanmu.',
          'Bertahan - mengurangi damage yang kamu terima sampai giliran berikutnya.',
          'Sembuhkan - memulihkan HP kamu sendiri, berguna kalau nyawamu kritis.',
          'Ultimate - hanya bisa dipakai kalau Mana sudah penuh (terkumpul dari giliran-giliran sebelumnya). Damage-nya besar, jadi simpan untuk momen yang tepat.',
        ],
      },
      {
        title: 'Pembagian poin menang dan kalah (transparan)',
        body: [
          'Ini bagian yang paling sering ditanyakan, jadi kami tulis lengkap. Bonus dihitung dari total poin SETIAP anggota guild, dengan batas maksimal 25.000 poin per orang.',
        ],
        list: [
          'Guild MENANG: setiap anggota dapat bonus +5% dari total poinnya (maks 25.000 poin per orang).',
          'Guild KALAH: setiap anggota tetap dapat bonus hiburan +1% dari total poinnya (maks 25.000 poin per orang).',
          'SERI: kedua guild dapat bonus partisipasi +2% dari total poin masing-masing anggota.',
          'Bonus masuk ke SEMUA anggota guild (bukan cuma yang ikut bertanding), selama guild kamu terlibat di war tersebut.',
        ],
      },
      {
        title: 'Strategi menang war',
        list: [
          'Komposisi tim seimbang lebih baik daripada satu pemain kuat sendirian - karena ultimate butuh waktu terkumpul, dan target bisa berpindah.',
          'Fokuskan serangan ke satu musuh sampai KO. Musuh yang KO tidak bisa balas, jadi tim lawan makin cepat habis.',
          'Simpan ultimate untuk menghabisi musuh yang nyawanya sudah rendah, bukan dipakai di awal.',
          'Pastikan semua anggota siap di thread sebelum war mulai - tim yang tidak lengkap hampir pasti kalah.',
          'Thread war dibersihkan otomatis setelah selesai. Hasil akhir (termasuk pembagian poin) dikirim ke channel utama masing-masing guild.',
        ],
      },
    ],
  },
  {
    slug: 'nexo-pass',
    judul: 'Panduan NEXO Pass',
    ringkas: 'Apa yang kamu dapat dari NEXO Pass, berapa harganya, cara belinya, dan kenapa Pass tidak menjual kemenangan.',
    emoji: 'download3',
    menit: 6,
    sections: [
      {
        title: 'NEXO Pass itu apa',
        body: [
          'NEXO Pass adalah langganan opsional untuk pemain yang ingin kenyamanan ekstra. Harga dasarnya Rp 20.000 per bulan, dan kamu bisa memilih durasi pembelian 1 sampai 12 bulan sekaligus saat checkout.',
          'Penting: Pass ini TIDAK membuat kamu lebih kuat di game. Kemenangan di NEXO tetap ditentukan keberuntungan dan strategi, bukan status langganan. Yang kamu beli adalah kenyamanan dan akses.',
        ],
      },
      {
        title: 'Semua keunggulan NEXO Pass',
        list: [
          'Inventori unlimited - simpan item sebanyak apa pun. Pemain gratis dibatasi 5 item per jenis.',
          'Kuota harian +5.000 poin - limit poin 24 jam bergulirmu naik di atas bonus streak.',
          'Klaim harian +10% - reward nxdaily selalu dibulatkan 10% lebih besar.',
          'Bunga pinjaman -10% - pinjam poin di bank lebih murah.',
          '+1 slot misi harian - 4 misi per hari (biasanya 3), lebih banyak poin yang bisa dicairkan.',
          'Prioritas render - papan game gambar muncul lebih cepat saat antrean ramai, plus cooldown render setengah.',
          'Akses game beta - main game baru sebelum rilis lewat nxtest, plus matchmaking khusus premium.',
          'Profil web premium - grafik riwayat dan badge khusus di situs ini.',
        ],
      },
      {
        title: 'Cara membeli NEXO Pass',
        body: [
          'Pembelian dilakukan lewat halaman Premium di situs ini. Pilih durasi (1-12 bulan), scan QRIS dengan aplikasi e-wallet atau m-banking apa pun (GoPay, OVO, DANA, ShopeePay, atau mobile banking), lalu unggah bukti transfernya.',
          'Admin memverifikasi bukti transfer secara manual dengan mencocokkan mutasi rekening. Jam prosesnya 08.00-22.00 WIB; transfer di luar jam itu tetap aman dan diproses keesokan harinya.',
          'Setelah disetujui, Pass langsung aktif di akun Discord-mu - tidak ada kode yang perlu dimasukkan. Masa aktifnya muncul di profil Discord (nxpremium) dan di halaman Profil Saya di web.',
        ],
      },
      {
        title: 'Aturan penting pembelian',
        list: [
          'Bukti transfer harus asli. Bukti palsu, hasil suntingan, atau milik orang lain adalah penipuan dan berakibat sanksi hingga ban permanen.',
          'Nominal harus sesuai. Periksa totalnya di halaman checkout - nominal berubah mengikuti durasi yang kamu pilih.',
          'Satu pesanan diproses satu per satu. Kalau kamu masih punya pesanan pending, selesaikan dulu sebelum membuat pesanan baru.',
          'Pass tidak bisa diperpanjang otomatis. Setelah masa aktif berakhir, kamu bisa membeli lagi kapan saja.',
        ],
      },
      {
        title: 'Pertanyaan yang sering muncul',
        body: [
          'Kalau aku berhenti main, apakah Pass-ku hangus? Tidak. Pass tetap aktif sampai masa berlakunya habis, dan semua keunggulannya kembali begitu kamu main lagi.',
          'Apakah bisa refund? Karena ini produk digital yang langsung aktif, pembelian yang sudah diproses tidak bisa dibatalkan. Pastikan kamu yakin sebelum membayar.',
          'Apa yang terjadi kalau Pass habis di tengah bulan? Kamu kembali ke status pemain gratis - semua poin, item, dan progresmu tetap aman, hanya keunggulan ekstranya yang nonaktif.',
        ],
      },
    ],
  },
];

/** Cari satu panduan berdasarkan slug. */
export function ambilPanduan(slug) {
  return PANDUAN.find((p) => p.slug === slug) || null;
}

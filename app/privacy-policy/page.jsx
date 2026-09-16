import { METADATA } from '../lib/privacy-content';
import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Reveal from '../components/Reveal';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { SUPPORT_INVITE } from '../lib/site';

export const metadata = METADATA;

const SECTIONS = [
  {
    title: 'Ringkasan singkat',
    body: [
      'Kalau tidak mau membaca semuanya, ini intinya. Kami hanya menyimpan ID Discord, username, dan progres game kamu seperti poin, level, item, dan guild. Tidak ada email, tidak ada isi chat, dan datamu tidak pernah dibagikan ke siapa pun.',
    ],
  },
  {
    title: 'Data apa yang kami simpan, dan untuk apa?',
    body: [
      'Supaya game berjalan, bot perlu tahu siapa kamu di Discord. Ini daftar lengkapnya.',
    ],
    table: [
      ['Data', 'Kenapa disimpan', 'Contohnya'],
      ['Discord User ID', 'Mengenali akunmu supaya poin, item, dan progres tidak tertukar dengan pemain lain', 'Angka panjang unik seperti 8363...'],
      ['Discord Username', 'Menampilkan nama kamu di leaderboard, lobby game, dan papan peringkat', 'Nama tampilan Discord kamu'],
      ['Progres game', 'Menyimpan poin, menang kalah, streak, level, progres misi, dan keanggotaan guild', '2.500 poin, streak 7 hari, level 12'],
      ['Aktivitas ekonomi', 'Mencatat saldo, pembelian item di shop, pinjaman bank, dan transfer antar pemain', 'Beli item 50.000 poin'],
      ['ID server', 'Membuat leaderboard dan pengumuman berlaku per server', 'ID server tempat bot aktif'],
    ],
    after: 'Yang tidak pernah kami simpan adalah email, nomor telepon, nama asli, alamat IP untuk pelacakan, isi pesan chat biasa, dan percakapan DM.',
  },
  {
    title: 'Apakah bot membaca chat kami?',
    body: [
      'Tidak membaca obrolan biasa. Bot hanya bereaksi pada pesan yang diawali perintahnya, seperti nx, np, nb, nc, atau nxadmin.',
      'Contohnya saat kamu mengetik "np slot", bot membaca dua kata itu untuk menjalankan game slot. Pesannya diproses sesaat di memori lalu dibuang. Kalau kamu mengetik "makan siang yuk", bot sama sekali tidak memprosesnya.',
    ],
  },
  {
    title: 'DM dari bot, kapan dan kenapa',
    body: [
      'Bot bisa mengirim pesan langsung ke Discord kamu, tapi hanya berupa notifikasi sistem searah, bukan percakapan. Isinya terbatas pada hal yang menyangkut akun kamu, contohnya status pembelian NEXOPASS, kode promo yang berhasil diklaim, atau pemberitahuan sanksi beserta alasannya.',
      'Bot tidak pernah membaca atau menyimpan balasan DM kamu. Pesan yang dikirim bot juga tidak disimpan sebagai riwayat percakapan. Begitu terkirim, selesai.',
      'DM hanya berisi informasi akun kamu sendiri, dan tidak pernah dibagikan ke member server atau pihak lain. Kalau kamu memilih menutup DM dari anggota server di pengaturan Discord, notifikasi sanksi tetap muncul saat kamu memakai bot di server.',
    ],
  },
  {
    title: 'Di mana data disimpan, dan seberapa aman?',
    body: [
      'Data disimpan dalam database SQLite yang terenkripsi standar AES-256 di server pribadi kami. File backup juga dienkripsi password sebelum dikirim ke Google Drive milik kami.',
      'Kami tidak memakai layanan analitik pihak ketiga, tidak memasang iklan, dan tidak membagikan data ke siapa pun.',
    ],
  },
  {
    title: 'Untuk apa data dipakai?',
    list: [
      'Menyimpan progres game kamu antar sesi main.',
      'Menghitung reward, menjalankan shop dan bank, menampilkan leaderboard.',
      'Mengelola guild dan misi harian.',
      'Menampilkan profil, riwayat game, dan status premium kamu saat login di web ini.',
    ],
    after: 'Kami tidak menjual, menyewakan, atau membagikan data kamu ke siapa pun. Data kamu juga tidak dipakai untuk melatih model AI atau machine learning.',
  },
  {
    title: 'Berapa lama data disimpan?',
    list: [
      'Data progres disimpan selama bot aktif di server kamu dan kamu masih memainkannya, supaya poin, level, dan item tidak hilang saat bot restart.',
      'Pemilik server bisa mengeluarkan bot dari servernya kapan saja.',
      'Kalau kamu ingin berhenti main dan menghapus semua data game kamu dari sistem kami, tinggal kirim pesan lewat tombol Laporan dan Saran di pojok kanan atas website. Cantumkan Discord ID dan alasan singkatnya, data kamu akan kami reset total secepat mungkin.',
    ],
  },
  {
    title: 'Bagaimana dengan anak-anak?',
    body: [
      'Bot boleh dipakai siapa saja di Discord, tapi sesuai Ketentuan Layanan Discord, pengguna harus berusia minimal 13 tahun atau usia minimum yang diwajibkan negaramu.',
    ],
  },
  {
    title: 'Data apa yang dipakai saat saya login di situs ini?',
    body: [
      'Saat menekan tombol "Login dengan Discord", kami menerima ID, username, dan avatar Discord kamu. Izin yang diminta hanya identitas dasar, tidak lebih. Data itu dipakai untuk menautkan akun web dengan progres game kamu di bot, bukan membuat akun baru.',
      'Kami tidak pernah melihat password Discord kamu, dan login admin situs memakai jalur terpisah yang tidak ada hubungannya dengan akun member.',
    ],
  },
];

export default async function PrivacyPolicyPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <main className="relative mx-auto max-w-3xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <Reveal className="relative">
          <h1 className="mt-3 font-display text-3xl tracking-tight text-ink md:text-4xl">
            Kebijakan Privasi NEXO Games.
          </h1>
          <div className="accent-bar mt-4" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink-muted">Terakhir diperbarui 14 September 2026</p>
          <p className="mt-6 leading-relaxed text-ink-muted">
            <strong className="text-ink">NEXO Games</strong> adalah bot game Discord yang
            menyediakan mini-game, ekonomi poin virtual, dan fitur komunitas di dalam server
            Discord. Kebijakan ini menjelaskan dengan bahasa sederhana data apa yang kami
            simpan, kenapa disimpan, dan hak kamu atas data itu. Dengan menggunakan Bot,
            kamu menyetujui kebijakan ini.
          </p>
        </Reveal>

        <div className="relative mt-12 space-y-10">
          {SECTIONS.map((s, i) => (
            <Reveal key={s.title} delay={i * 40}>
              <section>
                <h2 className="font-display text-xl tracking-tight text-ink">{s.title}</h2>
                {s.body && (
                  <div className="mt-3 space-y-3">
                    {s.body.map((p) => (
                      <p key={p.slice(0, 32)} className="leading-relaxed text-ink-muted">{p}</p>
                    ))}
                  </div>
                )}
                {s.table && (
                  <div className="nx-card mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border-soft text-xs uppercase tracking-wider text-ink-muted">
                          {s.table[0].map((h) => (
                            <th key={h} scope="col" className="px-4 py-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.table.slice(1).map(([a, b, c]) => (
                          <tr key={a} className="border-b border-border-soft/60 last:border-0 align-top">
                            <td className="px-4 py-3 font-semibold text-ink">{a}</td>
                            <td className="px-4 py-3 text-ink-muted">{b}</td>
                            {c !== undefined && (
                              <td className="px-4 py-3 font-mono text-xs text-ink-muted">{c}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {s.list && (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-muted">
                    {s.list.map((li) => (
                      <li key={li.slice(0, 32)}>{li}</li>
                    ))}
                  </ul>
                )}
                {s.after && (
                  <p className="nx-well mt-3 px-4 py-3 text-sm font-semibold text-ink">
                    {s.after}
                  </p>
                )}
              </section>
            </Reveal>
          ))}
        </div>

        <Reveal className="relative mt-14 space-y-6">
          <section>
            <h2 className="font-display text-xl tracking-tight text-ink">Ada Pertanyaan?</h2>
            <div className="mt-3 space-y-3">
              <p className="leading-relaxed text-ink-muted">
                Kalau ada yang ingin ditanyakan soal cara kami menyimpan dan melindungi data, atau ada pertanyaan yang belum terjawab di halaman ini, sapa admin kami langsung di server support Discord NEXO Games.
              </p>
            </div>
          </section>
          <a
            href={SUPPORT_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex cursor-pointer"
          >
            Gabung Server Support
          </a>
        </Reveal>
      </main>
      <Footer />
    </>
  );
}

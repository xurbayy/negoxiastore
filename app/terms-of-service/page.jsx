import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Reveal from '../components/Reveal';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { SUPPORT_INVITE } from '../lib/site';
import { TERMS_METADATA } from '../lib/legal-content';

export const metadata = TERMS_METADATA;
export const dynamic = 'force-dynamic';

const SECTIONS = [
  {
    title: 'Intinya.',
    body: [
      'NEXO Games adalah game gratis di Discord dengan poin virtual. Main jujur, nikmati, selesai. Halaman ini cuma memastikan tidak ada salah paham antara pemain, bot, dan pembuatnya.',
    ],
  },
  {
    title: 'Poin itu virtual, bukan uang.',
    body: [
      'Semua poin, item, dan gelar di NEXO Games murni dalam-game: tidak punya nilai uang asli, tidak bisa ditukar jadi rupiah, tidak bisa dibeli atau dijual ke pemain lain di luar mekanisme game. Transaksi apa pun di luar game yang mengatasnamakan poin NEXO bukan tanggung jawab kami.',
    ],
  },
  {
    title: 'Yang boleh dan tidak boleh (Aturan Sanksi).',
    list: [
      'Satu orang, satu akun. Membuat akun ganda untuk farming hadiah, klaim promo berlipat, atau mengelabui matchmaking sangat dilarang.',
      'Sanksi Timeout (Hukuman Sementara): Kamu akan di-timeout jika melakukan SPAM command secara brutal yang memberatkan bot, atau dengan sengaja mengganggu jalannya game pemain lain.',
      'Sanksi Banned (Blokir Permanen): Kamu akan di-ban permanen jika terbukti melakukan penipuan (scamming) ke player lain, mengeksploitasi bug demi keuntungan pribadi tanpa melapor, atau melakukan toxic SARA/Doxing parah di ekosistem NEXO.',
      'Sanksi Reset Data Total: Jika pelanggaranmu sangat merugikan ekonomi game (misal sengaja menduplikasi uang miliaran via eksploitasi/script otomatis/self-bot), maka seluruh progres, barang, dan hartamu akan direset menjadi nol seperti player baru.',
    ],
  },
  {
    title: 'NEXO Pass dan pembayaran manual.',
    body: [
      'NEXO Pass adalah langganan opsional Rp 20.000/bulan untuk kenyamanan ekstra (inventori unlimited, kuota harian tambahan, akses beta). Pass tidak menjual kekuatan dalam game (no pay-to-win): hasil game tetap soal keberuntungan dan strategi.',
      'Pembayaran dilakukan secara manual via QRIS (GoPay, OVO, Dana, m-Banking). Setelah kamu transfer dan meng-upload bukti pembayaran, admin akan memvalidasi mutasi dan mengaktifkan Pass-mu.',
      'Jam Operasional proses pembayaran adalah pukul 08:00 - 22:00 WIB. Pembayaran di jam ini akan diproses dengan cepat. Jika kamu transfer di luar jam tersebut, pesanan kemungkinan akan diproses keesokan harinya.',
      'Pastikan kamu melampirkan screenshot bukti transfer yang asli. Bukti transfer palsu atau tidak sesuai dengan mutasi e-wallet Admin akan otomatis ditolak.',
      'Semua pembelian sifatnya final dan tidak ada pengembalian dana (no refund). KECUALI kalau ada murni kesalahan sistem (misal: uang sudah masuk ke mutasi tapi pass mati sebelum waktunya). Kalau terjadi kendala, langsung hubungi admin lewat Discord.',
    ],
  },
  {
    title: 'Kode promo dan event.',
    body: [
      'Kode promo punya kuota dan masa berlaku. Satu klaim per orang per kode kecuali dinyatakan lain. Kami berhak mencabut kode yang bocor/disalahgunakan, dan hadiah event bisa disesuaikan kalau ada kekeliruan pengumuman.',
    ],
  },
  {
    title: 'Bot bisa berubah, dan itu wajar.',
    body: [
      'Fitur, harga item, kuota, dan komposisi game bisa kami ubah kapan saja demi keseimbangan. Backup dan maintenance bisa membuat bot sementara offline; data pemain tetap aman. Kami tidak menjamin uptime 24/7, tapi kami jamin tidak ada yang sengaja menghapus progres pemain.',
    ],
  },
  {
    title: 'Batas tanggung jawab.',
    body: [
      'NEXO Games disediakan apa adanya. Kerugian tidak langsung akibat penggunaan bot (misal: sesi gaming terpotong karena Discord down) berada di luar tanggung jawab kami. Sengketa diselesaikan baik-baik lewat kanal support.',
    ],
  },
  {
    title: 'Pertanyaan atau laporan pelanggaran?',
    body: [
      'Pakai tombol Feedback di web, atau langsung ke server support Discord kami. Yang lapor bug dengan itikad baik justru kami hargai.',
    ],
  },
];

export default async function TermsPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <main className="relative mx-auto max-w-3xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <Reveal className="relative">
          <h1 className="mt-3 font-display text-3xl tracking-tight text-ink md:text-4xl">
            Ketentuan Layanan NEXO Games.
          </h1>
          <div className="accent-bar mt-4" aria-hidden="true" />
          <p className="mt-4 text-sm text-ink-muted">Berlaku sejak: 13 September 2026</p>
          <p className="mt-6 leading-relaxed text-ink-muted">
            Dengan memainkan NEXO Games di Discord atau memakai situs ini, kamu dianggap
            membaca dan menyetujui ketentuan di bawah. Bahasanya sengaja santai - kalau ada
            bagian yang belum jelas, tanyakan di server support.
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
                {s.list && (
                  <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-ink-muted">
                    {s.list.map((l) => (
                      <li key={l.slice(0, 32)}>{l}</li>
                    ))}
                  </ul>
                )}
              </section>
            </Reveal>
          ))}
          <Reveal>
            <a
              href={SUPPORT_INVITE}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex cursor-pointer"
            >
              Gabung Server Support
            </a>
          </Reveal>
        </div>
      </main>
      <Footer />
    </>
  );
}

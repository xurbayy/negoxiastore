import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Link from 'next/link';
import Reveal from '../components/Reveal';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { SUPPORT_INVITE } from '../lib/site';

// ==========================================
// /tentang - Tentang NEXO Games
// ==========================================
// Halaman EDITORIAL (bukan alat interaktif) - dibuat untuk memperkuat
// kualitas situs di mata Google AdSense ("konten tanpa manfaat" = keluhan
// reviewer karena situs hanya berisi alat). Isi: siapa di balik NEXO,
// kenapa dibuat, cara kerjanya, apa yang membedakannya dari bot lain.
//
// Halaman ini PUBLIK (tanpa login) supaya Googlebot bisa membacanya.
export const metadata = {
  title: 'Tentang NEXO Games',
  description:
    'NEXO Games adalah bot Discord game Indonesia dengan 28 mini-game, ekonomi poin, guild war, dan papan peringkat. Kenali siapa di baliknya dan bagaimana cara kerjanya.',
  alternates: { canonical: '/tentang' },
};

const SECTIONS = [
  {
    title: 'NEXO itu apa?',
    body: [
      'NEXO Games adalah bot Discord yang mengubah server biasa jadi tempat nongkrong yang rame. Di dalamnya ada 28 mini-game yang bisa dimainkan langsung dari chat: kuis matematika, trivia, hangman, tebak angka, slot, blackjack, sampai game multipemain seperti Monopoly dan Snake & Ladder.',
      'Semua game terhubung ke satu ekonomi poin. Poin yang kamu kumpulkan bisa dipakai untuk belanja item di toko, dipertaruhkan di game multipemain, atau dipinjamkan lewat Bank NEXO. Ada juga sistem guild: kumpulkan teman, naikkan level guild, dan adu kekuatan di Guild War.',
    ],
  },
  {
    title: 'Kenapa NEXO dibuat?',
    body: [
      'NEXO awalnya dibuat karena kami sendiri sering main di server Discord yang isinya cuma bot musik dan bot moderasi. Seru, tapi lama-lama sepi. Kami pengin bot yang bikin orang balik lagi bukan karena notifikasi, tapi karena pengin main sama teman-teman.',
      'Jadi kami bangun NEXO dari nol: game yang cepat dimengerti (nggak perlu baca manual 20 halaman), ekonomi yang adil (bukan sekadar angka yang naik tiap hari), dan sistem sosial (guild, war, papan peringkat) supaya ada cerita yang dibawa pulang ke server.',
      'NEXO dikembangkan oleh xurbaybase, studio kecil yang fokus ke alat-alat seru untuk komunitas Discord Indonesia. Semua dikembangkan sambil mendengarkan masukan pemain lewat server support kami.',
    ],
  },
  {
    title: 'Cara kerja NEXO',
    body: [
      'Kamu nggak perlu download apa pun. Undang bot NEXO ke server Discord kamu, ketik nxhelp, dan semua menu langsung terbuka. Setiap pemain punya akun otomatis begitu dia ikut main - nggak ada proses pendaftaran yang ribet.',
      'Untuk yang pengin lihat data lebih dalam, situs ini menampilkan papan peringkat live, daftar server komunitas, katalog toko, dan profil pemain. Datanya diambil langsung dari database bot, jadi yang kamu lihat di web selalu sama dengan yang ada di Discord.',
      'Botnya sendiri berjalan 24 jam dengan pemantauan otomatis. Kalau ada gangguan, sistem pemulihan kami bekerja sendiri: game yang terpotong karena restart dikembalikan poinnya, dan pemain yang nyangkut dibebaskan otomatis setelah beberapa menit.',
    ],
  },
  {
    title: 'Apa bedanya NEXO dengan bot game lain?',
    list: [
      'Ekonomi yang dirancang anti-inflasi. Ada kuota poin bergulir 24 jam per pemain, jadi kamu nggak bisa grind tanpa batas dan harga item tetap masuk akal untuk pemain baru.',
      'Guild War beneran strategi, bukan cuma angka lebih besar. Tiap pemain pilih aksi (serang, bertahan, sembuhkan, ultimate) bergiliran - kekompakan tim menentukan hasilnya.',
      'NEXO Pass opsional dan jujur. Langganan Rp 20.000 per bulan memberi kenyamanan (inventori unlimited, kuota tambahan, akses game beta), tapi TIDAK menjual kekuatan dalam game. Hasil game tetap soal keberuntungan dan strategi.',
      'Transparan soal data. Kebijakan privasi dan ketentuan layanan ditulis dengan bahasa yang bisa dimengerti manusia, bukan cuma formalitas legal.',
    ],
  },
  {
    title: 'Siapa yang cocok main NEXO?',
    body: [
      'Server komunitas yang pengin ada kegiatan rutin tanpa harus bikin event manual. Server gaming yang pengin ada distraksi ringan di antara sesi main. Server pertemanan yang cuma pengin rame bareng. NEXO cocok untuk semua itu.',
      'Kalau kamu punya server Discord dan pengin coba, tinggal undang botnya. Kalau kamu pemain yang pengin tahu dulu sebelum masuk, jelajahi halaman panduan kami atau lihat papan peringkat untuk membayangkan gamenya.',
    ],
  },
  {
    title: 'Ada pertanyaan atau masukan?',
    body: [
      'Kami selalu terbuka. Ada tombol Feedback di situs ini untuk laporan bug atau saran, dan server support Discord kami siap menerima masukan yang lebih panjang. Setiap laporan dibaca, dan yang paling sering diminta biasanya masuk ke rilis berikutnya.',
    ],
  },
];

export default async function TentangPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <main className="relative mx-auto max-w-3xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <Reveal className="relative">
          <h1 className="mt-3 font-display text-3xl tracking-tight text-ink md:text-4xl">
            Tentang NEXO Games.
          </h1>
          <div className="accent-bar mt-4" aria-hidden="true" />
          <p className="mt-6 leading-relaxed text-ink-muted">
            Bot Discord game buatan xurbaybase: 28 mini-game, ekonomi poin,
            guild war, dan papan peringkat - semua langsung dari chat Discord.
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
            <div className="flex flex-wrap gap-3">
              <a
                href={SUPPORT_INVITE}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary inline-flex cursor-pointer"
              >
                Gabung Server Support
              </a>
              <Link href="/panduan" className="btn-secondary inline-flex cursor-pointer">
                Baca Panduan Main
              </Link>
            </div>
          </Reveal>
        </div>
      </main>
      <Footer />
    </>
  );
}

import { getSession } from '../lib/session';
import { userHasPremium } from '../lib/snapshot';
import Reveal from '../components/Reveal';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import EmojiReg from '../components/EmojiReg';
import { PANDUAN } from '../lib/panduan-content';

// ==========================================
// /panduan - Hub daftar panduan NEXO Games
// ==========================================
// Halaman editorial PUBLIK (tanpa login) yang mengumpulkan semua panduan.
// Dibuat untuk memperkuat kualitas situs (AdSense "konten tanpa manfaat").
export const metadata = {
  title: 'Panduan Main NEXO Games',
  description:
    'Kumpulan panduan NEXO Games: cara main untuk pemula, strategi dapat poin cepat, panduan Guild War lengkap dengan pembagian poin, dan penjelasan NEXO Pass.',
  alternates: { canonical: '/panduan' },
};

export default async function PanduanPage() {
  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;
  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <main className="relative mx-auto max-w-3xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />
        <Reveal className="relative">
          <h1 className="mt-3 font-display text-3xl tracking-tight text-ink md:text-4xl">
            Panduan NEXO Games.
          </h1>
          <div className="accent-bar mt-4" aria-hidden="true" />
          <p className="mt-6 leading-relaxed text-ink-muted">
            Dari cara main pertama kali sampai strategi Guild War - semua
            ditulis dengan bahasa yang bisa dimengerti manusia, bukan manual
            teknis.
          </p>
        </Reveal>

        <div className="relative mt-10 grid gap-4 sm:grid-cols-2">
          {PANDUAN.map((p, i) => (
            <Reveal key={p.slug} delay={i * 50}>
              <a
                href={`/panduan/${p.slug}`}
                className="nx-card flex h-full flex-col gap-2 px-5 py-5 transition hover:border-accent/50 cursor-pointer"
              >
                <EmojiReg nama={p.emoji} size={28} />
                <span className="font-display text-lg text-ink">{p.judul}</span>
                <span className="text-sm leading-relaxed text-ink-muted">{p.ringkas}</span>
                <span className="mt-auto pt-2 text-xs text-ink-faint">Baca &middot; sekitar {p.menit} menit</span>
              </a>
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="mt-10 text-sm leading-relaxed text-ink-muted">
            Panduan ini diperbarui mengikuti perubahan mekanik bot. Kalau ada
            bagian yang terasa tidak cocok dengan pengalamanmu di Discord,
            lapor lewat tombol Feedback - kami baca semuanya.
          </p>
        </Reveal>
      </main>
      <Footer />
    </>
  );
}

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '../../lib/session';
import { userHasPremium } from '../../lib/snapshot';
import Reveal from '../../components/Reveal';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import EmojiReg from '../../components/EmojiReg';
import { PANDUAN, ambilPanduan } from '../../lib/panduan-content';

// ==========================================
// /panduan/[slug] - Halaman panduan individual
// ==========================================
// generateStaticParams: halaman di-render statis saat build (cepat + SEO).
// generateMetadata: title/description per panduan dari data konten.
export function generateStaticParams() {
  return PANDUAN.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = ambilPanduan(slug);
  if (!p) return {};
  return {
    title: `${p.judul} - Panduan NEXO`,
    description: p.ringkas,
    alternates: { canonical: `/panduan/${p.slug}` },
  };
}

export default async function PanduanDetailPage({ params }) {
  const { slug } = await params;
  const p = ambilPanduan(slug);
  if (!p) notFound();

  const session = await getSession();
  const premiumActive = session ? await userHasPremium(session.discordId) : false;

  // Panduan lain untuk bagian "baca juga" (semua kecuali yang ini).
  const lainnya = PANDUAN.filter((x) => x.slug !== p.slug);

  return (
    <>
      <Navbar session={session} premiumActive={premiumActive} />
      <main className="relative mx-auto max-w-3xl px-5 pb-24 pt-32">
        <div className="bg-grid absolute inset-x-0 top-0 h-72" aria-hidden="true" />

        {/* Breadcrumb sederhana - membantu navigasi & struktur SEO. */}
        <Reveal className="relative">
          <nav aria-label="Breadcrumb" className="text-xs text-ink-faint">
            <Link href="/panduan" className="hover:text-ink transition">Panduan</Link>
            <span className="mx-1.5" aria-hidden="true">/</span>
            <span className="text-ink-muted">{p.judul}</span>
          </nav>
          <h1 className="mt-4 flex items-center gap-3 font-display text-3xl tracking-tight text-ink md:text-4xl">
            <EmojiReg nama={p.emoji} size={32} className="inline-block shrink-0" />
            {p.judul}
          </h1>
          <div className="accent-bar mt-4" aria-hidden="true" />
          <p className="mt-5 leading-relaxed text-ink-muted">{p.ringkas}</p>
          <p className="mt-2 text-xs text-ink-faint">Sekitar {p.menit} menit baca</p>
        </Reveal>

        <div className="relative mt-12 space-y-10">
          {p.sections.map((s, i) => (
            <Reveal key={s.title} delay={i * 40}>
              <section>
                <h2 className="font-display text-xl tracking-tight text-ink">{s.title}</h2>
                {s.body && (
                  <div className="mt-3 space-y-3">
                    {s.body.map((par) => (
                      <p key={par.slice(0, 32)} className="leading-relaxed text-ink-muted">{par}</p>
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
        </div>

        {/* Baca juga - tautan internal antar panduan (struktur situs). */}
        <Reveal>
          <div className="mt-14 border-t border-border-soft pt-8">
            <h2 className="font-display text-lg text-ink">Baca juga</h2>
            <ul className="mt-4 space-y-3">
              {lainnya.map((x) => (
                <li key={x.slug}>
                  <Link href={`/panduan/${x.slug}`} className="group flex items-start gap-3 cursor-pointer">
                    <EmojiReg nama={x.emoji} size={22} className="mt-0.5 inline-block shrink-0" />
                    <span>
                      <span className="block font-semibold text-ink transition group-hover:text-accent-hover">{x.judul}</span>
                      <span className="block text-sm text-ink-muted">{x.ringkas}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </main>
      <Footer />
    </>
  );
}

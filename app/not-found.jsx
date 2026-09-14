import Link from 'next/link';
import { InviteButton, NexoLogo } from './components/ui';

export const metadata = {
  title: 'Halaman Tidak Ditemukan',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="bg-grid absolute inset-0" aria-hidden="true" />
      <div className="relative">
        {/* Logo faded */}
        <div className="mx-auto w-fit opacity-30">
          <NexoLogo size={56} />
        </div>

        {/* Error code with gaming glow */}
        <p className="mt-6 font-display text-8xl font-extrabold text-accent/25" style={{ textShadow: '0 0 40px rgba(241,154,26,0.15)' }}>404</p>

        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Game Over: Halaman Tidak Ditemukan
        </h1>

        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
          Halaman yang kamu cari tidak ada atau sudah dipindahkan. Kembali ke lobby dan main lagi.
        </p>

        {/* Terminal hint - gaming nuance */}
        <div className="mx-auto mt-6 flex h-12 w-full max-w-sm items-center justify-center rounded-xl border border-border-soft bg-card-dark px-4">
          <span className="font-mono text-sm text-success">
            $ nexo --find-page
          </span>
          <span className="ml-2 font-mono text-sm text-danger">ERROR: route not found</span>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary cursor-pointer">Kembali ke Beranda</Link>
          <InviteButton label="Invite Bot" />
        </div>

        <p className="mt-6 text-xs text-ink-muted/60">
          Kalau kamu yakin ini bug, kabari xurbaybase.
        </p>
      </div>
    </main>
  );
}

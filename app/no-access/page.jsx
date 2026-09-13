import Link from 'next/link';
import AdminFooter from '../components/admin/AdminFooter';
import { NexoLogo } from '../components/ui';

export const metadata = {
  title: 'Akses Tertutup',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// /no-access - disambut dengan sopan (dan sedikit ngeledek) buat yang bukan admin.
export default function NoAccessPage() {
  return (
    <>
      <main className="relative flex min-h-screen flex-col items-center justify-center px-5 text-center">
        <div className="bg-grid absolute inset-0" aria-hidden="true" />
        <div className="relative">
          {/* Logo faded */}
          <div className="mx-auto w-fit opacity-30">
            <NexoLogo size={64} />
          </div>

          {/* Error code with subtle glow */}
          <p className="mt-6 font-display text-8xl font-extrabold text-danger/20" style={{ textShadow: '0 0 40px rgba(199,75,60,0.12)' }}>403</p>

          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            Bukan lu deh.
          </h1>

          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
            Panel admin NEXO cuma punya satu kunci, dan Discord lu bukan dia.
            Akun yang login barusan nggak terdaftar sebagai admin, jadi pintunya
            tetap tertutup. Lucunya, bahkan kalau lu maksa, di dalem sana nggak
            ada apa-apa selain spreadsheet dan penyesalan.
          </p>

          {/* Terminal hint — consistent with 404 page */}
          <div className="mx-auto mt-7 flex h-12 w-full max-w-sm items-center justify-center rounded-xl border border-border-soft bg-card-dark px-4">
            <span className="font-mono text-sm text-success">
              $ sudo masuk-panel-admin
            </span>
            <span className="ml-2 font-mono text-sm text-danger">Permission denied 🔒</span>
          </div>

          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/" className="btn-primary cursor-pointer text-sm">
              Balik ke Beranda
            </Link>
            <Link
              href="/me"
              className="btn-ghost cursor-pointer text-sm"
            >
              Buka Profil Gw Aja
            </Link>
          </div>

          <p className="mt-6 text-xs text-ink-muted/60">
            Kalau menurutmu ini salah dan kamu memang adminnya, kabari xurbaybase.
          </p>
        </div>
      </main>
      <AdminFooter />
    </>
  );
}

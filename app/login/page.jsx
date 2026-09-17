import { getSession } from '../lib/session';
import { NexoLogo } from '../components/ui';
import BackButton from '../components/BackButton';
import Link from 'next/link';
import LoginConsent from '../components/LoginConsent';

export const metadata = {
  title: 'Login',
  description: 'Login ke NEXO Games dengan Discord untuk melihat profil, redeem kode, dan beli NEXO Pass.',
  robots: { index: false },
};

export default async function LoginPage({ searchParams }) {
  // Sudah login member? langsung ke halaman tujuan (returnTo) atau /me
  const session = await getSession();
  const sp = await searchParams; // Next 16: searchParams adalah Promise
  const raw = typeof sp?.returnTo === 'string' ? sp.returnTo : '';
  const returnTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/me';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-5">
      <div className="bg-grid absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-md">
        <BackButton href="/" className="mb-4" />
        <div className="nx-card px-8 py-10 text-center">
          <div className="mx-auto w-fit">
            <NexoLogo size={52} />
          </div>
          <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">
            Login member.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Identitas member memakai akun Discord kamu, biar profil poin dan premium
            tersambung otomatis dengan bot.
          </p>

          {session ? (
            <div className="mt-7">
              <p className="text-sm text-success">Sudah login sebagai <strong>{session.username}</strong>.</p>
              <Link href={returnTo} className="btn-primary mt-4 inline-flex cursor-pointer">{returnTo === '/premium' ? 'Beli NEXO Pass' : 'Buka Profil'}</Link>
            </div>
          ) : (
            <LoginConsent returnTo={returnTo} />
          )}
        </div>

        <p className="mt-5 text-center">
          <Link href="/admin/login" className="text-xs text-ink-muted underline-offset-2 hover:underline cursor-pointer">
            Login Admin
          </Link>
        </p>
      </div>
    </main>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NexoLogo, DiscordIcon } from '../../components/ui';
import BackButton from '../../components/BackButton';
import Turnstile from '../../components/Turnstile';

// Turnstile aktif hanya kalau site-key diset (sama seperti halaman Redeem).
const HAS_TS_KEY = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

// /admin/login - akses panel. Utama: login Discord KHUSUS pemilik akun admin
// (ADMIN_DISCORD_IDS). Siapa pun selain itu -> /no-access. Username+password
// sengaja jadi cadangan kecil di bawah (fallback kalau Discord error/DM down).
// Jalur password + captcha, lalu dilanjut kode Google Authenticator (2FA).
export default function AdminLoginPage() {
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [cfToken, setCfToken] = useState(null);
  const [tsNonce, setTsNonce] = useState(0); // token sekali-pakai -> remount saat reset
  const [tsOn, setTsOn] = useState(false);

  useEffect(() => {
    if (HAS_TS_KEY) setTsOn(true);
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (loading) return;
    if (tsOn && !cfToken) {
      setError('Selesaikan captcha dulu.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, cfToken }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = data.needs2fa ? '/admin/verify' : '/admin';
      } else {
        setError(data.error || 'Username atau password salah.');
        if (data.turnstile) { setTsNonce((n) => n + 1); setCfToken(null); }
      }
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-5">
      <div className="bg-grid absolute inset-0" aria-hidden="true" />
      <div className="relative w-full max-w-md">
        <BackButton href="/" className="mb-4" />
        <div className="nx-card px-8 py-10">
          <div className="text-center">
            <div className="mx-auto w-fit">
              <NexoLogo size={48} />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">
              Login admin.
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Satu kunci, satu orang. Panel ini khusus pemilik akun.
            </p>
          </div>

          <a
            href="/api/auth/login?returnTo=%40admin"
            className="btn-primary mt-7 flex w-full items-center justify-center gap-2.5 px-6! py-3.5! cursor-pointer"
          >
            <DiscordIcon className="h-5 w-5" />
            Masuk dengan Discord
          </a>
          <p className="mt-3 text-center text-xs text-ink-muted">
            Hanya akun Discord terdaftar yang bisa masuk. Selain itu, jangan dipaksa.
          </p>

          {showForm ? (
            <form onSubmit={submit} className="mt-7 space-y-4 border-t border-border-soft pt-6">
              <div>
                <label htmlFor="admin-user" className="text-sm font-semibold text-ink">Username</label>
                <input
                  id="admin-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="mt-1.5 w-full rounded-xl border border-border-soft bg-card-cream px-4 py-3 text-ink focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="admin-pass" className="text-sm font-semibold text-ink">Password</label>
                <div className="relative mt-1.5">
                  <input
                    id="admin-pass"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-xl border border-border-soft bg-card-cream px-4 py-3 pr-12 text-ink focus:border-accent focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? 'Sembunyikan password' : 'Tampilkan password'}
                    aria-pressed={showPass}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-ink-muted transition-colors hover:text-ink cursor-pointer"
                  >
                    {showPass ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {tsOn && <Turnstile key={tsNonce} onToken={setCfToken} />}

              {error && (
                <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading || !username || !password} className="btn-primary bg-card-dark! w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? 'Memeriksa…' : 'Masuk via Password'}
              </button>
            </form>
          ) : (
            <p className="mt-6 text-center">
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline cursor-pointer"
              >
                Discord lagi error? Pakai username dan password
              </button>
            </p>
          )}
        </div>

        <p className="mt-5 text-center">
          <Link href="/login" className="text-xs text-ink-muted underline-offset-2 hover:underline cursor-pointer">
            Member? Login dengan Discord
          </Link>
        </p>
      </div>
    </main>
  );
}

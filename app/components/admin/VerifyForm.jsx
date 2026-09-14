'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { NexoLogo } from '../ui';
import BackButton from '../BackButton';

// /admin/verify - langkah 2 login admin: kode 6 digit Google Authenticator.
// Cookie pending (10 menit) dibuat langkah 1 (/admin/login password atau
// OAuth Discord admin). Opsi "ingat perangkat" -> cookie tepercaya 30 hari.
export default function VerifyForm() {
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (loading || code.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, remember }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = '/admin';
      } else {
        setError(data.error || 'Verifikasi gagal.');
        if (res.status === 401 && /kadaluarsa/i.test(data.error || '')) setExpired(true);
        setCode('');
        inputRef.current?.focus();
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
        <BackButton className="mb-4" />
        <div className="nx-card px-8 py-10">
          <div className="text-center">
            <div className="mx-auto w-fit">
              <NexoLogo size={48} />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight text-ink">
              Kode verifikasi.
            </h1>
            <p className="mt-2 text-sm text-ink-muted">
              Identitas kamu sudah benar. Sekarang masukkan kode 6 digit dari
              Google Authenticator di HP kamu.
            </p>
          </div>

          {expired ? (
            <div className="mt-7 text-center">
              <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                Sesi login kadaluarsa (melewati 10 menit).
              </p>
              <Link href="/admin/login" className="btn-primary bg-card-dark! mt-4 inline-flex cursor-pointer">
                Mulai Login dari Awal
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-7 space-y-4">
              <div>
                <label htmlFor="totp" className="text-sm font-semibold text-ink">Kode Authenticator</label>
                <input
                  ref={inputRef}
                  id="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="mt-1.5 w-full rounded-xl border border-border-soft bg-card-cream px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-ink focus:border-accent focus:outline-none"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  // accent-[#F19A1A] = CSS property `accent-color` (warna
                  // checkbox native), nilainya sama dengan token accent.
                  className="h-4 w-4 cursor-pointer accent-[#F19A1A]"
                />
                Ingat perangkat ini (30 hari, tidak perlu kode lagi)
              </label>

              {error && (
                <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="btn-primary bg-card-dark! w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Memeriksa…' : 'Masuk Panel'}
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-xs text-ink-muted">
            Kode berubah tiap 30 detik. Kalau HP hilang, chat xurbaybase untuk reset secret.
          </p>
        </div>
      </div>
    </main>
  );
}

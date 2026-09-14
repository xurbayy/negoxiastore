'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Turnstile from './Turnstile';

// Turnstile aktif hanya kalau site-key diset DAN bukan localhost (dev).
// Server-side verifyTurnstile() sudah punya dev graceful-mode yang sama.
const HAS_TS_KEY = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const BOT_INVITE_URL =
  'https://discord.com/oauth2/authorize?client_id=1497924277301936300&scope=bot+applications.commands&permissions=277025508352';

export default function RedeemClient({ loggedIn, prefillCode = '' }) {
  const [code, setCode] = useState(prefillCode);
  const [result, setResult] = useState(null); // { ok, message }
  const [loading, setLoading] = useState(false);
  // Status registrasi pemain di bot: 'check' | 'ok' | 'onboarding'
  const [reg, setReg] = useState(loggedIn ? 'check' : 'ok');
  const [cfToken, setCfToken] = useState(null);
  const [tsNonce, setTsNonce] = useState(0); // token sekali-pakai -> remount saat reset
  // Turnstile aktif kalau site-key diset (state utk hindari hydration mismatch)
  const [tsOn, setTsOn] = useState(false);

  useEffect(() => {
    if (HAS_TS_KEY) setTsOn(true);
  }, []);

  const checkReg = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      const d = await res.json();
      const ok = d.authenticated && d.profile?.registered === true && d.profile?.needsOnboarding !== true;
      setReg(ok ? 'ok' : 'onboarding');
      return ok;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (loggedIn) checkReg();
  }, [loggedIn, checkReg]);

  // Auto-cek ulang tiap 20 detik selama masih onboarding, sampai data muncul.
  useEffect(() => {
    if (reg !== 'onboarding') return;
    const iv = setInterval(async () => {
      const ok = await checkReg();
      if (ok) window.location.href = '/redeem';
    }, 20000);
    return () => clearInterval(iv);
  }, [reg, checkReg]);

  async function submit(e) {
    e.preventDefault();
    if (!code.trim() || loading) return;
    if (tsOn && !cfToken) {
      setResult({ ok: false, message: 'Konfirmasi dulu kamu manusia di kotak verifikasi.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), cfToken }),
      });
      const data = await res.json();
      setResult({ ok: Boolean(data.ok), message: data.message || data.reason || 'Terjadi kesalahan.' });
      if (data.ok) setCode('');
      // token Turnstile sekali-pakai: reset widget utk percobaan berikutnya
      if (tsOn) { setCfToken(null); setTsNonce((n) => n + 1); }
    } catch {
      setResult({ ok: false, message: 'Gagal menghubungi server. Coba lagi.' });
    } finally {
      setLoading(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="nx-card px-6 py-10 text-center">
        <p className="text-ink-muted">Login dulu untuk redeem kode promo.</p>
        <a href="/api/auth/login?returnTo=%2Fredeem" className="btn-primary mt-5 inline-flex cursor-pointer">Login dengan Discord</a>
      </div>
    );
  }

  // Data pemain belum ada di bot -> jangan suruh ngetik kode ke void:
  // kartu mini 404 dulu, form baru muncul setelah registered.
  if (reg === 'check') {
    return <div className="skeleton h-40 w-full" />;
  }
  if (reg === 'onboarding') {
    return (
      <div className="nx-card overflow-hidden px-6 py-8 text-center">
        {/* Error code with accent glow */}
        <p className="font-display text-5xl font-extrabold tracking-tight text-accent/25" style={{ textShadow: '0 0 30px rgba(241,154,26,0.12)' }}>404.</p>
        <p className="mt-2 font-display text-lg tracking-tight text-ink">
          Datamu belum ada di bot.
        </p>

        {/* Dark embed hint */}
        <div className="nx-dark mx-auto mt-4 max-w-sm px-4 py-3 text-left">
          <p className="text-sm leading-relaxed text-card-cream">
            <span className="font-bold text-accent">NEXO</span>{' '}
            <span className="text-ink-faint">&gt;</span>{' '}
            Sebelum bisa klaim kode, daftar dulu 10 detik di Discord.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary cursor-pointer text-sm">
            Invite NEXO
          </a>
          <button type="button" onClick={checkReg} className="btn-ghost cursor-pointer text-sm">
            Cek Lagi
          </button>
        </div>
        <p className="mt-4 flex items-center justify-center gap-2 text-[0.7rem] text-ink-faint">
          <span className="pulse-dot" aria-hidden="true" />
          Otomatis cek ulang tiap 20 detik ·{' '}
          <Link href="/me" className="underline-offset-2 hover:underline cursor-pointer">Buka panduan lengkap</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="nx-card px-6 py-6">
      <label htmlFor="kode" className="text-sm font-semibold text-ink">Kode Promo</label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id="kode"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="NEXO2026"
          maxLength={24}
          className="flex-1 rounded-xl border border-border-soft bg-bg-soft px-4 py-3 font-mono text-lg uppercase tracking-widest text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <button type="submit" disabled={loading || !code.trim()} className="btn-primary cursor-pointer disabled:opacity-50">
          {loading ? 'Memproses…' : 'Redeem'}
        </button>
      </div>
      {tsOn && (
        <div className="mt-4">
          <Turnstile key={tsNonce} onToken={setCfToken} />
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">3-24 karakter, huruf besar/angka/underscore. Maksimal 5 percobaan per menit.</p>

      {result && (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            result.ok
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}

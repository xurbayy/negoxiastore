'use client';

import { useState } from 'react';
import { DiscordIcon } from './ui';

// Tombol login + gerbang persetujuan: checkbox Ketentuan & Privasi wajib
// dicentang sebelum tombol Discord aktif. (Persetujuan ini syarat UX/legal
// di titik masuk - OAuth-nya sendiri tetap ditangani Discord.)
export default function LoginConsent({ returnTo = '/me' }) {
  const [agreed, setAgreed] = useState(false);
  const target = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/me';

  return (
    <div className="mt-7">
      <button
        type="button"
        onClick={() => { if (agreed) window.location.href = '/api/auth/login?returnTo=' + encodeURIComponent(target); }}
        disabled={!agreed}
        aria-disabled={!agreed}
        className="btn-primary w-full cursor-pointer py-3.5! disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
      >
        <DiscordIcon />
        Login dengan Discord
      </button>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-left">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#F19A1A]"
        />
        <span className="text-xs leading-relaxed text-ink-muted">
          Saya telah membaca dan menyetujui{' '}
          <a href="/terms-of-service" className="font-semibold text-accent-hover underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
            Ketentuan Layanan
          </a>{' '}
          dan{' '}
          <a href="/privacy-policy" className="font-semibold text-accent-hover underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
            Kebijakan Privasi
          </a>{' '}
          NEXO Games.
        </span>
      </label>
    </div>
  );
}

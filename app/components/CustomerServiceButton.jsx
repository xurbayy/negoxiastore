'use client';

import { useEffect, useRef, useState } from 'react';

// ==========================================
// CustomerServiceButton — tombol "Customer Service"
// ==========================================
// Permintaan pemilik 2026-10-13: tombol dengan logo CS yang kalau diklik
// muncul 2 pilihan kontak: WhatsApp dan Discord (user ID pemilik).
// Dipakai di:
//   - seksi Kontak Support (homepage)
//   - samping tombol "Beli NEXO Pass" di seksi NEXO Pass (homepage)
//
// Discord ID + nomor WA = kontak resmi. Discord: profil owner.
const DISCORD_ID = '836383639439671366'; // owner NEXO (xurbayy)
const WA_NUMBER = '085872320635';
const WA_LINK = `https://wa.me/62${WA_NUMBER.replace(/^0/, '')}`;
// Deep link Discord: membuka profil user di aplikasi/web Discord.
const DISCORD_LINK = `https://discord.com/users/${DISCORD_ID}`;

function IkonCS({ className = 'h-4 w-4' }) {
  // Headset = ikon universal customer service.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1v-6a9 9 0 0 1 18 0v6a1 1 0 0 1-1 1h-2a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
      <path d="M21 16v2a4 4 0 0 1-4 4h-5" />
    </svg>
  );
}

function IkonWA({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function IkonDiscord({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

/**
 * Tombol Customer Service dengan dropdown 2 pilihan kontak.
 * @param {object} props
 * @param {'light'|'dark'} props.tone - tone tombol (light = default situs).
 * @param {string} props.className - tambahan kelas.
 */
export default function CustomerServiceButton({ className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Tutup kalau klik di luar / tekan Escape.
  useEffect(() => {
    if (!open) return undefined;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn-solid btn-solid-neutral cursor-pointer"
      >
        <IkonCS />
        <span>Customer Service</span>
        <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-xl border border-border-soft bg-card-cream p-1.5 shadow-[0_12px_32px_rgba(43,33,24,0.14)]"
        >
          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-bg-soft cursor-pointer"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
              <IkonWA className="h-4 w-4" />
            </span>
            WhatsApp
          </a>
          <a
            href={DISCORD_LINK}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-bg-soft cursor-pointer"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5865F2] text-white">
              <IkonDiscord className="h-4 w-4" />
            </span>
            Discord
          </a>
        </div>
      )}
    </div>
  );
}

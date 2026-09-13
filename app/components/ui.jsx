import { BOT_INVITE } from '../lib/site';

// Logo resmi NEXO Games - varian BULAT (public/nexo-logo-256.png,
// sumber: artwork nexo.png; 128 & 512 tersedia utk kebutuhan lain).
export function NexoLogo({ size = 36, className = '' }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/nexo-logo-256.png"
      alt="Logo NEXO Games"
      width={size}
      height={size}
      className={className}
    />
  );
}

export function DiscordIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

export function GamepadIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7.5 6h9A5.5 5.5 0 0 1 22 11.5c0 1.8-.95 3.4-2.38 4.28-.62.38-1.42.2-1.83-.4l-1.42-2.03a1.5 1.5 0 0 0-1.24-.65h-2.26a1.5 1.5 0 0 0-1.24.65L10.21 15.4c-.4.6-1.2.77-1.82.4A5.48 5.48 0 0 1 6 11.5 5.5 5.5 0 0 1 7.5 6ZM6.5 9.5A1 1 0 0 0 5.5 10.5H4a1 1 0 1 0 0 2h1.5a1 1 0 0 0 1-1 1 1 0 0 0 .5.87V14a1 1 0 1 0 2 0v-.63a1 1 0 0 0 .5-.87 1 1 0 0 0-1-1H6.5Zm11.5.25a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm2.75 2.75a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z" />
    </svg>
  );
}

export function BoltIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
    </svg>
  );
}

// Tombol CTA utama: Invite bot.
export function InviteButton({ className = '', label = 'Tambahkan ke Discord' }) {
  return (
    <a
      href={BOT_INVITE}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn-primary ${className}`}
    >
      <DiscordIcon />
      {label}
    </a>
  );
}

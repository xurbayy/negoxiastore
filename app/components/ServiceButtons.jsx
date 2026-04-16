'use client';

import Image from 'next/image';

const DISCORD_URL = 'https://discord.gg/7t9qxvqXyV';

/**
 * Primary orange "Order Sekarang" CTA button.
 *
 * Props:
 *  - btnRef   : React ref — forwarded ref for ripple effect
 *  - onClick  : function? — override default (opens Discord)
 *  - fullWidth: boolean?  — adds max-md:w-full
 *  - className: string?   — extra Tailwind classes
 */
export function OrderButton({ btnRef, onClick, fullWidth = false, className = '' }) {
  return (
    <button
      ref={btnRef}
      className={[
        'btn-order btn-ripple',
        'bg-accent2 bg-[var(--orange)] text-white border-none',
        'rounded-xl p-[11px_26px]',
        'font-inter text-[13px] font-semibold cursor-pointer',
        'flex items-center justify-center gap-2',
        'transition-all duration-[250ms]',
        'hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_8px_28px_rgba(247,193,81,0.5)]',
        'active:scale-[0.97]',
        fullWidth ? 'max-md:w-full' : '',
        className,
      ].join(' ')}
      onClick={onClick ?? (() => window.open(DISCORD_URL, '_blank'))}
    >
      <Image src="/discord-white.svg" alt="Discord" width={16} height={16} className="w-4 h-4 object-contain" />
      Order Sekarang
    </button>
  );
}

/**
 * Secondary ghost / outline button used beside the Order button.
 *
 * Props:
 *  - btnRef   : React ref
 *  - onClick  : function
 *  - children : ReactNode — label text
 *  - className: string?
 */
export function GhostButton({ btnRef, onClick, children, className = '' }) {
  return (
    <button
      ref={btnRef}
      className={[
        'btn-ghost btn-ripple',
        'bg-[var(--soft)] text-brand border-[1.5px] border-[var(--stroke)]',
        'rounded-xl p-[10px_22px]',
        'font-inter text-[13px] font-semibold cursor-pointer',
        'transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(44,19,22,0.12)] hover:border-[var(--orange)] hover:bg-[var(--accent1)]',
        'active:scale-[0.97]',
        'max-md:flex max-md:justify-center',
        className,
      ].join(' ')}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

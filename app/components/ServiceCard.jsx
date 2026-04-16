'use client';

import { useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import { useCardTilt } from './hooks/useServicePage';

/**
 * Shared card wrapper used on all service detail pages.
 *
 * Props:
 *  - icon        : string  — path to the icon image shown in the card header
 *  - iconAlt     : string  — alt text for the icon
 *  - title       : string  — card header title text
 *  - subtitle    : string? — optional subtitle / price range shown under the title
 *  - gridClass   : string  — Tailwind grid classes for the card body columns
 *  - footer      : ReactNode — footer content (buttons)
 *  - children    : ReactNode — body columns content
 */
export default function ServiceCard({ icon, iconAlt, title, subtitle, gridClass, footer, children }) {
  const cardRef = useRef(null);
  const [visible, setVisible] = useState(false);
  useCardTilt(cardRef);

  useEffect(() => {
    // Reset and re-trigger on every mount (handles back navigation in Next.js)
    setVisible(false);
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      ref={cardRef}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
      }}
      className="bg-card rounded-[22px] border-[1.5px] border-stroke shadow-[0_4px_24px_rgba(44,19,22,0.08)] overflow-hidden"
    >
      {/* Header */}
      <div className="text-center p-[28px_40px_20px] border-b-[1.5px] border-stroke">
        <div className="flex items-center justify-center gap-2.5 mb-1">
          <Image
            src={icon}
            alt={iconAlt}
            width={28}
            height={28}
            className="icon-wobble w-7 h-7 object-contain"
          />
          <span className="text-[14px] font-bold uppercase tracking-[0.5px]">{title}</span>
        </div>
        {subtitle && (
          <div className="text-[14px] font-inter text-brand/70 font-medium mt-1">{subtitle}</div>
        )}
      </div>

      {/* Body */}
      <div className={`grid ${gridClass}`}>
        {children}
      </div>

      {/* Footer */}
      {footer && (
        <div className="border-t-[1.5px] border-stroke p-[20px_28px] flex items-center justify-end gap-3 max-md:flex-col max-md:items-stretch">
          {footer}
        </div>
      )}
    </div>
  );
}

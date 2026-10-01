'use client';

import { useEffect, useRef } from 'react';

// Unit iklan AdSense. Dipanggil di halaman mana pun setelah <AdSense /> (script)
// dimuat di layout. Push ke window.adsbygoogle setelah mount.
//
// Slot ID: ambil dari env NEXT_PUBLIC_ADSENSE_SLOT (per unit). Slot harus dibuat
// dulu di dashboard AdSense (https://adsense.google.com) -> "Unit iklan" -> baru.
export default function AdUnit({ slot, format = 'auto', className = '' }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (_) { /* AdSense belum load / blocked - abaikan */ }
  }, []);

  const slotId = slot || process.env.NEXT_PUBLIC_ADSENSE_SLOT || '';

  // Tanpa slot ID, jangan render <ins> kosong (bikin error di console).
  // Placeholder tipis: cukup untuk menjaga layout, tidak mendorong konten
  // ke bawah terlalu jauh di mobile (360px).
  if (!slotId) {
    return (
      <div className={`flex h-12 items-center justify-center rounded-lg border border-dashed border-border-soft bg-bg-soft/40 text-[0.65rem] text-ink-faint ${className}`}>
        Slot iklan belum dikonfigurasi
      </div>
    );
  }

  return (
    <ins
      className={`adsbygoogle block ${className}`}
      style={{ display: 'block' }}
      data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-2706837395470018'}
      data-ad-slot={slotId}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}

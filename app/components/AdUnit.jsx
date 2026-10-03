'use client';

import { useEffect, useRef } from 'react';

// Unit iklan AdSense. Dipanggil di halaman mana pun setelah <AdSense /> (script)
// dimuat di layout. Push ke window.adsbygoogle setelah mount.
//
// Slot ID: ambil dari env NEXT_PUBLIC_ADSENSE_SLOT (per unit). Slot harus dibuat
// dulu di dashboard AdSense (https://adsense.google.com) -> "Unit iklan" -> baru.
export default function AdUnit({ slot, format = 'auto', className = '' }) {
  const pushed = useRef(false);
  const ref = useRef(null);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    const push = () => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        return true;
      } catch (_) { return false; } // AdSense belum load / blocked
    };
    push();
    // RETRY (fix 2026-10-03): kalau script adsbygoogle belum terload saat unit
    // dirender (navigasi cepat / jaringan lambat), unit bisa "hilang" permanen.
    // Cek ulang 2x dengan jeda; berhenti kalau iklan sudah terisi (adsbygoogle
    // menandai elemen dengan data-ad-status).
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      const el = ref.current;
      const terisi = el && el.getAttribute('data-ad-status');
      if (terisi || tries >= 3) { clearInterval(t); return; }
      push();
    }, 1500);
    return () => clearInterval(t);
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

  // Format iklan: 'auto' diganti 'horizontal' supaya slot lebih pendek dan
  // tidak melebar ke bawah (permintaan pemilik 2026-10-01). Format lain yang
  // dikirim pemanggil tetap dihormati.
  const formatEfektif = format === 'auto' ? 'horizontal' : format;

  return (
    // Pembungkus dengan tinggi DIBATASI: iklan tidak boleh mendorong judul
    // terlalu jauh ke bawah. max-h-28 (112px) + overflow-hidden menjaga rapi;
    // lebar tetap menyesuaikan ruang.
    <div className={`mx-auto max-h-28 w-full overflow-hidden ${className}`}>
      <ins
        ref={ref}
        className="adsbygoogle block"
        style={{ display: 'block', width: '100%', height: '100%' }}
        data-ad-client={process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-2706837395470018'}
        data-ad-slot={slotId}
        data-ad-format={formatEfektif}
        // false: jangan paksa lebar penuh, supaya tinggi iklan lebih terkendali.
        data-full-width-responsive="false"
      />
    </div>
  );
}

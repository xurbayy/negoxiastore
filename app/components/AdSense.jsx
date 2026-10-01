'use client';

import Script from 'next/script';

// Script global AdSense. Dipasang SEKALI di layout.jsx supaya semua halaman
// bisa memuat <ins class="adsbygoogle"> tanpa mengulang script.
//
// Client ID diambil dari env NEXT_PUBLIC_ADSENSE_CLIENT supaya tidak hardcode
// di banyak tempat. Kalau env belum diisi, script tetap dimuat (Google tetap
// validasi) tapi unit iklan tidak akan menampilkan iklan.
export default function AdSense() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-2706837395470018';
  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}

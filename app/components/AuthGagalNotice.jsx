'use client';

import { useEffect, useState } from 'react';

// Menampilkan ALASAN kegagalan login yang dikirim callback lewat query
// (?auth=gagal&kode=...). Sebelumnya semua kegagalan disamarkan jadi halaman
// biasa tanpa penjelasan, sehingga sulit didiagnosa. Komponen ini menerjemahkan
// kode teknis jadi pesan yang bisa ditindaklanjuti.
const PESAN = {
  tanpa_code: 'Discord tidak mengirim kode otorisasi. Coba login ulang dari awal.',
  env_kosong_client_id: 'Konfigurasi server belum lengkap: DISCORD_CLIENT_ID kosong di hosting.',
  env_kosong_client_secret: 'Konfigurasi server belum lengkap: DISCORD_CLIENT_SECRET kosong di hosting.',
  cookie_state_hilang: 'Cookie keamanan login hilang (mungkin browser memblokir cookie, atau dibuka dari mode privat). Coba lagi di jendela normal.',
  state_mismatch: 'Verifikasi keamanan login tidak cocok. Coba login ulang dari halaman utama.',
};

function terjemah(kode) {
  if (!kode) return 'Login gagal. Coba lagi.';
  if (PESAN[kode]) return PESAN[kode];
  if (kode.startsWith('token_invalid_client')) {
    return 'Discord menolak kredensial aplikasi (invalid_client). DISCORD_CLIENT_SECRET di hosting salah atau belum diganti setelah reset. Perbaiki lalu redeploy.';
  }
  if (kode.startsWith('token_invalid_grant')) {
    return 'Kode otorisasi kedaluwarsa atau sudah dipakai. Coba login ulang dengan cepat.';
  }
  if (kode.startsWith('token_')) {
    return `Discord menolak penukaran token (${kode.slice(6)}). Cek DISCORD_REDIRECT_URI di hosting sama persis dengan yang didaftarkan di Discord Portal.`;
  }
  if (kode.startsWith('server_')) {
    return `Gagal di server web: ${kode.slice(7)}. Hubungi admin dengan pesan ini.`;
  }
  return `Login gagal (${kode}). Coba lagi.`;
}

export default function AuthGagalNotice() {
  const [pesan, setPesan] = useState(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('auth') !== 'gagal') return;
    setPesan(terjemah(q.get('kode')));
  }, []);

  if (!pesan) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,30rem)] -translate-x-1/2">
      <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-card-dark px-4 py-3 shadow-lg">
        <span className="mt-0.5 shrink-0 font-mono text-sm text-danger">[!]</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Login gagal</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{pesan}</p>
        </div>
        <button
          type="button"
          onClick={() => setPesan(null)}
          aria-label="Tutup"
          className="shrink-0 rounded-md px-1.5 text-ink-muted hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

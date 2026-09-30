'use client';

// ==========================================
// KomunitasClient.jsx
// Daftar server NEXO teratas - pencarian + paginasi 10 per halaman.
//
// KENAPA CLIENT COMPONENT:
//   Pencarian & paginasi harus instan tanpa reload halaman. Kalau diproses di
//   server, tiap ketik huruf / ganti halaman butuh request baru - lambat dan
//   bikin halaman berkedip.
//
// DATA DARI SNAPSHOT BOT:
//   Sudah diurutkan bot (pemain -> game -> poin) dan sudah DISARING: server
//   yang tidak punya invite permanen tidak dikirim sama sekali (kebijakan
//   pemilik: invite wajib ada). Jadi di sini tidak perlu saring lagi.
// ==========================================

import { useMemo, useState, useEffect, useRef } from 'react';
import { emojiSrc } from '../lib/emojisClient';

// ==========================================
// STATE PENCARIAN & HALAMAN
// ==========================================
//
// Keduanya disimpan di state React biasa. <AutoRefresh> memanggil
// router.refresh() tiap 20 detik untuk menyegarkan data server, dan React
// MEMPERTAHANKAN state komponen klien saat refresh itu - jadi posisi halaman
// dan kata kunci tidak hilang.
//
// CATATAN RIWAYAT: sebelumnya reset halaman dilakukan lewat
// useEffect([cari]) yang berbunyi setHalaman(1). Efek itu juga jalan saat
// mount sehingga setiap refresh melempar user balik ke halaman 1. Sekarang
// reset dilakukan di dalam handler pencarian, jadi hanya saat user benar-
// benar mengetik.

const PER_HALAMAN = 10;

// Format angka ringkas: 1.234 -> "1,2rb", 1.500.000 -> "1,5jt"
function fmtRingkas(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace('.0', '').replace('.', ',') + 'jt';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace('.0', '').replace('.', ',') + 'rb';
  return String(v);
}

// Peringkat - gaya PERSIS halaman Leaderboard: angka polos berfont-display,
// 3 teratas diberi ikon mahkota/medal. TANPA chip berwarna semi transparan
// seperti sebelumnya (permintaan pemilik 2026-09-30).
//
// Lebar dikunci (w-9) supaya logo server semua baris tetap sejajar walau
// panjang angkanya beda (1 vs 100).
function Peringkat({ rank }) {
  const crown = rank === 1 ? emojiSrc('crown') : null;
  const medal = rank > 1 && rank <= 3 ? emojiSrc('medal') : null;
  return (
    <span
      className="flex w-9 shrink-0 items-center justify-center gap-1 font-display text-lg font-bold leading-none text-ink"
      aria-label={`Peringkat ${rank}`}
    >
      {crown && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crown} alt="" width={18} height={18} className="h-[18px] w-[18px]" />
      )}
      {medal && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={medal} alt="" width={16} height={16} className="h-4 w-[16px]" />
      )}
      {rank}
    </span>
  );
}

// Avatar server: pakai logo kalau ada, kalau tidak pakai inisial nama.
function ServerLogo({ name, iconUrl, size = 52 }) {
  const [gagal, setGagal] = useState(false);
  const inisial = (name || '?').trim().slice(0, 2).toUpperCase();
  const px = `${size}px`;

  if (iconUrl && !gagal) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: px, height: px }}
        className="shrink-0 rounded-2xl border border-border-soft object-cover"
        loading="lazy"
        onError={() => setGagal(true)}
      />
    );
  }
  return (
    <span
      style={{ width: px, height: px, fontSize: Math.round(size * 0.36) }}
      className="flex shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-accent/15 font-display font-bold text-accent-hover"
      aria-hidden="true"
    >
      {inisial}
    </span>
  );
}

// Satu kartu server.
function KartuServer({ server, rank }) {
  return (
    <li className="nx-card flex flex-col gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(43,33,24,0.12)] sm:flex-row sm:items-center sm:gap-5 sm:p-5">
      {/* Peringkat + logo */}
      <div className="flex items-center gap-4 sm:gap-5">
        <Peringkat rank={rank} />
        <ServerLogo name={server.name} iconUrl={server.iconUrl} />
      </div>

      {/* Nama + statistik */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-base font-bold text-ink sm:text-lg" title={server.name}>
          {server.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted sm:text-sm">
          {/* PEMAIN - statistik paling utama, ditonjolkan */}
          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent-hover" aria-hidden="true">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {fmtRingkas(server.players)} pemain
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="6" width="20" height="12" rx="6" /><path d="M7 12h2m-1-1v2m8-1h.01M18 11h.01" />
            </svg>
            {fmtRingkas(server.games)} game
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
            </svg>
            {fmtRingkas(server.points)} poin
          </span>
        </div>
      </div>

      {/* Tombol join.
          Server yang belum punya invite tetap tampil (permintaan pemilik
          2026-09-30) - tombolnya diganti keterangan, BUKAN link mati. */}
      <div className="shrink-0">
        {server.invite ? (
          <a
            href={server.invite}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex w-full items-center justify-center gap-2 px-5! py-2.5! text-sm sm:w-auto cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Gabung
          </a>
        ) : (
          <span
            /* whitespace-nowrap: teks dua kata ini jangan terlipat di layar
               sempit - tinggi kartu jadi tidak rata dengan baris lain. */
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-full border border-border-soft bg-bg-soft px-5 py-2.5 text-xs text-ink-faint sm:w-auto"
            title="Server ini belum bisa dibuatkan link invite oleh bot."
          >
            Link belum tersedia
          </span>
        )}
      </div>
    </li>
  );
}

export default function KomunitasClient({ servers = [] }) {
  const [cari, setCari] = useState('');
  const [halaman, setHalaman] = useState(1);
  const daftarRef = useRef(null);
  const baruPindahHalaman = useRef(false);

  // Reset ke halaman 1 setiap kali pencarian berubah - tanpa ini, user bisa
  // berada di halaman 5 padahal hasil cari cuma 1 halaman (tampak kosong).
  //
  // DIPANGGIL DARI HANDLER, BUKAN useEffect([cari]). Versi useEffect ikut
  // jalan saat mount dan langsung melempar halaman ke 1 setiap kali
  // <AutoRefresh> memanggil router.refresh() - user yang sedang membuka
  // halaman 4 tiba-tiba terlempar balik ke atas.
  function ubahCari(nilai) {
    setCari(nilai);
    setHalaman(1);
  }

  function ubahHalaman(n) {
    if (n === halaman) return;
    baruPindahHalaman.current = true;
    setHalaman(n);
  }

  // ============================================================
  // PERBAIKAN: layar terlempar ke bawah saat ganti halaman
  // ============================================================
  // Masalah yang dilaporkan (2026-09-30): klik halaman 3 -> layar langsung
  // lompat ke bawah, bukan menampilkan daftar halaman 3.
  //
  // Penyebab: pindah halaman mengubah jumlah kartu (mis. 10 -> 3), jadi
  // tinggi dokumen MENYUSUT tajam (diuji: -770px). Browser lalu meng-CLAMP
  // posisi scroll ke maksimum barunya (mis. 1018 -> 540). Paginasi yang
  // tadi di tengah layar ikut terdorong ke atas dan sisa layar penuh kartu
  // "Punya server sendiri?" + footer = terlihat seperti melompat ke bawah.
  //
  // Solusi: setelah daftar ter-render ulang, gulir ke atas daftar. Efek ini
  // berjalan SETELAH commit, jadi tinggi baru sudah pasti terpakai. Dijaga
  // ref supaya tidak ikut jalan saat mount / saat user mengetik pencarian.
  useEffect(() => {
    if (!baruPindahHalaman.current) return;
    baruPindahHalaman.current = false;
    daftarRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [halaman]);

  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return servers;
    return servers.filter((s) => (s.name || '').toLowerCase().includes(q));
  }, [servers, cari]);

  const totalHalaman = Math.max(1, Math.ceil(hasil.length / PER_HALAMAN));
  // Jaga halaman tetap dalam rentang yang valid (mis. setelah filter berubah).
  const halamanAman = Math.min(halaman, totalHalaman);
  const mulai = (halamanAman - 1) * PER_HALAMAN;
  const ditampilkan = hasil.slice(mulai, mulai + PER_HALAMAN);

  // Nomor halaman yang ditampilkan: maksimal 5 tombol di sekitar halaman aktif.
  const nomorHalaman = useMemo(() => {
    const arr = [];
    let start = Math.max(1, halamanAman - 2);
    const end = Math.min(totalHalaman, start + 4);
    start = Math.max(1, end - 4);
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [halamanAman, totalHalaman]);

  // Tidak ada satu pun server yang punya pemain.
  // Daftar ini HANYA memuat server yang sudah ada pemainnya (permintaan
  // pemilik 2026-09-30), jadi kosong di sini berarti belum ada server yang
  // dipakai bermain - bukan error.
  if (!servers.length) {
    return (
      <div className="nx-card mt-8 p-8 text-center">
        <p className="font-display text-lg text-ink">Belum ada server yang bermain</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          Halaman ini hanya menampilkan server yang sudah ada pemainnya. Server akan
          muncul otomatis begitu pemainnya mulai bermain NEXO - tidak perlu didaftarkan
          manual.
        </p>
      </div>
    );
  }

  return (
    // ref + scroll-mt-20: dipakai efek pindah halaman di atas. Kontainer ini
    // selalu ada (tidak seperti <ul> yang hilang saat hasil kosong), jadi
    // gulir selalu mendarat di atas kotak pencarian + daftar. scroll-mt
    // menghitung sendiri offset navbar fixed (57px) - tanpa angka hardcoded.
    <div ref={daftarRef} className="mt-8 scroll-mt-20">
      {/* Pencarian */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={cari}
          onChange={(e) => ubahCari(e.target.value)}
          placeholder="Cari nama server..."
          aria-label="Cari server"
          className="w-full rounded-xl border border-border-soft bg-card-cream py-3 pl-12 pr-4 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        {cari && (
          <button
            type="button"
            onClick={() => ubahCari('')}
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint transition hover:bg-bg-soft hover:text-ink cursor-pointer"
            aria-label="Hapus pencarian"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      {/* Info hasil */}
      <p className="mt-3 text-xs text-ink-muted" role="status" aria-live="polite">
        {cari
          ? `Ditemukan ${hasil.length} server untuk "${cari}"`
          : `Menampilkan ${ditampilkan.length} dari ${hasil.length} server teratas`}
      </p>

      {/* Daftar server */}
      {ditampilkan.length === 0 ? (
        <div className="nx-card mt-4 p-8 text-center">
          <p className="font-display text-base text-ink">Tidak ada server yang cocok</p>
          <p className="mt-1 text-sm text-ink-muted">Coba kata kunci lain.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {ditampilkan.map((s, i) => (
            <KartuServer key={s.guildId || s.name} server={s} rank={mulai + i + 1} />
          ))}
        </ul>
      )}

      {/* Paginasi */}
      {totalHalaman > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="Navigasi halaman">
          <button
            type="button"
            onClick={() => ubahHalaman(Math.max(1, halamanAman - 1))}
            disabled={halamanAman === 1}
            className="flex h-9 items-center justify-center rounded-lg border border-border-soft px-3 text-sm text-ink-muted transition hover:bg-bg-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            aria-label="Halaman sebelumnya"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          {nomorHalaman[0] > 1 && <span className="px-1 text-sm text-ink-faint">…</span>}

          {nomorHalaman.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => ubahHalaman(n)}
              aria-current={n === halamanAman ? 'page' : undefined}
              className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-medium transition cursor-pointer ${
                n === halamanAman
                  ? 'border-accent bg-accent text-ink'
                  : 'border-border-soft text-ink-muted hover:bg-bg-soft hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}

          {nomorHalaman[nomorHalaman.length - 1] < totalHalaman && <span className="px-1 text-sm text-ink-faint">…</span>}

          <button
            type="button"
            onClick={() => ubahHalaman(Math.min(totalHalaman, halamanAman + 1))}
            disabled={halamanAman === totalHalaman}
            className="flex h-9 items-center justify-center rounded-lg border border-border-soft px-3 text-sm text-ink-muted transition hover:bg-bg-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            aria-label="Halaman berikutnya"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </nav>
      )}
    </div>
  );
}

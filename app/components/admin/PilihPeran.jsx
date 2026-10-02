'use client';

// ==========================================
// PilihPeran - pemilih peran AI (komponen modular)
// ==========================================
//
// Permintaan pemilik 2026-10-02: AI punya "role" - bug hunter, cyber security,
// exploit ekonomi, system analyst - masing-masing dengan prompt khusus.
// Komponen ini HANYA menampilkan pilihan peran; logika prompt ada di server
// (app/lib/aiPeran.js). Dipisah supaya AnalisisAI.jsx tidak makin panjang.

// Fallback: kalau server tidak mengirim daftar peran (mis. /ai gagal saat
// deploy belum jalan), tetap tampilkan tombol peran bawaan. Prompt lengkap
// ada di server (aiPeran.js) - di sini hanya label untuk UI.
const PERAN_BAWAAN = [
  { id: 'umum', label: 'Analis Umum', emoji: '📊', deskripsi: 'Analisis data NEXO biasa.' },
  { id: 'bug', label: 'Bug Hunter', emoji: '🐛', deskripsi: 'Cari bug, race condition, dead code.' },
  { id: 'security', label: 'Cyber Security', emoji: '🛡️', deskripsi: 'Audit keamanan: injection, auth, kredensial.' },
  { id: 'exploit', label: 'Exploit Ekonomi', emoji: '💰', deskripsi: 'Cari celah curang & duplikasi reward.' },
  { id: 'analyst', label: 'System Analyst', emoji: '⚙️', deskripsi: 'Arsitektur, performa, modularitas.' },
];

export default function PilihPeran({ peran = [], nilai, onPilih, disabled, adaKodeBase }) {
  // Pakai peran dari server kalau ada; kalau kosong pakai bawaan.
  const daftar = peran.length ? peran : PERAN_BAWAAN;
  const terpilih = daftar.find((p) => p.id === nilai) || daftar[0];
  const peranButuhKode = nilai && nilai !== 'umum';

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint">Peran AI</span>
        {daftar.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onPilih(p.id)}
            title={p.deskripsi}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
              nilai === p.id
                ? 'border-accent bg-accent/15 text-ink'
                : 'border-border-soft bg-bg-soft text-ink-muted hover:border-accent/60 hover:text-ink'
            }`}
          >
            {p.emoji} {p.label}
          </button>
        ))}
      </div>
      {terpilih?.deskripsi && (
        <p className="mt-1 text-[0.7rem] text-ink-muted">{terpilih.deskripsi}</p>
      )}
      {/* Peringatan: peran teknis butuh ringkasan kode dari bot. */}
      {peranButuhKode && !adaKodeBase && (
        <p className="mt-1.5 rounded-lg bg-danger/10 px-2.5 py-1 text-[0.7rem] font-semibold text-danger">
          Peran ini butuh kode base dari bot, tapi bot belum mengirimnya. Pastikan bot versi terbaru &amp; bridge aktif (restart bot).
        </p>
      )}
    </div>
  );
}

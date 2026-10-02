'use client';

// ==========================================
// PilihPeran - pemilih peran AI (komponen modular)
// ==========================================
//
// Permintaan pemilik 2026-10-02: AI punya "role" - bug hunter, cyber security,
// exploit ekonomi, system analyst - masing-masing dengan prompt khusus.
// Komponen ini HANYA menampilkan pilihan peran; logika prompt ada di server
// (app/lib/aiPeran.js). Dipisah supaya AnalisisAI.jsx tidak makin panjang.

// Fallback: kalau server tidak mengirim daftar peran (mis. /ai gagal), tetap
// tampilkan tombol peran. Sumber TUNGGAL: aiPeranKlien.js (modular, tidak
// duplikat definisi).
import { daftarPeranKlien } from '../../lib/aiPeranKlien';

export default function PilihPeran({ peran = [], nilai, onPilih, disabled, adaKodeBase }) {
  // Pakai peran dari server kalau ada; kalau kosong pakai fallback klien.
  const daftar = peran.length ? peran : daftarPeranKlien();
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
            {p.label}
          </button>
        ))}
      </div>
      {terpilih?.deskripsi && (
        <p className="mt-1 text-[0.7rem] text-ink-muted">{terpilih.deskripsi}</p>
      )}
      {/* Info ringkas: apakah kode base sudah terkirim dari bot. */}
      {peranButuhKode && (
        <p className={`mt-1 text-[0.7rem] ${adaKodeBase ? 'text-success' : 'text-ink-faint'}`}>
          {adaKodeBase ? '✓ Kode base terkirim dari bot.' : '⚠ Kode base belum ada - peran ini butuh restart bot. Peran lain tetap jalan.'}
        </p>
      )}
    </div>
  );
}

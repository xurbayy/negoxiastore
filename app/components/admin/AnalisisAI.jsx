'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ==========================================
// AnalisisAI - tab asisten data di panel admin
// ==========================================
//
// Dua cara pakai:
//   1. Tombol pintas - pertanyaan siap pakai (promo, item sepi, retensi, dst)
//   2. Chat bebas   - tanya apa saja tentang data snapshot
//
// Kunci Groq TIDAK ada di sini. Komponen ini hanya memanggil
// /api/admin/ai, dan server yang meneruskan ke Groq. Jadi kunci tidak
// pernah ikut ke browser.

// Catatan: teks jawaban AI sengaja dirender sebagai TEKS BIASA, bukan HTML.
// AI bisa saja menghasilkan markup; menampilkannya sebagai teks menutup
// celah penyisipan HTML tanpa perlu sanitasi tambahan.

// ==========================================
// Perapian tampilan jawaban AI
// ==========================================
//
// KENAPA DI SINI, BUKAN CUMA DI PROMPT:
//   Prompt sudah melarang tabel markdown dan emoji, TAPI model tetap
//   menghasilkannya (diuji: tabel penuh + penanda **tebal**). Model tidak bisa
//   diandalkan untuk patuh pada aturan format, jadi bentuk akhirnya dirapikan
//   di sisi tampilan - lapisan yang kita kendalikan penuh.
//
// Yang dibuang: penanda tebal **, garis pemisah --- , dan tabel markdown
//   (baris tabel diubah jadi "sel1 | sel2 | sel3" yang tetap terbaca).
// Ini BUKAN penyaringan HTML (jawaban tetap dirender sebagai teks), hanya
// perapian penanda markdown supaya tidak tampil sebagai simbol mentah.

function rapikan(teks) {
  const baris = String(teks).replace(/\r/g, '').split('\n');
  const keluaran = [];

  for (const b of baris) {
    const t = b.trim();

    // Baris pemisah tabel markdown (|---|---|) -> buang.
    if (/^\|?[\s:|-]+\|[\s:|-]*$/.test(t) && t.includes('-')) continue;

    // Baris tabel: mulai dengan | atau punya >=2 pemisah |
    if (t.startsWith('|') || (t.match(/\|/g) || []).length >= 2) {
      // Buang pipa di ujung, rapikan jadi pemisah tunggal.
      const sel = t.replace(/^\||\|$/g, '').split('|')
        .map((s) => s.replace(/\*\*/g, '').trim())
        .filter(Boolean);
      if (sel.length) keluaran.push(sel.join('  |  '));
      continue;
    }

    // Baris kosong setelah tabel -> tetap jadi pemisah.
    if (!t) { keluaran.push(''); continue; }

    // Garis pemisah horizontal -> jadikan baris kosong.
    if (/^-{3,}$/.test(t)) { keluaran.push(''); continue; }

    // Buang penanda tebal/miring; simpan teksnya.
    keluaran.push(
      b
        .replace(/\*\*(.+?)\*\*/g, '$1')   // **tebal** -> tebal
        .replace(/\*(.+?)\*/g, '$1')       // *miring* -> miring
        .replace(/`/g, '')                    // `kode` -> kode
        .replace(/^\s*[-*]\s+/, '- ')        // penanda butir -> tanda hubung biasa
        // En dash / em dash dari model -> tanda hubung biasa (aturan #24).
        .replace(/[–—]/g, '-')
    );
  }

  return keluaran.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function Paragraf({ teks }) {
  // Pisah per baris supaya daftar bernomor dari AI tetap terbaca tanpa
  // perlu merender markdown (lebih aman dan lebih sederhana).
  const baris = rapikan(teks).split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-ink whitespace-pre-wrap">
      {baris.map((b, i) => {
        if (!b.trim()) return <div key={i} className="h-2" />;
        // Judul bagian yang ditulis KAPITAL diikuti titik dua -> tebalkan.
        const judul = /^(TEMUAN|SARAN|RISIKO|CATATAN|KESIMPULAN)\b/.test(b.trim());
        // Baris berisi sel tabel yang sudah dirapikan -> font mono supaya
        // kolomnya tetap sejajar.
        const barisTabel = b.includes('  |  ');
        return (
          <p
            key={i}
            className={judul ? 'font-display font-bold text-ink' : barisTabel ? 'font-mono text-xs text-ink-muted' : ''}
          >
            {b}
          </p>
        );
      })}
    </div>
  );
}

export default function AnalisisAI() {
  const [status, setStatus] = useState(null); // { aktif, jumlahKunci, model, pintasan }
  const [memuatStatus, setMemuatStatus] = useState(true);
  const [jalan, setJalan] = useState(false);
  const [tanya, setTanya] = useState('');
  const [riwayat, setRiwayat] = useState([]); // { judul, jawaban } | { judul, error }
  const kotakHasil = useRef(null);

  // Ambil status kesiapan sekali (tanpa memanggil Groq).
  useEffect(() => {
    let batal = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/ai', { cache: 'no-store' });
        const d = await res.json();
        if (!batal) setStatus(d);
      } catch {
        if (!batal) setStatus({ ok: false, aktif: false });
      } finally {
        if (!batal) setMemuatStatus(false);
      }
    })();
    return () => { batal = true; };
  }, []);

  const jalankan = useCallback(async (muatan, judul) => {
    setJalan(true);
    try {
      const res = await fetch('/api/admin/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(muatan),
      });
      const d = await res.json();
      if (!d.ok) {
        setRiwayat((r) => [{ judul, error: d.error + (d.petunjuk ? ' ' + d.petunjuk : '') }, ...r]);
      } else {
        setRiwayat((r) => [{
          judul,
          jawaban: d.jawaban,
          // Info teknis (nama model, kunci ke berapa, panjang konteks) SENGAJA
          // tidak ditampilkan - itu urusan internal, bukan informasi untuk
          // pemakai panel.
        }, ...r]);
      }
    } catch (e) {
      setRiwayat((r) => [{ judul, error: 'Gagal menghubungi server: ' + e.message }, ...r]);
    } finally {
      setJalan(false);
      // Gulir ke hasil terbaru supaya jawaban langsung terlihat.
      setTimeout(() => kotakHasil.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 100);
    }
  }, []);

  const kirimBebas = (e) => {
    e.preventDefault();
    const t = tanya.trim();
    if (!t || jalan) return;
    setTanya('');
    jalankan({ tanya: t }, t.length > 60 ? t.slice(0, 60) + '...' : t);
  };

  if (memuatStatus) {
    return (
      <div className="nx-card px-6 py-10 text-center text-sm text-ink-muted">
        <span className="pulse-dot" aria-hidden="true" /> Memeriksa kesiapan AI...
      </div>
    );
  }

  if (!status?.aktif) {
    return (
      <div className="nx-card px-6 py-8">
        <h3 className="font-display text-ink">Analisis AI belum aktif</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Isi <strong className="text-ink">GROQ_API_KEY</strong> di environment
          (Vercel &gt; Settings &gt; Environment Variables), lalu deploy ulang.
          Bisa lebih dari satu kunci dipisah koma supaya otomatis pindah saat
          satu kena batas kuota.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Kepala */}
      <div className="nx-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-ink">Analisis AI</h3>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
          AI membaca seluruh data snapshot bot (server, game, toko, ekonomi, misi,
          promo) lalu memberi temuan dan saran. Angka yang tidak ada di data tidak
          akan dikarang.
        </p>
      </div>

      {/* Tombol pintas */}
      <div className="nx-card px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Analisis Cepat</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(status.pintasan || []).map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={jalan}
              onClick={() => jalankan({ pintasan: p.id }, p.label)}
              className="rounded-full border border-border-soft bg-bg-soft px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Chat bebas */}
        <form onSubmit={kirimBebas} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={tanya}
            onChange={(e) => setTanya(e.target.value)}
            placeholder="Atau tanya apa saja tentang data, mis. kenapa guild cuma 1?"
            aria-label="Pertanyaan bebas tentang data"
            className="w-full rounded-xl border border-border-soft bg-card-cream px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <button
            type="submit"
            disabled={jalan || !tanya.trim()}
            className="btn-primary shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jalan ? 'Menganalisis...' : 'Tanya AI'}
          </button>
        </form>
        {jalan && (
          <p className="mt-2 text-xs text-ink-muted">
            <span className="pulse-dot" aria-hidden="true" /> AI sedang membaca data, bisa 5-30 detik.
          </p>
        )}
      </div>

      {/* Hasil */}
      <div ref={kotakHasil} className="scroll-mt-4 space-y-4" />
      {riwayat.length === 0 && !jalan && (
        <div className="nx-card px-5 py-8 text-center text-sm text-ink-muted">
          Belum ada analisis. Klik salah satu tombol di atas untuk mulai.
        </div>
      )}
      {riwayat.map((r, i) => (
        <div key={i} className="nx-card px-5 py-4">
          <div className="mb-2 flex items-center gap-2 border-b border-border-soft pb-2">
            <span className="font-display text-sm font-bold text-ink">{r.judul}</span>
            {r.info && <span className="ml-auto text-[0.65rem] text-ink-faint">{r.info}</span>}
          </div>
          {r.error ? (
            <p className="text-sm text-danger">{r.error}</p>
          ) : (
            <Paragraf teks={r.jawaban} />
          )}
        </div>
      ))}
    </div>
  );
}

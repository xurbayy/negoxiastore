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

  // ==========================================
  // CHAT 2 ARAH (permintaan pemilik 2026-10-01)
  // ==========================================
  // Sebelumnya panel ini hanya "tanya sekali lalu tampil hasil" - tidak bisa
  // dilanjutkan. Sekarang berbentuk PERCAKAPAN: pesan pemilik dan balasan AI
  // tampil sebagai gelembung bergantian, dan pertanyaan lanjutan ("yang tadi
  // itu kenapa?") tetap nyambung karena riwayatnya dikirim ke AI.
  //
  // Struktur satu pesan: { peran: 'gw' | 'ai', isi, waktu, error? }
  // ==========================================
  // MODE: analisis (searah) vs diskusi (chat 2 arah)
  // ==========================================
  // Permintaan pemilik: "pertahankan metode yang tadi juga jadi ada 2, gw mau
  // pake basisnya chat seperti GPT atau yang cuma searah doang - karena
  // keunggulannya kalo searah itu dia bakal ngasih tau temuan saran resiko,
  // nah kalo yang chat buat gw diskusi kedepannya bakal gimana".
  //
  // Keduanya berbasis DATA yang sama; mode hanya mengubah BENTUK jawaban.
  const [mode, setMode] = useState('analisis');

  // Percakapan mode DISKUSI (chat 2 arah): daftar pesan bergantian.
  // Struktur satu pesan: { peran: 'gw' | 'ai', isi, waktu, error? }
  //
  // CATATAN (fix 2026-10-01): deklarasi ini SEMPAT HILANG saat menambahkan
  // mode kedua - akibatnya halaman AI crash total ("Ada yang error di halaman
  // ini") karena `pesan` dipakai di banyak tempat tapi tidak pernah
  // dideklarasikan. Build tetap lolos karena JS menganggapnya variabel global
  // yang tidak ada; errornya baru muncul saat runtime.
  const [pesan, setPesan] = useState([]);

  // Hasil mode ANALISIS (searah): daftar laporan TEMUAN/SARAN/RISIKO.
  // Terpisah dari `pesan` supaya dua mode tidak saling mengotori tampilan.
  const [laporan, setLaporan] = useState([]);
  const [bukaLaporan, setBukaLaporan] = useState(null); // indeks laporan yang dibuka
  // ARSIP JAWABAN: jawaban bagus bisa DISIMPAN dan DIHAPUS.
  const [arsip, setArsip] = useState([]);
  const [disimpan, setDisimpan] = useState(() => new Set());
  const [bukaArsip, setBukaArsip] = useState(false);
  const [pesanSimpan, setPesanSimpan] = useState(null);
  // PENGINGAT (permintaan pemilik 2026-10-01): AI bisa menyimpan pengingat
  // ("ingetin gw pas Halloween mau masang promo"), dan panel menampilkannya
  // sebagai notifikasi sampai ditandai selesai.
  const [pengingat, setPengingat] = useState([]);
  const kotakHasil = useRef(null);
  const ujungChat = useRef(null);

  // Muat percakapan terakhir dari localStorage supaya TIDAK HILANG saat
  // refresh - perilaku yang diharapkan dari sebuah chat.
  useEffect(() => {
    try {
      const simpan = window.localStorage.getItem('nexo_ai_chat');
      if (simpan) {
        const arr = JSON.parse(simpan);
        if (Array.isArray(arr)) setPesan(arr.slice(-40));
      }
    } catch { /* data rusak / localStorage diblokir - mulai dari kosong */ }
  }, []);

  // Simpan tiap kali percakapan berubah.
  useEffect(() => {
    try { window.localStorage.setItem('nexo_ai_chat', JSON.stringify(pesan.slice(-40))); } catch { /* penuh/diblokir */ }
  }, [pesan]);

  // Muat daftar arsip saat komponen dibuka.
  const muatArsip = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai/notes', { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) setArsip(d.notes || []);
    } catch { /* gagal muat arsip tidak boleh menghalangi pemakaian AI */ }
  }, []);

  useEffect(() => { muatArsip(); }, [muatArsip]);

  // Muat daftar pengingat + perbarui tiap 60 detik supaya penanda "jatuh tempo"
  // ikut hidup tanpa pemilik perlu refresh halaman.
  const muatPengingat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai/reminders', { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) setPengingat(d.reminders || []);
    } catch { /* gagal muat pengingat tidak menghalangi pemakaian AI */ }
  }, []);

  useEffect(() => {
    muatPengingat();
    const iv = setInterval(muatPengingat, 60000);
    return () => clearInterval(iv);
  }, [muatPengingat]);

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

  // Kirim satu permintaan. `muatan` = { tanya } atau { pintasan }.
  // Di mode DISKUSI riwayat percakapan ikut dikirim supaya AI nyambung.
  // Di mode ANALISIS jawaban disimpan sebagai laporan (bukan gelembung chat).
  const jalankan = useCallback(async (muatan, judul, teksTampil) => {
    setJalan(true);
    const modeKirim = mode;

    // Ambil riwayat SEBELUM pesan baru ditambahkan.
    const riwayatKirim = [];
    setPesan((p) => {
      for (const m of p.slice(-12)) riwayatKirim.push({ role: m.peran === 'ai' ? 'ai' : 'gw', isi: m.isi });
      return p;
    });

    if (modeKirim === 'diskusi') {
      // Tampilkan pesan pemilik lebih dulu supaya terasa responsif.
      setPesan((p) => [...p, { peran: 'gw', isi: teksTampil || judul, waktu: Date.now() }]);
    }

    try {
      const res = await fetch('/api/admin/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...muatan, mode: modeKirim, riwayat: riwayatKirim }),
      });
      const d = await res.json();

      // Kalau AI membuat pengingat, tampilkan konfirmasi + muat ulang daftar.
      if (d.ok && d.pengingat) {
        setPesanSimpan('Pengingat dibuat: ' + (d.pengingat.waktuTeks || ''));
        muatPengingat();
        setTimeout(() => setPesanSimpan(null), 6000);
      }

      if (modeKirim === 'diskusi') {
        if (!d.ok) {
          setPesan((p) => [...p, {
            peran: 'ai', error: true, waktu: Date.now(),
            isi: d.error + (d.petunjuk ? ' ' + d.petunjuk : ''),
          }]);
        } else {
          setPesan((p) => [...p, { peran: 'ai', isi: d.jawaban, waktu: Date.now(), pertanyaan: muatan?.tanya || judul }]);
        }
      } else {
        // Mode analisis: simpan sebagai laporan terpisah.
        setLaporan((l) => [{
          judul,
          jawaban: d.ok ? d.jawaban : null,
          error: d.ok ? null : d.error + (d.petunjuk ? ' ' + d.petunjuk : ''),
          pertanyaan: muatan?.tanya || muatan?.pintasan || judul,
          sumber: muatan?.pintasan ? 'pintasan:' + muatan.pintasan : 'analisis',
          waktu: Date.now(),
        }, ...l]);
        setBukaLaporan(0);
      }
    } catch (e) {
      if (modeKirim === 'diskusi') {
        setPesan((p) => [...p, { peran: 'ai', error: true, isi: 'Gagal menghubungi server: ' + e.message, waktu: Date.now() }]);
      } else {
        setLaporan((l) => [{ judul, error: 'Gagal menghubungi server: ' + e.message, waktu: Date.now() }, ...l]);
      }
    } finally {
      setJalan(false);
      setTimeout(() => {
        if (modeKirim === 'diskusi') ujungChat.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
        else kotakHasil.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 80);
    }
  }, [mode]);

  const kirimBebas = (e) => {
    e.preventDefault();
    const t = tanya.trim();
    if (!t || jalan) return;
    setTanya('');
    jalankan({ tanya: t }, t.length > 60 ? t.slice(0, 60) + '...' : t, t);
  };

  // Hapus SELURUH percakapan dan mulai dari nol (seperti "New chat" ChatGPT).
  const mulaiBaru = useCallback(() => {
    setPesan([]);
    try { window.localStorage.removeItem('nexo_ai_chat'); } catch { /* abaikan */ }
  }, []);

  // ==========================================
  // PENGINGAT: tandai selesai / hapus
  // ==========================================
  const tandaiSelesai = useCallback(async (id, selesai = true) => {
    try {
      const res = await fetch(`/api/admin/ai/reminders?id=${id}${selesai ? '' : '&selesai=0'}`, { method: 'PATCH' });
      const d = await res.json();
      if (d.ok) muatPengingat();
    } catch { /* abaikan */ }
  }, [muatPengingat]);

  const hapusPengingat = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/admin/ai/reminders?id=${id}`, { method: 'DELETE' });
      const d = await res.json();
      if (d.ok) setPengingat((p) => p.filter((x) => x.id !== id));
    } catch { /* abaikan */ }
  }, []);

  // ==========================================
  // SIMPAN / HAPUS JAWABAN (permintaan pemilik)
  // ==========================================
  // Kunci identitas untuk menandai "sudah disimpan": judul + awal jawaban.
  // Cukup unik untuk keperluan tampilan, tidak perlu hash.
  const kunciJawaban = (r) => r.judul + '::' + String(r.jawaban || '').slice(0, 80);

  const simpanJawaban = useCallback(async (r) => {
    setPesanSimpan(null);
    try {
      const res = await fetch('/api/admin/ai/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ judul: r.judul, pertanyaan: r.pertanyaan || r.judul, jawaban: r.jawaban, sumber: r.sumber || 'chat' }),
      });
      const d = await res.json();
      if (d.ok) {
        setDisimpan((s) => new Set(s).add(kunciJawaban(r)));
        setPesanSimpan('Jawaban disimpan ke arsip.');
        muatArsip();
      } else {
        setPesanSimpan('Gagal menyimpan: ' + (d.error || 'tidak diketahui'));
      }
    } catch (e) {
      setPesanSimpan('Gagal menyimpan: ' + e.message);
    }
    setTimeout(() => setPesanSimpan(null), 4000);
  }, [muatArsip]);

  const hapusArsip = useCallback(async (id) => {
    try {
      const res = await fetch('/api/admin/ai/notes?id=' + encodeURIComponent(id), { method: 'DELETE' });
      const d = await res.json();
      if (d.ok) {
        setArsip((a) => a.filter((x) => x.id !== id));
        setPesanSimpan('Catatan dihapus.');
      } else {
        setPesanSimpan('Gagal menghapus: catatan tidak ditemukan.');
      }
    } catch (e) {
      setPesanSimpan('Gagal menghapus: ' + e.message);
    }
    setTimeout(() => setPesanSimpan(null), 4000);
  }, []);

  if (memuatStatus) {
    return (
      <div className="nx-card px-6 py-10 text-center text-sm text-ink-muted">
        <span className="pulse-dot" aria-hidden="true" /> Memeriksa kesiapan AI...
      </div>
    );
  }

  if (!status?.aktif) {
    return (
      <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
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
    <div className="space-y-4">
      {/* ==========================================
          NOTIFIKASI PENGINGAT
          ==========================================
          Permintaan pemilik: "AI juga pintar bisa jadi pengingat buat gw,
          jadi pada halaman AI ini ada notif... kalo gw suruh ingetin gw nanti
          pas Halloween soalnya gw mau masang promo".

          Tampil paling atas supaya langsung terlihat saat membuka halaman.
          Pengingat yang sudah jatuh tempo diberi warna berbeda dan tanda
          "SEKARANG" supaya tidak terlewat. */}
      {pengingat.filter((p) => !p.selesai).length > 0 && (
        <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-ink">
              Pengingat
              <span className="ml-2 text-sm font-normal text-ink-muted">
                ({pengingat.filter((p) => !p.selesai).length} aktif)
              </span>
            </h3>
            {pengingat.some((p) => p.jatuhTempo) && (
              <span className="rounded-full bg-danger px-3 py-1 text-[0.7rem] font-bold text-white">
                {pengingat.filter((p) => p.jatuhTempo).length} sudah waktunya!
              </span>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {pengingat.filter((p) => !p.selesai).map((p) => (
              <li
                key={p.id}
                className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3.5 py-3 ${
                  p.jatuhTempo ? 'border-danger/40 bg-danger/8' : 'border-border-soft bg-bg-soft/40'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{p.teks}</p>
                  <p className={`mt-0.5 text-xs ${p.jatuhTempo ? 'font-bold text-danger' : 'text-ink-muted'}`}>
                    {p.jatuhTempo ? 'SEKARANG - ' : ''}{p.waktuTeks}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => tandaiSelesai(p.id, true)}
                    className="rounded-lg border border-success/40 px-2.5 py-1 text-[0.7rem] font-bold text-success transition hover:bg-success/10 cursor-pointer"
                    title="Tandai sudah dikerjakan"
                  >
                    Selesai
                  </button>
                  <button
                    type="button"
                    onClick={() => hapusPengingat(p.id)}
                    className="rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                    title="Hapus pengingat"
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[0.7rem] text-ink-muted">
            Cara membuat: tulis di Diskusi, mis. "ingetin gw pas Halloween mau masang promo". AI akan menyimpannya di sini dengan waktu WIB.
          </p>
        </div>
      )}

      {/* Kepala + PEMILIH MODE */}
      <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-ink">Analisis AI</h3>
          {/* Dua mode dengan keunggulan berbeda (permintaan pemilik):
              - Analisis: laporan tersusun TEMUAN/SARAN/RISIKO
              - Diskusi : chat 2 arah untuk berpikir bersama
              Keduanya memakai DATA yang sama. */}
          <div className="flex rounded-xl border border-border-soft bg-bg-soft/50 p-1">
            {[
              ['analisis', 'Analisis', 'Laporan TEMUAN / SARAN / RISIKO'],
              ['diskusi', 'Diskusi', 'Chat 2 arah, bisa ditanya lanjut'],
            ].map(([id, label, ket]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                title={ket}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                  mode === id ? 'bg-card-cream text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          {mode === 'analisis' ? (
            <>Mode <strong className="text-ink">Analisis</strong>: AI membaca seluruh data bot lalu menyusun laporan TEMUAN, SARAN, dan RISIKO. Cocok untuk keputusan cepat yang butuh pertimbangan risiko.</>
          ) : (
            <>Mode <strong className="text-ink">Diskusi</strong>: ngobrol dua arah dengan AI, bisa ditanya lanjut dan AI ingat percakapan sebelumnya. Cocok untuk membahas arah pengembangan ke depan.</>
          )}
          {' '}Keduanya berbasis data yang sama - angka yang tidak ada di data tidak akan dikarang.
        </p>
      </div>

      {/* ==========================================
          MODE ANALISIS (searah): tombol pintasan + laporan
          ========================================== */}
      {mode === 'analisis' && (
        <>
          <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Analisis Cepat</p>
            {/* Di HP tombol dibuat GRID 2 kolom: label panjang seperti
                "Pertumbuhan Komunitas" jadi tidak memaksa satu baris penuh, dan
                tingginya naik ke 40px supaya nyaman ditekan jari (sebelumnya 30px,
                di bawah ambang nyaman). Di layar lebar kembali ke flex-wrap. */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {(status.pintasan || []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={jalan}
                  onClick={() => jalankan({ pintasan: p.id }, p.label)}
                  className="flex min-h-10 items-center justify-center rounded-full border border-border-soft bg-bg-soft px-3 py-2 text-center text-xs font-semibold leading-tight text-ink transition hover:border-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:justify-start sm:px-3.5 sm:py-1.5 cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {/* Pertanyaan bebas juga bisa - tetap dijawab dengan format
                TEMUAN/SARAN/RISIKO karena modenya 'analisis'. */}
            <form onSubmit={kirimBebas} className="mt-3 flex gap-2">
              <input
                value={tanya}
                onChange={(e) => setTanya(e.target.value)}
                placeholder="Atau tulis topik yang mau dianalisis..."
                aria-label="Topik analisis"
                className="w-full rounded-xl border border-border-soft bg-card-cream px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
              <button
                type="submit"
                disabled={jalan || !tanya.trim()}
                className="btn-primary shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {jalan ? '...' : 'Analisis'}
              </button>
            </form>
          </div>

          {jalan && (
            <div className="nx-card px-4 py-4 sm:px-5 sm:py-5 text-sm text-ink-muted">
              <span className="pulse-dot" aria-hidden="true" /> AI sedang membaca data, bisa 5-30 detik.
            </div>
          )}

          {laporan.length === 0 && !jalan && (
            <div className="nx-card px-4 py-6 sm:px-5 sm:py-8 text-center text-sm text-ink-muted">
              Belum ada analisis. Klik salah satu tombol di atas untuk mulai.
            </div>
          )}

          {laporan.map((r, i) => (
            <div key={i} className="nx-card px-4 py-4 sm:px-5 sm:py-5">
              <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border-soft pb-2">
                <span className="font-display text-sm font-bold text-ink">{r.judul}</span>
                <span className="text-[0.65rem] text-ink-faint">
                  {new Date(r.waktu).toLocaleString('id-ID')}
                </span>
                {!r.error && (
                  <button
                    type="button"
                    onClick={() => simpanJawaban({ judul: r.judul, jawaban: r.jawaban, pertanyaan: r.pertanyaan, sumber: r.sumber })}
                    disabled={disimpan.has(r.judul + '::' + String(r.jawaban || '').slice(0, 80))}
                    className={`ml-auto shrink-0 rounded-lg border px-2.5 py-1 text-[0.7rem] font-bold transition ${
                      disimpan.has(r.judul + '::' + String(r.jawaban || '').slice(0, 80))
                        ? 'border-success/40 bg-success/10 text-success cursor-default'
                        : 'border-border-soft text-ink-muted hover:border-accent/60 hover:text-ink cursor-pointer'
                    }`}
                  >
                    {disimpan.has(r.judul + '::' + String(r.jawaban || '').slice(0, 80)) ? 'Tersimpan' : 'Simpan'}
                  </button>
                )}
              </div>
              {r.error ? (
                <p className="text-sm text-danger">{r.error}</p>
              ) : (
                <Paragraf teks={r.jawaban} />
              )}
            </div>
          ))}
        </>
      )}

      {/* ==========================================
          MODE DISKUSI (chat 2 arah)
          ==========================================
          Pemilik: "kalo yang chat buat gw diskusi kedepannya bakal gimana".
          Pesan pemilik di kanan, balasan AI di kiri. */}
      {mode === 'diskusi' && (
        <>
          <div ref={kotakHasil} className="scroll-mt-4" />
          <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft pb-3">
              <h3 className="font-display text-ink">
                Diskusi {pesan.length > 0 && <span className="text-sm font-normal text-ink-muted">({Math.ceil(pesan.length / 2)} giliran)</span>}
              </h3>
              {pesan.length > 0 && (
                <button
                  type="button"
                  onClick={mulaiBaru}
                  className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
              title="Hapus seluruh percakapan dan mulai dari nol"
            >
              Hapus riwayat / Mulai baru
            </button>
          )}
        </div>

        {pesan.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Mulai percakapan: klik salah satu tombol pintasan di atas, atau ketik pertanyaanmu di kolom bawah.
            Percakapan bisa dilanjutkan berkali-kali dan tidak hilang saat halaman di-refresh.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pesan.map((m, i) => (
              <li key={i} className={`flex ${m.peran === 'gw' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] rounded-2xl px-4 py-2.5 sm:max-w-[80%] ${
                  m.peran === 'gw'
                    ? 'bg-accent/15 text-ink'
                    : m.error
                      ? 'bg-danger/10 text-danger'
                      : 'bg-bg-soft/60 text-ink'
                }`}>
                  <p className="mb-1 text-[0.6rem] font-bold uppercase tracking-widest text-ink-muted">
                    {m.peran === 'gw' ? 'Kamu' : m.error ? 'AI - gagal' : 'AI'}
                    {m.waktu ? ' - ' + new Date(m.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                  {m.error ? (
                    <p className="text-sm">{m.isi}</p>
                  ) : (
                    <Paragraf teks={m.isi} />
                  )}
                  {/* Tombol Simpan hanya pada balasan AI yang berhasil -
                      supaya masukan bagus bisa diarsipkan seperti sebelumnya. */}
                  {m.peran === 'ai' && !m.error && (
                    <button
                      type="button"
                      onClick={() => simpanJawaban({ judul: m.pertanyaan || 'Catatan AI', jawaban: m.isi, pertanyaan: m.pertanyaan, sumber: 'chat' })}
                      disabled={disimpan.has('chat::' + String(m.isi).slice(0, 80))}
                      className={`mt-2 rounded-lg border px-2.5 py-1 text-[0.68rem] font-bold transition ${
                        disimpan.has('chat::' + String(m.isi).slice(0, 80))
                          ? 'border-success/40 bg-success/10 text-success cursor-default'
                          : 'border-border-soft text-ink-muted hover:border-accent/60 hover:text-ink cursor-pointer'
                      }`}
                    >
                      {disimpan.has('chat::' + String(m.isi).slice(0, 80)) ? 'Tersimpan di arsip' : 'Simpan ke arsip'}
                    </button>
                  )}
                </div>
              </li>
            ))}
            {jalan && (
              <li className="flex justify-start">
                <div className="rounded-2xl bg-bg-soft/60 px-4 py-2.5 text-sm text-ink-muted">
                  <span className="pulse-dot" aria-hidden="true" /> AI sedang membaca data, bisa 5-30 detik...
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={ujungChat} />
      </div>

      {/* KOLOM KETIK di bawah percakapan - seperti ChatGPT.
          Ditaruh setelah kartu percakapan supaya alurnya: baca dulu, balas
          di bawah. Tetap satu baris dengan tombol kirim di kanan. */}
      <form onSubmit={kirimBebas} className="sticky bottom-4 z-10 flex gap-2 rounded-2xl border border-border-soft bg-card-cream p-2 shadow-[0_8px_28px_rgba(43,33,24,0.12)]">
        <input
          value={tanya}
          onChange={(e) => setTanya(e.target.value)}
          placeholder="Ketik pertanyaanmu... (bisa lanjut tanya jawaban sebelumnya)"
          aria-label="Pertanyaan bebas tentang data"
          className="w-full rounded-xl bg-transparent px-3 py-2 text-sm text-ink outline-none"
        />
        <button
          type="submit"
          disabled={jalan || !tanya.trim()}
          className="btn-primary shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {jalan ? '...' : 'Kirim'}
        </button>
      </form>
        </>
      )}

      {/* ==========================================
          ARSIP JAWABAN TERSIMPAN
          ==========================================
          Permintaan pemilik: "jawaban AI bisa gw simpan bisa gw hapus,
          jadi bisa aja ada masukkan bagus gw simpan jadi jawabannya selalu
          ada, bisa juga dihapus kalo udah ga relevan". */}
      <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-ink">
            Arsip Jawaban {arsip.length > 0 && <span className="text-sm font-normal text-ink-muted">({arsip.length})</span>}
          </h3>
          {arsip.length > 0 && (
            <button
              type="button"
              onClick={() => setBukaArsip((v) => !v)}
              className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-accent/50 hover:text-ink cursor-pointer"
            >
              {bukaArsip ? 'Sembunyikan' : 'Tampilkan'}
            </button>
          )}
        </div>

        {pesanSimpan && <p className="mt-2 text-xs font-semibold text-success">{pesanSimpan}</p>}

        {arsip.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            Belum ada jawaban tersimpan. Klik "Simpan" pada jawaban yang berguna - catatannya akan tersimpan di sini dan bisa dibaca kapan saja.
          </p>
        ) : bukaArsip ? (
          <ul className="mt-3 space-y-3">
            {arsip.map((a) => (
              <li key={a.id} className="rounded-xl border border-border-soft bg-bg-soft/40 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink" title={a.judul}>{a.judul}</p>
                    <p className="mt-0.5 text-[0.65rem] text-ink-faint">
                      {new Date(a.createdAt).toLocaleString('id-ID')} {a.sumber ? '- ' + a.sumber : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => hapusArsip(a.id)}
                    className="shrink-0 rounded-lg border border-danger/40 px-2.5 py-1 text-[0.7rem] font-bold text-danger transition hover:bg-danger/10 cursor-pointer"
                    title="Hapus catatan ini"
                  >
                    Hapus
                  </button>
                </div>
                {a.pertanyaan && <p className="mt-2 text-xs italic text-ink-muted">Tanya: {a.pertanyaan}</p>}
                <div className="mt-2">
                  <Paragraf teks={a.jawaban} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-ink-muted">{arsip.length} catatan tersimpan. Klik "Tampilkan" untuk membacanya.</p>
        )}
      </div>
    </div>
  );
}

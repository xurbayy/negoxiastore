'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmModal from './ConfirmModal';

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

// Baca satu file gambar -> data URL, dengan resize di klien supaya payload
// tidak membengkak (maks panjang sisi 1280px, JPEG kualitas 0.8).
function bacaGambar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith('image/')) return reject(new Error('Bukan gambar.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gambar tidak bisa dibaca.'));
      img.onload = () => {
        const maks = 1280;
        let { width: w, height: h } = img;
        if (w > maks || h > maks) {
          const skala = Math.min(maks / w, maks / h);
          w = Math.round(w * skala);
          h = Math.round(h * skala);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function AnalisisAI() {
  const [memuatStatus, setMemuatStatus] = useState(true);
  const [jalan, setJalan] = useState(false);
  const [tanya, setTanya] = useState('');
  // Gambar terlampir untuk chat diskusi (data URL). Di-resize di klien supaya
  // ukurannya wajar (permintaan pemilik 2026-10-02: "gw bisa kirim gambar").
  const [gambar, setGambar] = useState([]);

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
  const [mode, setMode] = useState(() => {
    try { return window.localStorage.getItem('nexo_ai_mode') || 'analisis'; } catch { return 'analisis'; }
  });
  // Simpan mode terakhir supaya tidak reset tiap buka panel (mudah diakses).
  useEffect(() => {
    try { window.localStorage.setItem('nexo_ai_mode', mode); } catch { /* abaikan */ }
  }, [mode]);
  // Provider & model AI (toggle di panel admin). Disimpan di localStorage
  // supaya pilihan pemilik tidak reset tiap reload.
  const [provider, setProvider] = useState(() => {
    try { return window.localStorage.getItem('nexo_ai_provider') || ''; } catch { return ''; }
  });
  const [modelInput, setModelInput] = useState(() => {
    try { return window.localStorage.getItem('nexo_ai_model') || ''; } catch { return ''; }
  });

  // ==========================================
  // KELOLA PROVIDER & MODEL (permintaan pemilik 2026-10-02)
  // ==========================================
  // Pemilik bisa menambah provider (nama + URL + API key), menghapusnya, dan
  // menyimpan model (label + nama model + provider) yang bisa diedit/dihapus.
  const [kelola, setKelola] = useState(false);          // panel kelola terbuka?
  const [daftarProvider, setDaftarProvider] = useState([]);
  const [daftarModel, setDaftarModel] = useState([]);
  const [memuatKelola, setMemuatKelola] = useState(false);
  const [pesanKelola, setPesanKelola] = useState(null);
  // Form provider baru.
  const [formProv, setFormProv] = useState({ nama: '', base_url: '', api_key: '' });
  // Form model baru.
  const [formModel, setFormModel] = useState({ label: '', model: '', provider: '', max_tokens: '', kecerdasan: '' });
  // API key yang sedang DILIHAT (per provider id -> teks asli). Kosong = tersamar.
  // Permintaan pemilik 2026-10-02: "api key bisa diliat - ada toggle lihat".
  const [kunciTerlihat, setKunciTerlihat] = useState({});
  // Toggle tampilkan input API key di FORM tambah provider (bukan kunci
  // tersimpan). Default tersembunyi (type=password).
  const [lihatInputKunci, setLihatInputKunci] = useState(false);
  // Hasil validasi model: { status: 'idle'|'cek'|'ada'|'tidak'|'gagal', ... }
  const [cekHasil, setCekHasil] = useState({ status: 'idle' });
  // Hasil tes koneksi provider (form tambah) - validasi URL base + API key.
  const [tesHasil, setTesHasil] = useState({ status: 'idle' });
  // Daftar model provider (permintaan pemilik: tampilkan nama model, filter free).
  const [modelProv, setModelProv] = useState({ status: 'idle', models: [], jumlah: 0, jumlahGratis: 0, hanyaGratis: true });
  // Pengaturan model aktif: max token + kecerdasan (1-10). Diambil dari model
  // tersimpan saat dipilih, atau diubah manual di bar kontrol.
  const [modelSetting, setModelSetting] = useState({ maxTokens: null, kecerdasan: null });
  // Info pemakaian / kuota provider (permintaan pemilik: "tau ini udah limit apa engga").
  const [usage, setUsage] = useState({ status: 'idle' });
  // Mode EDIT: id yang sedang diedit (null = mode tambah). Permintaan pemilik
  // 2026-10-02: "provider model itu ada CRUD-nya semua".
  const [editProvId, setEditProvId] = useState(null);
  const [editModelId, setEditModelId] = useState(null);
  // Modal konfirmasi sendiri (ganti window.confirm bawaan browser yang kuno
  // & tidak konsisten - permintaan pemilik 2026-10-02).
  // Bentuk: { judul, body, onConfirm } | null
  const [konfirmasi, setKonfirmasi] = useState(null);
  const [konfirmasiBusy, setKonfirmasiBusy] = useState(false);

  useEffect(() => {
    try { window.localStorage.setItem('nexo_ai_provider', provider || ''); } catch { /* abaikan */ }
  }, [provider]);
  useEffect(() => {
    try { window.localStorage.setItem('nexo_ai_model', modelInput || ''); } catch { /* abaikan */ }
  }, [modelInput]);

  // Hasil cek model jadi basi begitu provider/model diganti - reset.
  useEffect(() => {
    setCekHasil({ status: 'idle' });
    setModelProv((s) => (s.status === 'ok' ? { ...s, status: 'idle' } : s));
    setUsage({ status: 'idle' });
  }, [provider, modelInput]);

  // Hasil tes koneksi jadi basi begitu form provider diubah - reset.
  useEffect(() => {
    setTesHasil({ status: 'idle' });
  }, [formProv.base_url, formProv.api_key]);

  // Kalau provider tersimpan (localStorage) tidak ada di daftar yang disediakan
  // server (mis. 'custom' sudah dihapus), paksa ke provider aktif server.
  useEffect(() => {
    const daftar = status?.providers || [];
    if (!daftar.length) return;
    const valid = daftar.some((p) => p.id === provider);
    if (!valid && status?.provider) setProvider(status.provider);
  }, [status, provider]);

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
  // Panel pengingat hanya terbuka saat tombol Notif diklik - supaya tidak
  // memakan ruang saat tidak dibutuhkan. Tombolnya sendiri selalu terlihat.
  const [bukaPengingat, setBukaPengingat] = useState(false);
  const kotakHasil = useRef(null);
  const ujungChat = useRef(null);

  // Angka untuk tombol Notif: berapa pengingat aktif & berapa yang sudah
  // jatuh tempo. Dipakai untuk menentukan warna tombol (merah kalau ada).
  const pengingatAktif = pengingat.filter((p) => !p.selesai);
  const jumlahPengingat = pengingatAktif.length;
  const jumlahJatuhTempo = pengingatAktif.filter((p) => p.jatuhTempo).length;

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

  // LAPORAN ANALISIS juga disimpan di localStorage - permintaan pemilik
  // 2026-10-02: "hasil ini kalo refresh ga ilang semua, kecuali gw hapus
  // manual". Simpan berapa pun hasilnya (dibatasi 30 terbaru) supaya tidak
  // membebani localStorage.
  useEffect(() => {
    try {
      const simpan = window.localStorage.getItem('nexo_ai_laporan');
      if (simpan) {
        const arr = JSON.parse(simpan);
        if (Array.isArray(arr)) setLaporan(arr.slice(0, 30));
      }
    } catch { /* data rusak / diblokir - mulai kosong */ }
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem('nexo_ai_laporan', JSON.stringify(laporan.slice(0, 30))); } catch { /* penuh/diblokir */ }
  }, [laporan]);

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
        if (!batal) {
          setStatus(d);
          // Hanya inisialisasi provider/model dari server kalau pemilik belum
          // pernah memilih (localStorage kosong). Jangan timpa pilihan manual.
          try {
            const adaPilihan = window.localStorage.getItem('nexo_ai_provider');
            if (!adaPilihan && d.provider) setProvider(d.provider);
            const adaModel = window.localStorage.getItem('nexo_ai_model');
            if (!adaModel && d.model) setModelInput(d.model);
          } catch {
            if (d.provider) setProvider(d.provider);
            if (d.model) setModelInput(d.model);
          }
        }
      } catch (err) {
        if (!batal) setStatus({ ok: false, aktif: false, errorMuatan: err?.message || String(err) });
      } finally {
        if (!batal) setMemuatStatus(false);
      }
    })();
    return () => { batal = true; };
  }, []);

  // Kirim satu permintaan. `muatan` = { tanya } atau { pintasan }.
  // Di mode DISKUSI riwayat percakapan ikut dikirim supaya AI nyambung.
  // Di mode ANALISIS jawaban disimpan sebagai laporan (bukan gelembung chat).
  //
  // JEDA MINIMUM (fix 2026-10-01): Groq menghitung KUOTA PER MENIT. Dua klik
  // berturut-turut (mis. tombol 'Saran Promo' lalu 'Item & Game Sepi') dalam
  // satu menit akan menghabiskan kuota dan request kedua ditolak dengan
  // 'Request too large'. Diberi jeda 20 detik supaya kuota sempat pulih.
  const [tungguSampai, setTungguSampai] = useState(0);
  const [detikSisa, setDetikSisa] = useState(0);
  // Tick setiap detik selama cooldown supaya tombol menampilkan sisa waktu.
  useEffect(() => {
    if (detikSisa <= 0) return;
    const t = setTimeout(() => setDetikSisa((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [detikSisa]);
  const jalankan = useCallback(async (muatan, judul, teksTampil) => {
    const sisaTunggu = tungguSampai - Date.now();
    if (sisaTunggu > 0) {
      const detik = Math.ceil(sisaTunggu / 1000);
      // Toast tampil di SEMUA mode (pesan chat hanya terlihat di mode Diskusi).
      setPesanSimpan(`⏳ Tunggu ${detik} detik lagi - kuota AI per menit.`);
      setTimeout(() => setPesanSimpan(null), 4000);
      // Mode Diskusi: juga masuk ke chat supaya terlihat di riwayat.
      setPesan((p) => [...p, {
        peran: 'ai', error: true, waktu: Date.now(),
        isi: `Tunggu ${detik} detik lagi ya. Kuota AI dihitung per menit, jadi dua permintaan beruntun bikin yang kedua ditolak.`,
      }]);
      return;
    }
    setTungguSampai(Date.now() + 20000);
    setDetikSisa(20);
    setJalan(true);
    const modeKirim = mode;

    // Ambil riwayat SEBELUM pesan baru ditambahkan.
    const riwayatKirim = [];
    setPesan((p) => {
      for (const m of p.slice(-12)) riwayatKirim.push({ role: m.peran === 'ai' ? 'ai' : 'gw', isi: m.isi });
      return p;
    });

    // Gambar hanya untuk mode DISKUSI (analisis berbasis angka). Ambil snapshot
    // lalu kosongkan supaya tidak ikut terkirim di permintaan berikutnya.
    const gambarKirim = modeKirim === 'diskusi' ? gambar.slice(0, 4) : [];
    if (gambarKirim.length) setGambar([]);

    if (modeKirim === 'diskusi') {
      // Tampilkan pesan pemilik lebih dulu supaya terasa responsif.
      setPesan((p) => [...p, { peran: 'gw', isi: teksTampil || judul, waktu: Date.now(), gambar: gambarKirim }]);
    }

    try {
      // Client-side timeout 45 detik - kalau API stuck (semua kunci rate-limited
      // dan retry satu-satu), user dapat error cepat bukan loading tanpa batas.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 45000);
      const res = await fetch('/api/admin/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...muatan, mode: modeKirim, riwayat: riwayatKirim, provider: provider || undefined, model: modelInput.trim() || undefined, max_tokens: modelSetting.maxTokens || undefined, kecerdasan: modelSetting.kecerdasan || undefined, gambar: gambarKirim.length ? gambarKirim : undefined }),
        signal: ac.signal,
      });
      clearTimeout(timer);
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
            modelDipakai: d.model || d.modelDipaka || null,
            providerDipakai: d.provider || null,
          }]);
        } else {
          setPesan((p) => [...p, {
            peran: 'ai', isi: d.jawaban, waktu: Date.now(),
            pertanyaan: muatan?.tanya || judul,
            // Model & provider aktual - biar terlihat di chat.
            modelDipakai: d.model || null,
            providerDipakai: d.provider || null,
          }]);
        }
      } else {
        // Mode analisis: simpan sebagai laporan terpisah.
        setLaporan((l) => [{
          judul,
          jawaban: d.ok ? d.jawaban : null,
          error: d.ok ? null : d.error + (d.petunjuk ? ' ' + d.petunjuk : ''),
          // Model & provider yang BENAR-BENAR dipakai (dari server, bukan
          // tebakan UI) - supaya terlihat kalau switch gagal.
          modelDipakai: d.model || d.modelDipaka || null,
          providerDipakai: d.provider || null,
          pertanyaan: muatan?.tanya || muatan?.pintasan || judul,
          sumber: muatan?.pintasan ? 'pintasan:' + muatan.pintasan : 'analisis',
          waktu: Date.now(),
        }, ...l]);
        setBukaLaporan(0);
      }
    } catch (e) {
      const pesanError = e?.name === 'AbortError'
        ? 'Timeout 45 detik - AI terlalu lama merespons. Coba lagi atau ganti provider.'
        : 'Gagal menghubungi server: ' + (e?.message || e);
      if (modeKirim === 'diskusi') {
        setPesan((p) => [...p, { peran: 'ai', error: true, isi: pesanError, waktu: Date.now() }]);
      } else {
        setLaporan((l) => [{ judul, error: pesanError, waktu: Date.now() }, ...l]);
      }
    } finally {
      setJalan(false);
      setTimeout(() => {
        if (modeKirim === 'diskusi') ujungChat.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
        else kotakHasil.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 80);
    }
  }, [mode, tungguSampai, provider, modelInput]);

  const kirimBebas = (e) => {
    e.preventDefault();
    const t = tanya.trim();
    // Boleh kirim gambar tanpa teks (pertanyaan default "jelaskan gambar ini").
    if ((!t && gambar.length === 0) || jalan) return;
    setTanya('');
    const teks = t || 'Jelaskan gambar ini dan kaitkan dengan data NEXO kalau relevan.';
    jalankan({ tanya: teks }, teks.length > 60 ? teks.slice(0, 60) + '...' : teks, teks);
  };

  // Hapus SELURUH percakapan dan mulai dari nol (seperti "New chat" ChatGPT).
  const mulaiBaru = useCallback(() => {
    setKonfirmasi({
      judul: 'Hapus riwayat diskusi?',
      body: 'Seluruh percakapan akan dihapus permanen dari panel ini.',
      jalankan: async () => {
        setPesan([]);
        try { window.localStorage.removeItem('nexo_ai_chat'); } catch { /* abaikan */ }
      },
    });
  }, []);

  // Hapus SELURUH laporan analisis (permintaan pemilik: bisa hapus manual).
  const hapusSemuaLaporan = useCallback(() => {
    setKonfirmasi({
      judul: 'Hapus riwayat analisis?',
      body: `Semua ${laporan.length} laporan analisis akan dihapus permanen dari panel ini.`,
      jalankan: async () => {
        setLaporan([]);
        setBukaLaporan(null);
        try { window.localStorage.removeItem('nexo_ai_laporan'); } catch { /* abaikan */ }
      },
    });
  }, [laporan.length]);

  // Hapus SATU laporan.
  const hapusLaporan = useCallback((idx) => {
    setLaporan((l) => l.filter((_, i) => i !== idx));
    setBukaLaporan(null);
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
    const p = pengingat.find((x) => x.id === id);
    setKonfirmasi({
      judul: 'Hapus pengingat ini?',
      body: `Pengingat "${p?.teks || ''}" akan dihapus.`,
      jalankan: async () => {
        const res = await fetch(`/api/admin/ai/reminders?id=${id}`, { method: 'DELETE' });
        const d = await res.json();
        if (d.ok) setPengingat((x) => x.filter((y) => y.id !== id));
      },
    });
  }, [pengingat]);

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
    const a = arsip.find((x) => x.id === id);
    setKonfirmasi({
      judul: 'Hapus catatan ini?',
      body: `Catatan "${a?.judul || ''}" akan dihapus dari arsip jawaban.`,
      jalankan: async () => {
        const res = await fetch('/api/admin/ai/notes?id=' + encodeURIComponent(id), { method: 'DELETE' });
        const d = await res.json();
        if (d.ok) {
          setArsip((x) => x.filter((y) => y.id !== id));
          setPesanSimpan('Catatan dihapus.');
        } else {
          setPesanSimpan('Gagal menghapus: catatan tidak ditemukan.');
        }
        setTimeout(() => setPesanSimpan(null), 4000);
      },
    });
  }, [arsip]);

  // ==========================================
  // KELOLA PROVIDER & MODEL - muat, tambah, edit, hapus
  // ==========================================
  const flashKelola = (teks) => {
    setPesanKelola(teks);
    setTimeout(() => setPesanKelola(null), 5000);
  };

  const muatKelola = useCallback(async () => {
    setMemuatKelola(true);
    try {
      const res = await fetch('/api/admin/ai/providers', { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) {
        setDaftarProvider(d.providers || []);
        setDaftarModel(d.models || []);
      } else {
        flashKelola('Gagal memuat: ' + (d.error || 'tidak diketahui'));
      }
    } catch (e) {
      flashKelola('Gagal memuat: ' + e.message);
    } finally {
      setMemuatKelola(false);
    }
  }, []);

  // Muat ulang daftar status (provider bawaan + kustom + model) supaya toggle
  // langsung menampilkan provider baru tanpa refresh halaman.
  const muatStatusUlang = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai', { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) setStatus(d);
    } catch { /* abaikan */ }
  }, []);

  const simpanProvider = useCallback(async () => {
    if (!formProv.nama.trim() || !formProv.base_url.trim()) {
      flashKelola('Nama dan URL wajib diisi.');
      return;
    }
    const modeEdit = Boolean(editProvId);
    try {
      const res = await fetch('/api/admin/ai/providers' + (modeEdit ? '?id=' + editProvId : ''), {
        method: modeEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipe: 'provider', ...formProv }),
      });
      const d = await res.json();
      if (d.ok) {
        setFormProv({ nama: '', base_url: '', api_key: '' });
        setEditProvId(null);
        flashKelola(modeEdit ? 'Provider diperbarui.' : 'Provider ditambahkan.');
        await Promise.all([muatKelola(), muatStatusUlang()]);
      } else {
        flashKelola('Gagal: ' + (d.error || 'tidak diketahui'));
      }
    } catch (e) { flashKelola('Gagal: ' + e.message); }
  }, [formProv, editProvId, muatKelola, muatStatusUlang]);

  // Isi form dengan data provider yang mau diedit. Field key dikosongkan -
  // kosong = jangan ubah kunci lama (dijaga di PATCH).
  const mulaiEditProvider = useCallback((p) => {
    setEditProvId(p.id);
    setFormProv({ nama: p.nama, base_url: p.baseUrl, api_key: '' });
    setTesHasil({ status: 'idle' });
  }, []);

  const batalEditProvider = useCallback(() => {
    setEditProvId(null);
    setFormProv({ nama: '', base_url: '', api_key: '' });
    setTesHasil({ status: 'idle' });
  }, []);

  const hapusProvider = useCallback(async (id) => {
    const p = daftarProvider.find((x) => x.id === id);
    setKonfirmasi({
      judul: 'Hapus provider ini?',
      body: `Provider "${p?.nama || ''}" akan dihapus permanen. Model yang memakainya perlu diubah manual.`,
      jalankan: async () => {
        const res = await fetch('/api/admin/ai/providers?id=' + id, { method: 'DELETE' });
        const d = await res.json();
        if (d.ok) { flashKelola('Provider dihapus.'); await Promise.all([muatKelola(), muatStatusUlang()]); }
        else flashKelola('Gagal: ' + (d.error || 'tidak diketahui'));
      },
    });
  }, [daftarProvider, muatKelola, muatStatusUlang]);

  const simpanModel = useCallback(async () => {
    if (!formModel.label.trim() || !formModel.model.trim() || !formModel.provider.trim()) {
      flashKelola('Label, model, dan provider wajib diisi.');
      return;
    }
    const modeEdit = Boolean(editModelId);
    try {
      const res = await fetch('/api/admin/ai/providers' + (modeEdit ? '?id=' + editModelId : ''), {
        method: modeEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipe: 'model', ...formModel }),
      });
      const d = await res.json();
      if (d.ok) {
        setFormModel({ label: '', model: '', provider: '', max_tokens: '', kecerdasan: '' });
        setEditModelId(null);
        flashKelola(modeEdit ? 'Model diperbarui.' : 'Model disimpan.');
        await Promise.all([muatKelola(), muatStatusUlang()]);
      } else flashKelola('Gagal: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flashKelola('Gagal: ' + e.message); }
  }, [formModel, editModelId, muatKelola, muatStatusUlang]);

  const mulaiEditModel = useCallback((m) => {
    setEditModelId(m.id);
    setFormModel({
      label: m.label, model: m.model, provider: m.provider,
      max_tokens: m.maxTokens == null ? '' : String(m.maxTokens),
      kecerdasan: m.kecerdasan == null ? '' : String(m.kecerdasan),
    });
  }, []);

  const batalEditModel = useCallback(() => {
    setEditModelId(null);
    setFormModel({ label: '', model: '', provider: '', max_tokens: '', kecerdasan: '' });
  }, []);

  const hapusModel = useCallback(async (id) => {
    const m = daftarModel.find((x) => x.id === id);
    setKonfirmasi({
      judul: 'Hapus model ini?',
      body: `Model "${m?.label || ''}" (${m?.model || ''}) akan dihapus dari daftar tersimpan.`,
      jalankan: async () => {
        const res = await fetch('/api/admin/ai/providers?id=' + id + '&tipe=model', { method: 'DELETE' });
        const d = await res.json();
        if (d.ok) { flashKelola('Model dihapus.'); await Promise.all([muatKelola(), muatStatusUlang()]); }
        else flashKelola('Gagal: ' + (d.error || 'tidak diketahui'));
      },
    });
  }, [daftarModel, muatKelola, muatStatusUlang]);

  // Jalankan aksi konfirmasi lalu tutup modal.
  const jalankanKonfirmasi = useCallback(async () => {
    if (!konfirmasi) return;
    setKonfirmasiBusy(true);
    try { await konfirmasi.jalankan(); }
    catch (e) { flashKelola('Gagal: ' + e.message); }
    finally { setKonfirmasiBusy(false); setKonfirmasi(null); }
  }, [konfirmasi]);

  // Pakai model tersimpan: isi provider + model + pengaturan (max token,
  // kecerdasan) di bar kontrol atas.
  const pakaiModel = useCallback((m) => {
    setProvider(m.provider);
    setModelInput(m.model);
    setModelSetting({ maxTokens: m.maxTokens, kecerdasan: m.kecerdasan });
    flashKelola(`Dipakai: ${m.label}`);
  }, []);

  // Toggle lihat/sembunyikan API key satu provider. Kunci asli diambil
  // sekali dari server (endpoint ?reveal=ID) lalu di-cache di state.
  const toggleLihatKunci = useCallback(async (id) => {
    if (kunciTerlihat[id]) {
      // Sedang terlihat -> sembunyikan (hapus dari cache).
      setKunciTerlihat((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const res = await fetch('/api/admin/ai/providers?reveal=' + id, { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) {
        setKunciTerlihat((s) => ({ ...s, [id]: d.apiKey || '(kosong)' }));
      } else {
        flashKelola('Gagal lihat kunci: ' + (d.error || 'tidak diketahui'));
      }
    } catch (e) { flashKelola('Gagal lihat kunci: ' + e.message); }
  }, [kunciTerlihat]);

  // Cek apakah model benar-benar ada di provider yang dipilih.
  // Tes koneksi provider (sebelum simpan): validasi URL base + API key.
  const tesKoneksiProv = useCallback(async () => {
    setTesHasil({ status: 'cek' });
    try {
      const res = await fetch('/api/admin/ai/tes-koneksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formProv),
      });
      const d = await res.json();
      if (d.ok) setTesHasil({ status: 'ok', pesan: d.pesan, url: d.urlDicek, contoh: d.contoh || [] });
      else setTesHasil({ status: 'gagal', pesan: d.pesan || d.error || 'Gagal.', url: d.urlDicek });
    } catch (e) {
      setTesHasil({ status: 'gagal', pesan: e.message });
    }
  }, [formProv]);

  const cekModel = useCallback(async () => {
    const m = modelInput.trim();
    if (!m) { setCekHasil({ status: 'gagal', pesan: 'Isi nama model dulu.' }); return; }
    setCekHasil({ status: 'cek' });
    try {
      const res = await fetch(`/api/admin/ai/cek-model?provider=${encodeURIComponent(provider || '')}&model=${encodeURIComponent(m)}`, { cache: 'no-store' });
      const d = await res.json();
      if (!d.ok && d.tidakDidukung) {
        setCekHasil({ status: 'gagal', pesan: d.error || 'Provider tidak mendukung cek model.', url: d.urlDicek });
      } else if (!d.ok) {
        setCekHasil({ status: 'gagal', pesan: d.error || 'Gagal cek model.', url: d.urlDicek });
      } else if (d.ada) {
        setCekHasil({ status: 'ada', label: d.label, jumlah: d.jumlah, url: d.urlDicek });
      } else {
        setCekHasil({ status: 'tidak', label: d.label, mirip: d.mirip || [] });
      }
    } catch (e) {
      setCekHasil({ status: 'gagal', pesan: e.message });
    }
  }, [provider, modelInput]);

  // Muat daftar model provider (bisa difilter gratis saja).
  const muatModelProv = useCallback(async (hanyaGratis) => {
    const g = hanyaGratis ?? modelProv.hanyaGratis;
    setModelProv((s) => ({ ...s, status: 'cek', hanyaGratis: g }));
    try {
      const res = await fetch(`/api/admin/ai/daftar-model?provider=${encodeURIComponent(provider || '')}&gratis=${g ? '1' : '0'}`, { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) {
        setModelProv({ status: 'ok', models: d.models || [], jumlah: d.jumlah || 0, jumlahGratis: d.jumlahGratis || 0, hanyaGratis: g, label: d.label, url: d.urlDicek });
      } else {
        setModelProv({ status: 'gagal', models: [], hanyaGratis: g, pesan: d.error || 'Gagal memuat.', url: d.urlDicek });
      }
    } catch (e) {
      setModelProv({ status: 'gagal', models: [], hanyaGratis: g, pesan: e.message });
    }
  }, [provider, modelProv.hanyaGratis]);

  // Cek pemakaian / kuota provider aktif.
  const muatUsage = useCallback(async () => {
    setUsage({ status: 'cek' });
    try {
      const res = await fetch(`/api/admin/ai/usage?provider=${encodeURIComponent(provider || '')}`, { cache: 'no-store' });
      const d = await res.json();
      if (d.ok) setUsage({ status: 'ok', data: d });
      else setUsage({ status: 'gagal', pesan: d.error || 'Gagal cek kuota.' });
    } catch (e) {
      setUsage({ status: 'gagal', pesan: e.message });
    }
  }, [provider]);

  // "Siap" = server bilang aktif ATAU ada provider mana pun yang punya kunci.
  // Toleran terhadap versi server beda (kalau server lama masih kirim field
  // `aktif` yang cuma cek provider default). Mencegah layar buntu palsu.
  const siap = Boolean(status?.aktif) || (status?.providers || []).some((p) => Number(p.kunci) > 0);

  const renderKelola = () => (
        <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-ink">Kelola Provider & Model</h3>
            {pesanKelola && <span className="text-xs font-semibold text-accent">{pesanKelola}</span>}
          </div>

          {/* Provider kustom tersimpan */}
          <p className="mt-3 text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint">Provider kustom</p>
          {memuatKelola ? (
            <p className="mt-2 text-sm text-ink-muted"><span className="pulse-dot" aria-hidden="true" /> Memuat...</p>
          ) : daftarProvider.length === 0 ? (
            <p className="mt-2 text-xs text-ink-muted">Belum ada provider kustom. Provider bawaan (Groq, OpenRouter) sudah tersedia di atas.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {daftarProvider.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-bg-soft/40 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.nama}</p>
                    <p className="truncate text-[0.7rem] text-ink-muted">{p.baseUrl}</p>
                  </div>
                  {p.adaKunci ? (
                    <button
                      type="button"
                      onClick={() => toggleLihatKunci(p.id)}
                      title={kunciTerlihat[p.id] ? 'Sembunyikan API key' : 'Lihat API key'}
                      className="shrink-0 max-w-[220px] truncate rounded-full bg-card-cream px-2 py-0.5 font-mono text-[0.6rem] text-ink-faint transition hover:bg-accent/15 hover:text-ink cursor-pointer"
                    >
                      {kunciTerlihat[p.id] ? kunciTerlihat[p.id] : `${p.kunciTersamar} 👁`}
                    </button>
                  ) : (
                    <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[0.6rem] font-bold text-danger">
                      tanpa kunci
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => mulaiEditProvider(p)}
                    className="shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => hapusProvider(p.id)}
                    className="shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Form provider (tambah / edit) */}
          <div className={`mt-3 rounded-xl border p-3 ${editProvId ? 'border-accent/50 bg-accent/5' : 'border-border-soft bg-bg-soft/30'}`}>
            <p className="text-xs font-bold text-ink-muted">{editProvId ? 'Edit provider' : 'Tambah provider'}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={formProv.nama}
                onChange={(e) => setFormProv({ ...formProv, nama: e.target.value })}
                placeholder="Nama (mis. DeepSeek)"
                className="rounded-lg border border-border-soft bg-card-cream px-3 py-1.5 text-xs text-ink outline-none focus:border-accent"
              />
              <input
                value={formProv.base_url}
                onChange={(e) => setFormProv({ ...formProv, base_url: e.target.value })}
                placeholder="URL base (mis. https://api.deepseek.com/v1)"
                className="rounded-lg border border-border-soft bg-card-cream px-3 py-1.5 text-xs text-ink outline-none focus:border-accent"
              />
              <div className="relative">
                <input
                  value={formProv.api_key}
                  onChange={(e) => setFormProv({ ...formProv, api_key: e.target.value })}
                  placeholder="API key (disimpan terenkripsi)"
                  type={lihatInputKunci ? 'text' : 'password'}
                  className="w-full rounded-lg border border-border-soft bg-card-cream px-3 py-1.5 pr-14 text-xs text-ink outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setLihatInputKunci((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[0.65rem] font-bold text-ink-muted transition hover:text-ink cursor-pointer"
                >
                  {lihatInputKunci ? 'Sembunyi' : 'Lihat'}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={tesKoneksiProv}
                disabled={tesHasil.status === 'cek'}
                className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50 cursor-pointer"
              >
                {tesHasil.status === 'cek' ? 'Tes...' : 'Tes koneksi'}
              </button>
              <button
                type="button"
                onClick={simpanProvider}
                className="btn-primary text-xs"
              >
                {editProvId ? 'Simpan perubahan' : 'Simpan provider'}
              </button>
              {editProvId && (
                <button
                  type="button"
                  onClick={batalEditProvider}
                  className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-bold text-ink-muted transition hover:text-ink cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>
            {editProvId && (
              <p className="mt-1.5 text-[0.65rem] text-ink-faint">Kosongkan API key kalau tidak ingin mengubah kunci lama.</p>
            )}
            {/* Hasil tes koneksi - jelas penyebabnya kalau gagal. */}
            {tesHasil.status === 'ok' && (
              <div className="mt-2 rounded-lg bg-success/10 px-3 py-1.5 text-xs text-success">
                <p className="font-semibold">✓ {tesHasil.pesan}</p>
                {tesHasil.contoh?.length > 0 && (
                  <p className="mt-0.5 break-all font-mono text-[0.6rem] text-ink-muted">Contoh: {tesHasil.contoh.join(', ')}</p>
                )}
              </div>
            )}
            {tesHasil.status === 'gagal' && (
              <div className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
                <p className="font-semibold">{tesHasil.pesan}</p>
                {tesHasil.url && (
                  <p className="mt-0.5 break-all font-mono text-[0.6rem] text-ink-muted">Dicek: {tesHasil.url}</p>
                )}
              </div>
            )}
          </div>

          {/* Model tersimpan */}
          <p className="mt-4 text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint">Model tersimpan</p>
          {daftarModel.length === 0 ? (
            <p className="mt-2 text-xs text-ink-muted">Belum ada model tersimpan.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {daftarModel.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-bg-soft/40 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{m.label}</p>
                    <p className="truncate text-[0.7rem] text-ink-muted">{m.provider} • {m.model}</p>
                    {(m.maxTokens || m.kecerdasan) && (
                      <p className="text-[0.65rem] text-ink-faint">
                        {m.maxTokens ? `maks ${m.maxTokens} token` : ''}
                        {m.maxTokens && m.kecerdasan ? ' • ' : ''}
                        {m.kecerdasan ? `kecerdasan ${m.kecerdasan}/10` : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => pakaiModel(m)}
                    className="shrink-0 rounded-lg border border-accent/40 px-2.5 py-1 text-[0.7rem] font-bold text-accent transition hover:bg-accent/10 cursor-pointer"
                  >
                    Pakai
                  </button>
                  <button
                    type="button"
                    onClick={() => mulaiEditModel(m)}
                    className="shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => hapusModel(m.id)}
                    className="shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Form model (simpan / edit) */}
          <div className={`mt-3 rounded-xl border p-3 ${editModelId ? 'border-accent/50 bg-accent/5' : 'border-border-soft bg-bg-soft/30'}`}>
            <p className="text-xs font-bold text-ink-muted">{editModelId ? 'Edit model' : 'Simpan model'}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input
                value={formModel.label}
                onChange={(e) => setFormModel({ ...formModel, label: e.target.value })}
                placeholder="Label (mis. Nemotron Cepat)"
                className="rounded-lg border border-border-soft bg-card-cream px-3 py-1.5 text-xs text-ink outline-none focus:border-accent"
              />
              <input
                value={formModel.model}
                onChange={(e) => setFormModel({ ...formModel, model: e.target.value })}
                placeholder="Nama model (mis. nvidia/nemotron...:free)"
                className="rounded-lg border border-border-soft bg-card-cream px-3 py-1.5 text-xs text-ink outline-none focus:border-accent"
              />
              <select
                value={formModel.provider}
                onChange={(e) => setFormModel({ ...formModel, provider: e.target.value })}
                className="rounded-lg border border-border-soft bg-card-cream px-3 py-1.5 text-xs text-ink outline-none focus:border-accent"
              >
                <option value="">Pilih provider...</option>
                {(status.providers || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.label}{p.kustom ? ' (kustom)' : ''}</option>
                ))}
              </select>
            </div>
            {/* Pengaturan per-model: panjang jawaban + tingkat kecerdasan. */}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-[0.7rem] text-ink-muted">
                <span className="shrink-0">Maks token jawaban</span>
                <input
                  type="number"
                  min="200"
                  max="32000"
                  value={formModel.max_tokens}
                  onChange={(e) => setFormModel({ ...formModel, max_tokens: e.target.value })}
                  placeholder="2000"
                  className="w-full rounded-lg border border-border-soft bg-card-cream px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent"
                />
              </label>
              <label className="flex items-center gap-2 text-[0.7rem] text-ink-muted">
                <span className="shrink-0">Kecerdasan (1-10)</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formModel.kecerdasan}
                  onChange={(e) => setFormModel({ ...formModel, kecerdasan: e.target.value })}
                  placeholder="6"
                  className="w-full rounded-lg border border-border-soft bg-card-cream px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent"
                />
              </label>
            </div>
            <p className="mt-1 text-[0.65rem] text-ink-faint">
              Kecerdasan: 1 = paling presisi/fokus, 10 = paling kreatif/eksploratif. Kosongkan untuk pakai default (6).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={simpanModel}
                className="btn-primary text-xs"
              >
                {editModelId ? 'Simpan perubahan' : 'Simpan model'}
              </button>
              {editModelId && (
                <button
                  type="button"
                  onClick={batalEditModel}
                  className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-bold text-ink-muted transition hover:text-ink cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>
          </div>
        </div>
  );

  if (memuatStatus) {
    return (
      <div className="nx-card px-6 py-10 text-center text-sm text-ink-muted">
        <span className="pulse-dot" aria-hidden="true" /> Memeriksa kesiapan AI...
      </div>
    );
  }

  // CATATAN DESAIN (fix 2026-10-02): dulu ada layar "belum aktif" yang
  // MENGGANTIKAN seluruh halaman -> pemilik mentok. Sekarang TIDAK ADA layar
  // buntu: panel selalu tampil, kalau belum siap cuma muncul banner peringatan
  // di atas. Provider kustom yang tersimpan tetap bisa langsung dipakai.

  return (
    <div className="space-y-4">
      {/* Banner peringatan kalau belum ada provider siap (bukan penghalang). */}
      {!siap && (
        <div className="nx-card border-danger/40 px-4 py-3 sm:px-5">
          <p className="text-sm font-bold text-danger">Belum ada provider AI yang siap dipakai</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Klik <strong className="text-ink">Pakai</strong> di salah satu model tersimpan, atau tambah provider lewat <strong className="text-ink">Kelola provider &amp; model</strong>. Kalau provider sudah ada tapi tetap muncul ini, cek diagnostik di bawah.
          </p>
          {status?.errorMuatan && (
            <p className="mt-1 text-[0.65rem] text-danger">Error muat status: {status.errorMuatan}</p>
          )}
          {status?.diag && (
            <ul className="mt-2 space-y-0.5 text-[0.65rem] text-ink-faint">
              <li>AI_PROVIDER: {status.diag.AI_PROVIDER || '(kosong)'} | AI_BASE_URL: {status.diag.AI_BASE_URL || '(kosong)'}</li>
              <li>GROQ_API_KEY: {status.diag.adaGroq ? `${status.diag.jumlahGroq} kunci` : 'TIDAK ADA'} | OPENROUTER_API_KEY: {status.diag.adaOpenrouter ? `${status.diag.jumlahOpenrouter} kunci` : 'TIDAK ADA'}</li>
              <li>Provider bawaan: {(status.diag.providerBawaanTerbaca || []).join(', ') || '-'}</li>
              <li>Provider kustom: {(status.diag.providerKustom || []).join(', ') || '-'}</li>
              {status.diag.errorDb && <li className="text-danger">Error DB: {status.diag.errorDb}</li>}
            </ul>
          )}
        </div>
      )}

      {/* ==========================================
          PANEL PENGINGAT (muncul saat tombol lonceng diklik)
          ==========================================
          Permintaan pemilik: tombol notif di halaman Analisis AI, menyala
          MERAH kalau ada pengingat. Panelnya hanya terbuka saat diklik -
          tidak memakan ruang saat tidak dibutuhkan. */}
      {bukaPengingat && (
        <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-ink">
              Pengingat
              <span className="ml-2 text-sm font-normal text-ink-muted">
                ({pengingat.filter((p) => !p.selesai).length} aktif)
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setBukaPengingat(false)}
              className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:text-ink cursor-pointer"
            >
              Tutup
            </button>
          </div>

          {pengingat.filter((p) => !p.selesai).length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              Belum ada. Contoh: "ingetin gw pas Halloween mau masang promo".
            </p>
          ) : (
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
          )}

          {/* Riwayat yang sudah selesai - disembunyikan di balik tombol supaya
              daftar utama tetap ringkas. */}
          {pengingat.filter((p) => p.selesai).length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-ink">
                Selesai ({pengingat.filter((p) => p.selesai).length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {pengingat.filter((p) => p.selesai).map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-bg-soft/30 px-3 py-2">
                    <span className="min-w-0 truncate text-xs text-ink-muted line-through">{p.teks}</span>
                    <button
                      type="button"
                      onClick={() => hapusPengingat(p.id)}
                      className="shrink-0 text-[0.65rem] font-bold text-ink-faint transition hover:text-danger cursor-pointer"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ==========================================
          BAR KONTROL TERPADU (sticky)
          ==========================================
          Digabung jadi SATU kartu biar alurnya jelas: pilih mode -> pilih
          provider -> ketik/tanya. Sticky supaya tetap terlihat saat hasilnya
          panjang (permintaan pemilik 2026-10-02: "lebih mudah pakenya"). */}
      <div className="nx-card sticky top-2 z-20 px-4 py-3.5 sm:px-5 sm:py-4 backdrop-blur-sm">
        {/* Baris 1: judul + pemilih MODE (segmented besar). */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-ink">Analisis AI</h3>
            {/* Titik status provider aktif - hijau = siap. */}
            <span
              title={`Provider aktif: ${provider || status.provider || 'groq'}`}
              className={`inline-block h-2 w-2 rounded-full ${status.aktif ? 'bg-success' : 'bg-danger'}`}
            />
          </div>
          <div className="flex rounded-xl border border-border-soft bg-bg-soft/60 p-1">
            {[
              ['analisis', 'Analisis', 'Laporan TEMUAN / SARAN / RISIKO'],
              ['diskusi', 'Diskusi', 'Chat 2 arah, bisa ditanya lanjut'],
            ].map(([id, label, ket]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                title={ket}
                className={`rounded-lg px-4 py-1.5 text-xs font-bold transition cursor-pointer ${
                  mode === id ? 'bg-card-cream text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Baris 2: provider + model manual. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="hidden text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint sm:inline">Provider</span>
          <div className="flex rounded-xl border border-border-soft bg-bg-soft/60 p-1">
            {(status.providers || []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProvider(p.id);
                  // Auto-ganti modelInput ke default model provider baru
                  if (p.model) setModelInput(p.model);
                }}
                title={p.model ? `Default: ${p.model}` : undefined}
                className={`rounded-lg px-3 py-1 text-xs font-bold transition cursor-pointer ${
                  provider === p.id ? 'bg-card-cream text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="hidden text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint sm:inline">Model</span>
          <input
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder="Nama model (contoh: qwen/qwen3.8-27b:free)"
            className="flex-1 min-w-[200px] rounded-xl border border-border-soft bg-bg-soft/60 px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-1 focus:ring-ink-muted/30"
          />
          {/* Dropdown model tersimpan - pilih cepat tanpa hafal nama model. */}
          {(status.models || []).length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const m = (status.models || []).find((x) => String(x.id) === e.target.value);
                if (m) pakaiModel(m);
              }}
              title="Pilih dari model tersimpan"
              className="rounded-xl border border-border-soft bg-bg-soft/60 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent cursor-pointer"
            >
              <option value="">Model tersimpan...</option>
              {(status.models || []).map((m) => (
                <option key={m.id} value={m.id}>{m.label} - {m.model}</option>
              ))}
            </select>
          )}
          {/* Validasi model: cek apakah model ini benar-benar ada di provider. */}
          <button
            type="button"
            onClick={cekModel}
            disabled={cekHasil.status === 'cek'}
            title="Cek model ini ada di provider atau tidak"
            className="shrink-0 rounded-xl border border-border-soft bg-bg-soft/60 px-3 py-1.5 text-xs font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50 cursor-pointer"
          >
            {cekHasil.status === 'cek' ? '...' : 'Cek model'}
          </button>
          {/* Lihat daftar model provider (filter gratis). */}
          <button
            type="button"
            onClick={() => {
              if (modelProv.status === 'ok') setModelProv((s) => ({ ...s, status: 'idle' }));
              else muatModelProv(modelProv.hanyaGratis);
            }}
            disabled={modelProv.status === 'cek'}
            title="Tampilkan daftar model provider"
            className="shrink-0 rounded-xl border border-border-soft bg-bg-soft/60 px-3 py-1.5 text-xs font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50 cursor-pointer"
          >
            {modelProv.status === 'cek' ? '...' : modelProv.status === 'ok' ? 'Tutup daftar' : 'Lihat model'}
          </button>
          {/* Cek pemakaian / kuota provider. */}
          <button
            type="button"
            onClick={() => { if (usage.status === 'ok') setUsage({ status: 'idle' }); else muatUsage(); }}
            disabled={usage.status === 'cek'}
            title="Lihat pemakaian / sisa kuota provider"
            className="shrink-0 rounded-xl border border-border-soft bg-bg-soft/60 px-3 py-1.5 text-xs font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50 cursor-pointer"
          >
            {usage.status === 'cek' ? '...' : usage.status === 'ok' ? 'Tutup usage' : 'Usage'}
          </button>
        </div>

        {/* Panel info pemakaian / kuota provider. */}
        {usage.status === 'ok' && (
          <div className="mt-2 rounded-xl border border-border-soft bg-bg-soft/30 p-3">
            <p className="text-xs font-bold text-ink">Pemakaian {usage.data.label}</p>
            {/* OpenRouter: kredit + limit kunci + kuota harian gratis. */}
            {usage.data.kredit && (
              <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
                <li>Kredit total: <strong className="text-ink">{usage.data.kredit.total}</strong> | terpakai: <strong className="text-ink">{usage.data.kredit.terpakai.toFixed(4)}</strong> | sisa: <strong className="text-ink">{usage.data.kredit.sisa.toFixed(4)}</strong></li>
                {usage.data.kunci && (
                  <li>Pemakaian kunci: harian {usage.data.kunci.harian.toFixed(4)} | bulanan {usage.data.kunci.bulanan.toFixed(4)} | total {usage.data.kunci.terpakai.toFixed(4)}
                    {usage.data.kunci.limit != null && <> | limit {usage.data.kunci.limit}</>}
                  </li>
                )}
                {usage.data.kunci?.freeTier && <li className="text-ink-faint">Akun tier gratis</li>}
              </ul>
            )}
            {/* Kuota harian model gratis (OpenRouter). */}
            {usage.data.harianGratis && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-muted">Model gratis hari ini</span>
                  <span className="font-semibold text-ink">{usage.data.harianGratis.terpakai}/{usage.data.harianGratis.limit} (sisa {usage.data.harianGratis.sisa})</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg-soft">
                  <div
                    className={`h-full ${usage.data.harianGratis.sisa === 0 ? 'bg-danger' : 'bg-success'}`}
                    style={{ width: `${usage.data.harianGratis.limit ? Math.min(100, (usage.data.harianGratis.terpakai / usage.data.harianGratis.limit) * 100) : 0}%` }}
                  />
                </div>
                {usage.data.harianGratis.sisa === 0 && <p className="mt-1 text-[0.7rem] font-bold text-danger">Kuota harian model gratis HABIS - pakai model berbayar atau tunggu reset.</p>}
              </div>
            )}
            {/* Groq / umum: rate limit token & request. */}
            {usage.data.rate && (usage.data.rate.limitToken || usage.data.rate.limitRequest) && (
              <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
                {usage.data.rate.limitToken != null && (
                  <li>Token: sisa <strong className="text-ink">{usage.data.rate.sisaToken}</strong> / {usage.data.rate.limitToken}{usage.data.rate.resetToken ? ` (reset ${usage.data.rate.resetToken})` : ''}</li>
                )}
                {usage.data.rate.limitRequest != null && (
                  <li>Request: sisa <strong className="text-ink">{usage.data.rate.sisaRequest}</strong> / {usage.data.rate.limitRequest}</li>
                )}
              </ul>
            )}
            {usage.data.catatan && <p className="mt-2 text-xs text-ink-muted">{usage.data.catatan}</p>}
            <p className="mt-2 text-[0.6rem] text-ink-faint">Info diambil langsung dari provider - hanya saat tombol ini diklik.</p>
          </div>
        )}
        {usage.status === 'gagal' && (
          <p className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger">{usage.pesan}</p>
        )}

        {/* Panel daftar model provider. */}
        {modelProv.status === 'ok' && (
          <div className="mt-2 rounded-xl border border-border-soft bg-bg-soft/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink">
                Model {modelProv.label} -
                <span className="ml-1 text-ink-muted">
                  {modelProv.hanyaGratis ? `${modelProv.jumlahGratis} gratis` : `${modelProv.jumlah} total`}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelProv.hanyaGratis}
                    onChange={(e) => muatModelProv(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Gratis saja
                </label>
                {/* Filter kemampuan (client-side, tidak perlu fetch ulang). */}
                <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelProv.filterLihat || false}
                    onChange={(e) => setModelProv((s) => ({ ...s, filterLihat: e.target.checked }))}
                    className="cursor-pointer"
                  />
                  Bisa lihat gambar
                </label>
                <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelProv.filterNalar || false}
                    onChange={(e) => setModelProv((s) => ({ ...s, filterNalar: e.target.checked }))}
                    className="cursor-pointer"
                  />
                  Bisa bernalar
                </label>
              </div>
            </div>
            {(() => {
              const tampil = modelProv.models.filter((m) =>
                (!modelProv.filterLihat || m.vision) && (!modelProv.filterNalar || m.reasoning)
              );
              if (tampil.length === 0) return <p className="mt-2 text-xs text-ink-muted">Tidak ada model yang cocok.</p>;
              return (
              <>
              {modelProv.bisaPastikan === false && (
                <p className="mt-2 rounded-lg bg-warning/10 px-3 py-1.5 text-[0.7rem] text-ink-muted">
                  Provider ini tidak memberi data harga resmi, jadi status GRATIS tidak bisa dipastikan. Coba modelnya dulu lewat "Cek model" atau chat uji sebelum dipakai serius.
                </p>
              )}
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {tampil.map((m) => (
                  <li key={m.id} className={`rounded-lg ${modelProv.dipilih === m.id ? 'bg-accent/10' : ''}`}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Pilih model + buka pengaturan (max token & kecerdasan).
                          setModelProv((s) => ({
                            ...s,
                            dipilih: s.dipilih === m.id ? null : m.id,
                            setToken: s.setToken || '2000',
                            setIq: s.setIq || '6',
                          }));
                        }}
                        title="Pilih + atur model ini"
                        className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-accent/15 cursor-pointer"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-ink">{m.id}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {m.vision && <span title="Bisa lihat gambar (vision)" className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-accent">LIHAT</span>}
                          {m.reasoning && <span title="Bisa bernalar (reasoning)" className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-accent">NALAR</span>}
                          {m.gratis === true && <span className="rounded bg-success/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-success">GRATIS</span>}
                        </span>
                      </button>
                      {/* Pakai cepat tanpa atur. */}
                      <button
                        type="button"
                        onClick={() => { setModelInput(m.id); setModelSetting({ maxTokens: null, kecerdasan: null }); setModelProv((s) => ({ ...s, status: 'idle', dipilih: null })); }}
                        title="Pakai model ini langsung (default)"
                        className="shrink-0 rounded-lg border border-accent/40 px-2 py-1 text-[0.65rem] font-bold text-accent transition hover:bg-accent/10 cursor-pointer"
                      >
                        Pakai
                      </button>
                    </div>
                    {/* Pengaturan model terpilih: max token + kecerdasan. */}
                    {modelProv.dipilih === m.id && (
                      <div className="mt-1 rounded-lg border border-border-soft bg-card-cream p-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="flex items-center gap-2 text-[0.65rem] text-ink-muted">
                            <span className="shrink-0">Maks token</span>
                            <input
                              type="number" min="200" max="32000"
                              value={modelProv.setToken ?? '2000'}
                              onChange={(e) => setModelProv((s) => ({ ...s, setToken: e.target.value }))}
                              className="w-full rounded border border-border-soft bg-bg-soft px-2 py-1 text-[0.7rem] text-ink outline-none focus:border-accent"
                            />
                          </label>
                          <label className="flex items-center gap-2 text-[0.65rem] text-ink-muted">
                            <span className="shrink-0">Kecerdasan (1-10)</span>
                            <input
                              type="number" min="1" max="10"
                              value={modelProv.setIq ?? '6'}
                              onChange={(e) => setModelProv((s) => ({ ...s, setIq: e.target.value }))}
                              className="w-full rounded border border-border-soft bg-bg-soft px-2 py-1 text-[0.7rem] text-ink outline-none focus:border-accent"
                            />
                          </label>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setModelInput(m.id);
                              setModelSetting({ maxTokens: Number(modelProv.setToken) || null, kecerdasan: Number(modelProv.setIq) || null });
                              setModelProv((s) => ({ ...s, status: 'idle', dipilih: null }));
                            }}
                            className="btn-primary text-[0.7rem]"
                          >
                            Pakai dengan setting ini
                          </button>
                          <button
                            type="button"
                            onClick={() => setModelProv((s) => ({ ...s, dipilih: null }))}
                            className="rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:text-ink cursor-pointer"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              // Simpan permanent sebagai model tersimpan.
                              setFormModel({
                                label: m.id.split('/').pop().split(':')[0].slice(0, 40),
                                model: m.id, provider: provider || '',
                                max_tokens: String(modelProv.setToken ?? ''), kecerdasan: String(modelProv.setIq ?? ''),
                              });
                              setKelola(true);
                              setEditModelId(null);
                              if (daftarProvider.length === 0) muatKelola();
                              flashKelola('Form model terisi - klik "Simpan model" untuk menyimpan permanen.');
                            }}
                            className="rounded-lg border border-accent/40 px-2.5 py-1 text-[0.7rem] font-bold text-accent transition hover:bg-accent/10 cursor-pointer"
                          >
                            Simpan permanen
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              </>
              );
            })()}
            {modelProv.url && (
              <p className="mt-2 break-all font-mono text-[0.6rem] text-ink-faint">{modelProv.url}</p>
            )}
          </div>
        )}
        {modelProv.status === 'gagal' && (
          <div className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
            <p className="font-semibold">{modelProv.pesan}</p>
            {modelProv.url && <p className="mt-0.5 break-all font-mono text-[0.6rem] text-ink-muted">Dicek: {modelProv.url}</p>}
          </div>
        )}

        {/* Hasil validasi model - hanya tampil setelah dicek. */}
        {cekHasil.status === 'ada' && (
          <div className="mt-2 rounded-lg bg-success/10 px-3 py-1.5 text-xs text-success">
            <p className="font-semibold">✓ Model ada di {cekHasil.label}{cekHasil.jumlah ? ` (${cekHasil.jumlah} model tersedia)` : ''}.</p>
            {cekHasil.url && (
              <p className="mt-0.5 break-all font-mono text-[0.6rem] text-ink-muted">{cekHasil.url}</p>
            )}
          </div>
        )}
        {cekHasil.status === 'tidak' && (
          <div className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
            <p className="font-semibold">Model tidak ditemukan di {cekHasil.label}.</p>
            {cekHasil.mirip.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1">
                <span className="text-ink-muted">Mirip:</span>
                {cekHasil.mirip.map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => { setModelInput(x); setCekHasil({ status: 'idle' }); }}
                    className="rounded bg-card-cream px-1.5 py-0.5 font-mono text-[0.65rem] text-ink transition hover:bg-accent/15 cursor-pointer"
                  >
                    {x}
                  </button>
                ))}
              </p>
            )}
          </div>
        )}
        {cekHasil.status === 'gagal' && (
          <div className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">
            <p className="font-semibold">{cekHasil.pesan}</p>
            {cekHasil.url && (
              <p className="mt-0.5 break-all font-mono text-[0.65rem] text-ink-muted">Dicek: {cekHasil.url}</p>
            )}
          </div>
        )}

        {/* Baris 3: keterangan singkat sesuai mode + tombol kelola. */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">
            {mode === 'analisis'
              ? 'Pilih topik cepat di bawah atau tulis pertanyaanmu sendiri.'
              : 'Ngobrol bebas - AI ingat percakapan sebelumnya.'}
          </p>
          <div className="flex items-center gap-2">
            {/* Setting aktif model: max token + kecerdasan. */}
            {(modelSetting.maxTokens || modelSetting.kecerdasan) && (
              <span className="rounded-full bg-bg-soft px-2 py-0.5 text-[0.65rem] font-semibold text-ink-muted">
                {modelSetting.maxTokens ? `${modelSetting.maxTokens} token` : ''}
                {modelSetting.maxTokens && modelSetting.kecerdasan ? ' • ' : ''}
                {modelSetting.kecerdasan ? `IQ ${modelSetting.kecerdasan}/10` : ''}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                const buka = !kelola;
                setKelola(buka);
                if (buka && daftarProvider.length === 0) muatKelola();
              }}
              className="rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
            >
              {kelola ? 'Tutup kelola' : 'Kelola provider & model'}
            </button>
          </div>
        </div>
      </div>

      {/* ==========================================
          PANEL KELOLA PROVIDER & MODEL
          ==========================================
          Tambah provider kustom (nama + URL + API key), hapus, lalu simpan
          model (label + nama model + provider) yang bisa dipakai ulang. */}
      {kelola && renderKelola()}

      {/* ==========================================
          MODE ANALISIS (searah): tombol pintasan + laporan
          ========================================== */}
      {mode === 'analisis' && (
        <>
          <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-muted">Analisis Cepat</p>
              <span className="text-[0.65rem] text-ink-faint">Klik topik - langsung jalan</span>
            </div>
            {/* Di HP tombol dibuat GRID 2 kolom: label panjang seperti
                "Pertumbuhan Komunitas" jadi tidak memaksa satu baris penuh, dan
                tingginya naik ke 40px supaya nyaman ditekan jari (sebelumnya 30px,
                di bawah ambang nyaman). Di layar lebar kembali ke flex-wrap. */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {(status.pintasan || []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={jalan || detikSisa > 0}
                  onClick={() => jalankan({ pintasan: p.id }, p.label)}
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-border-soft bg-bg-soft px-3 py-2 text-center text-xs font-semibold leading-tight text-ink transition hover:border-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:justify-start sm:px-3.5 sm:py-1.5 cursor-pointer"
                >
                  {detikSisa > 0 ? `⏳ ${detikSisa}s` : p.label}
                </button>
              ))}
            </div>
            {/* Pertanyaan bebas juga bisa - tetap dijawab dengan format
                TEMUAN/SARAN/RISIKO karena modenya 'analisis'. */}
            <form onSubmit={kirimBebas} className="mt-3 flex gap-2">
              <input
                value={tanya}
                onChange={(e) => setTanya(e.target.value)}
                placeholder="Atau tulis topik sendiri..."
                aria-label="Topik analisis"
                className="w-full rounded-xl border border-border-soft bg-card-cream px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
              <button
                type="submit"
                disabled={jalan || detikSisa > 0 || !tanya.trim()}
                className="btn-primary shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {jalan ? '...' : 'Analisis'}
              </button>
            </form>
          </div>

          {jalan && (
            <div className="nx-card px-4 py-4 sm:px-5 sm:py-5 text-sm text-ink-muted">
              <span className="pulse-dot" aria-hidden="true" /> AI ({(status.providers || []).find((p) => p.id === provider)?.label || provider || 'Groq'}) sedang membaca data, bisa 5-30 detik.
            </div>
          )}

          {/* Bilah riwayat analisis tersimpan + tombol hapus semua. */}
          {laporan.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-xs text-ink-muted">{laporan.length} laporan tersimpan (tidak hilang saat refresh)</span>
              <button
                type="button"
                onClick={hapusSemuaLaporan}
                className="rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
              >
                Hapus semua
              </button>
            </div>
          )}

          {laporan.length === 0 && !jalan && (
            <div className="nx-card px-4 py-6 sm:px-5 sm:py-8 text-center text-sm text-ink-muted">
              Belum ada analisis. Pilih topik di atas.
            </div>
          )}

          {laporan.map((r, i) => (
            <div key={i} className="nx-card px-4 py-4 sm:px-5 sm:py-5">
              <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-border-soft pb-2">
                <span className="font-display text-sm font-bold text-ink">{r.judul}</span>
                <span className="text-[0.65rem] text-ink-faint">
                  {new Date(r.waktu).toLocaleString('id-ID')}
                </span>
                {/* Model & provider yang BENAR-BENAR dipakai - supaya pemilik
                    bisa pastikan switch provider + model manual berhasil. */}
                {r.modelDipakai && (
                  <span className="rounded-full bg-bg-soft px-2 py-0.5 text-[0.6rem] font-semibold text-ink-muted">
                    {r.providerDipakai || 'AI'} • {r.modelDipakai}
                  </span>
                )}
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
                {/* Hapus satu laporan manual. */}
                <button
                  type="button"
                  onClick={() => hapusLaporan(i)}
                  title="Hapus laporan ini"
                  className={`${r.error ? 'ml-auto' : ''} shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer`}
                >
                  Hapus
                </button>
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
              <div>
                <h3 className="font-display text-ink">
                  Diskusi
                  {pesan.length > 0 && (
                    <span className="ml-2 text-sm font-normal text-ink-muted">
                      {Math.ceil(pesan.length / 2)} giliran
                    </span>
                  )}
                </h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Ngobrol bebas soal data NEXO - AI ingat percakapan ini.
                </p>
              </div>
              {pesan.length > 0 && (
                <button
                  type="button"
                  onClick={mulaiBaru}
                  className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                  title="Hapus seluruh percakapan dan mulai dari nol"
                >
                  Mulai baru
                </button>
              )}
            </div>

        {/* Kartu saran klik (sumber: SARAN_DISKUSI dari server). Selalu tampil
            supaya pemilik punya titik mulai - pertanyaan relevan soal data. */}
        {(status?.saranDiskusi || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(status.saranDiskusi || []).map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={jalan || detikSisa > 0}
                onClick={() => jalankan({ saran: s.id }, s.label, s.label)}
                className="rounded-full border border-border-soft bg-bg-soft px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {pesan.length === 0 ? (
          <div className="mt-5">
            <p className="text-center text-sm text-ink-muted">Mulai dari salah satu pertanyaan ini, atau tulis sendiri di bawah.</p>
          </div>
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
                  <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-ink-muted">
                    {m.peran === 'gw' ? 'Kamu' : m.error ? 'AI - gagal' : 'AI'}
                    {m.waktu ? ' - ' + new Date(m.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''}
                    {m.peran === 'ai' && m.modelDipakai && (
                      <span className="rounded-full bg-card-cream px-1.5 py-0.5 text-[0.55rem] font-semibold normal-case tracking-normal text-ink-faint">
                        {m.providerDipakai || 'AI'} • {m.modelDipakai}
                      </span>
                    )}
                  </p>
                  {m.error ? (
                    <p className="text-sm">{m.isi}</p>
                  ) : (
                    <Paragraf teks={m.isi} />
                  )}
                  {/* Gambar lampiran yang dikirim pemilik. */}
                  {Array.isArray(m.gambar) && m.gambar.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.gambar.map((g, gi) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={gi} src={g} alt={`Lampiran ${gi + 1}`} className="max-h-40 rounded-lg border border-border-soft object-contain" />
                      ))}
                    </div>
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
                  <span className="pulse-dot" aria-hidden="true" /> AI ({(status.providers || []).find((p) => p.id === provider)?.label || provider || 'Groq'}) sedang membaca data, bisa 5-30 detik...
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={ujungChat} />
      </div>

      {/* KOLOM KETIK di bawah percakapan - seperti ChatGPT. */}
      <div className="sticky bottom-4 z-10 rounded-2xl border border-border-soft bg-card-cream p-2 shadow-[0_8px_28px_rgba(43,33,24,0.12)]">
        {/* Preview gambar terlampir. */}
        {gambar.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {gambar.map((g, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g} alt={`Lampiran ${i + 1}`} className="h-16 w-16 rounded-lg border border-border-soft object-cover" />
                <button
                  type="button"
                  onClick={() => setGambar((arr) => arr.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[0.65rem] font-bold text-white cursor-pointer"
                  title="Hapus gambar"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={kirimBebas} className="flex gap-2">
          {/* Lampirkan gambar. */}
          <label
            title="Lampirkan gambar (untuk model yang bisa lihat)"
            className="flex shrink-0 cursor-pointer items-center rounded-xl px-2.5 text-lg text-ink-muted transition hover:text-ink"
          >
            +
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []).slice(0, 4 - gambar.length);
                const hasil = [];
                for (const f of files) {
                  try { hasil.push(await bacaGambar(f)); } catch { /* lewati file rusak */ }
                }
                if (hasil.length) setGambar((arr) => [...arr, ...hasil].slice(0, 4));
                e.target.value = '';
              }}
            />
          </label>
          <input
            value={tanya}
            onChange={(e) => setTanya(e.target.value)}
            placeholder={detikSisa > 0 ? `Tunggu ${detikSisa} detik...` : 'Ketik pertanyaanmu...'}
            aria-label="Pertanyaan bebas tentang data"
            className="w-full rounded-xl bg-transparent px-3 py-2 text-sm text-ink outline-none"
          />
          <button
            type="submit"
            disabled={jalan || detikSisa > 0 || (!tanya.trim() && gambar.length === 0)}
            className="btn-primary shrink-0 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jalan ? '...' : detikSisa > 0 ? `⏳ ${detikSisa}s` : 'Kirim'}
          </button>
        </form>
      </div>
        </>
      )}

      {/* ==========================================
          ARSIP JAWABAN TERSIMPAN
          ==========================================
          Permintaan pemilik: "jawaban AI bisa gw simpan bisa gw hapus".

          KARTU INI HANYA MUNCUL KALAU ADA ISINYA (fix 2026-10-01). Sebelumnya
          selalu tampil - walau kosong - dan ikut menyumbang kesan "terlalu
          banyak text" di halaman. Pesan kosongnya juga dihapus; kalau belum
          ada arsip, tidak ada yang perlu ditampilkan. */}
      {arsip.length > 0 && (
      <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-ink">
            Arsip Jawaban <span className="text-sm font-normal text-ink-muted">({arsip.length})</span>
          </h3>
          <button
            type="button"
            onClick={() => setBukaArsip((v) => !v)}
            className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-accent/50 hover:text-ink cursor-pointer"
          >
            {bukaArsip ? 'Sembunyikan' : 'Tampilkan'}
          </button>
        </div>

        {pesanSimpan && <p className="mt-2 text-xs font-semibold text-success">{pesanSimpan}</p>}

        {bukaArsip ? (
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
          <p className="mt-2 text-xs text-ink-muted">{arsip.length} catatan tersimpan.</p>
        )}
      </div>
      )}

      {/* Modal konfirmasi (ganti window.confirm bawaan browser). */}
      {konfirmasi && (
        <ConfirmModal
          title={konfirmasi.judul}
          body={konfirmasi.body}
          busy={konfirmasiBusy}
          onCancel={() => setKonfirmasi(null)}
          onConfirm={jalankanKonfirmasi}
        />
      )}
    </div>
  );
}

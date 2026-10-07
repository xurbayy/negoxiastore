'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmModal from './ConfirmModal';
import PilihPeran from './PilihPeran';
import AgenAI from './AgenAI';
import AiUsage from './AiUsage';
import { pintasanPeranKlien } from '../../lib/aiPeranKlien';
import { THINKING_LABEL } from '../../lib/formatClient';

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
    // URUTAN PENTING (fix 2026-10-04): `***tebal miring***` diproses DULU,
    // kalau tidak `**` menangkap sebagian dan menyisakan bintang nyasar
    // (pemilik: "format embed *** harus muncul dengan benar").
    keluaran.push(
      b
        .replace(/\*\*\*(.+?)\*\*\*/g, '$1') // ***tebal miring*** -> teks
        .replace(/\*\*(.+?)\*\*/g, '$1')   // **tebal** -> tebal
        .replace(/\*(.+?)\*/g, '$1')       // *miring* -> miring
        .replace(/`/g, '')                    // `kode` -> kode
        .replace(/^\s*[-*]\s+/, '- ')        // penanda butir -> tanda hubung biasa
        .replace(/^\s*#{1,6}\s+/, '')        // ## judul -> judul
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
  // Drag & drop gambar (permintaan pemilik 2026-10-02).
  const [dragAktif, setDragAktif] = useState(false);
  // Reply pesan: { indeks, peran, cuplikan } (permintaan pemilik 2026-10-02).
  const [balas, setBalas] = useState(null);
  // Tambah gambar dari file (dipakai drag-drop & input).
  const tambahGambarDariFile = useCallback(async (files) => {
    const list = Array.from(files || []).filter((f) => f?.type?.startsWith('image/'));
    if (!list.length) return;
    const hasil = [];
    for (const f of list.slice(0, 4 - gambar.length)) {
      try { hasil.push(await bacaGambar(f)); } catch { /* lewati file rusak */ }
    }
    if (hasil.length) setGambar((arr) => [...arr, ...hasil].slice(0, 4));
  }, [gambar.length]);

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
  // PERAN AI (modular): umum / bug / security / exploit / analyst. Disimpan
  // supaya tidak reset tiap buka.
  const [peran, setPeran] = useState(() => {
    try { return window.localStorage.getItem('nexo_ai_peran') || 'umum'; } catch { return 'umum'; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('nexo_ai_peran', peran); } catch { /* abaikan */ }
  }, [peran]);
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
  // PREFS SERVER (persist lintas device & logout)
  // ==========================================
  // localStorage tidak transfer antar device. Simpan ke DB via /api/admin/ai/prefs.
  // Muat saat mount, simpan (debounced) saat berubah.
  const prefsLoaded = useRef(false);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/ai/prefs', { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (d.ok && d.prefs) {
          const p = d.prefs;
          if (p.provider) setProvider(p.provider);
          if (p.model) setModelInput(p.model);
          if (p.mode) setMode(p.mode);
          if (p.peran) setPeran(p.peran);
          // MAX TOKEN tidak lagi dipakai di web (dihapus 2026-10-04) - prefs lama
          // yang masih menyimpan maxTokens diabaikan.
          if (p.thinking) {
            setModelSetting((s) => ({ ...s, thinking: p.thinking }));
          }
        }
      } catch { /* offline / gagal - pakai localStorage */ }
      finally { prefsLoaded.current = true; }
    })();
  }, []);

  // Simpan prefs ke server (debounced 1 detik) - hanya setelah mount.
  const simpanPrefsRef = useRef(null);
  useEffect(() => {
    if (!prefsLoaded.current) return;
    clearTimeout(simpanPrefsRef.current);
    simpanPrefsRef.current = setTimeout(async () => {
      try {
        await fetch('/api/admin/ai/prefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model: modelInput, mode, peran }),
        });
      } catch { /* offline */ }
    }, 1000);
    return () => clearTimeout(simpanPrefsRef.current);
  }, [provider, modelInput, mode, peran]);

  // ==========================================
  // KELOLA PROVIDER & MODEL (permintaan pemilik 2026-10-02)
  // ==========================================
  // Pemilik bisa menambah provider (nama + URL + API key), menghapusnya, dan
  // menyimpan model (label + nama model + provider) yang bisa diedit/dihapus.
  const [kelola, setKelola] = useState(false);          // panel kelola terbuka?
  const [bukaSetting, setBukaSetting] = useState(false); // panel pengaturan (token/IQ/peran)
  // Panel kontrol (provider/model/peran) bisa disembunyikan - permintaan pemilik
  // 2026-10-02: "bisa di hide ya kalo ga butuh, pusing kalo semua muncul".
  const [panelTampil, setPanelTampil] = useState(() => {
    try { return window.localStorage.getItem('nexo_ai_panel') !== '0'; } catch { return true; }
  });
  // Validasi visual: highlight merah bar provider/model saat kosong.
  const [validasiProvider, setValidasiProvider] = useState(false);
  useEffect(() => {
    try { window.localStorage.setItem('nexo_ai_panel', panelTampil ? '1' : '0'); } catch { /* abaikan */ }
  }, [panelTampil]);
  // Saran yang di-dismiss (dihapus dari tampilan). Reset saat "Muat ulang".
  const [saranDismiss, setSaranDismiss] = useState(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem('nexo_ai_saran_dismiss') || '[]')); } catch { return new Set(); }
  });
  useEffect(() => {
    try { window.localStorage.setItem('nexo_ai_saran_dismiss', JSON.stringify([...saranDismiss])); } catch { /* abaikan */ }
  }, [saranDismiss]);
  const dismissSaran = useCallback((id) => {
    setSaranDismiss((s) => { const n = new Set(s); n.add(id); return n; });
  }, []);
  const [daftarProvider, setDaftarProvider] = useState([]);
  const [daftarModel, setDaftarModel] = useState([]);
  const [memuatKelola, setMemuatKelola] = useState(false);
  const [pesanKelola, setPesanKelola] = useState(null);
  // Form provider baru. apiKeys = array of API key (bukan string koma) -
  // permintaan pemilik 2026-10-02: "mau nambah api buat tombol tambah biar bisa
  // masukkin tanpa koma".
  const [formProv, setFormProv] = useState({ nama: '', base_url: '', api_key: '' });
  const [apiKeys, setApiKeys] = useState([]); // daftar key terpisah
  const [keyBaru, setKeyBaru] = useState('');  // input key baru
  // Field wajib yang kosong -> highlight merah (permintaan pemilik 2026-10-02).
  const [errProv, setErrProv] = useState({});
  const [errModel, setErrModel] = useState({});
  // Menu aksi model (dropdown) - supaya bar kontrol tidak penuh.
  const [menuModel, setMenuModel] = useState(false);
  // Form model baru.
  const [formModel, setFormModel] = useState({ label: '', model: '', provider: '', max_tokens: '', thinking: '' });
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
  // Hasil uji model: { [modelId]: {ok, alasan} }. Kosong = belum diuji.
  const [ujiHasil, setUjiHasil] = useState({});
  const [ujiJalan, setUjiJalan] = useState(false);
  // PENGATURAN GLOBAL model: Thinking level. Berlaku untuk SEMUA model.
  // Disimpan di localStorage supaya bertahan.
  // MAX TOKEN DIHAPUS dari web (permintaan pemilik 2026-10-04): diatur server
  // lewat env AI_MAX_TOKENS, tidak ada kontrol manual di UI.
  const [modelSetting, setModelSetting] = useState(() => {
    try {
      const s = JSON.parse(window.localStorage.getItem('nexo_ai_setting') || '{}');
      return { thinking: s.thinking ?? 'auto', vision: null };
    } catch { return { thinking: 'auto', vision: null }; }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('nexo_ai_setting', JSON.stringify({ thinking: modelSetting.thinking }));
    } catch { /* abaikan */ }
  }, [modelSetting.thinking]);
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

  // Validasi provider dilakukan SETELAH providerToggle didefinisikan (di bawah),
  // karena toggle menggabung dua sumber (/ai + /providers). Lihat efek di sana.

  // Percakapan mode DISKUSI (chat 2 arah): daftar pesan bergantian.
  // Struktur satu pesan: { peran: 'gw' | 'ai', isi, waktu, error? }
  //
  // CATATAN (fix 2026-10-01): deklarasi ini SEMPAT HILANG saat menambahkan
  // mode kedua - akibatnya halaman AI crash total ("Ada yang error di halaman
  // ini") karena `pesan` dipakai di banyak tempat tapi tidak pernah
  // dideklarasikan. Build tetap lolos karena JS menganggapnya variabel global
  // yang tidak ada; errornya baru muncul saat runtime.
  const [pesan, setPesan] = useState([]);
  // DISKUSI TERSIMPAN (permintaan pemilik 2026-10-02: save/hapus/lanjutkan).
  const [daftarDiskusi, setDaftarDiskusi] = useState([]);
  // Saran pertanyaan DINAMIS dari server (menyesuaikan kondisi data). Diambil
  // dari endpoint terpisah /saran supaya tetap dapat walau /ai bermasalah.
  const [saranDin, setSaranDin] = useState([]);
  const [bukaDiskusi, setBukaDiskusi] = useState(false);
  const [diskusiAktifId, setDiskusiAktifId] = useState(null); // id sesi yang sedang dilanjutkan
  const [memuatDiskusi, setMemuatDiskusi] = useState(false);

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
  const jumlahJatuhTempo = pengingatAktif.filter((p) => p.jatuhTempo).length;

  // Muat percakapan & laporan dari SERVER (lintas device) via prefs.
  // Polling tiap 10 detik supaya device lain ikut update.
  //
  // FIX SINKRONISASI (2026-10-04) - keluhan: "gw buka di mobile, di PC ga ada".
  // Versi lama membandingkan PANJANG array chat:
  //     if (serverChat.length > lastChatLen.current) { ... }
  // Itu SALAH: kalau device ini kebetulan punya chat LEBIH BANYAK (sisa
  // localStorage lama), chat dari device lain TIDAK PERNAH diterapkan.
  //
  // Sekarang pakai WAKTU: server mengirim `updatedAt`. Kita simpan waktu versi
  // lokal; kalau server LEBIH BARU -> pakai versi server (device lain menulis).
  const chatLoaded = useRef(false);
  const lastServerAt = useRef(0);   // updatedAt server terakhir yang kita terapkan
  const lastLocalSave = useRef(0);  // waktu kita terakhir menyimpan (untuk abaikan echo)
  useEffect(() => {
    let batal = false;
    const muat = async () => {
      try {
        const res = await fetch('/api/admin/ai/prefs', { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (batal || !d.ok || !d.prefs) return;
        const serverAt = Number(d.updatedAt || 0);
        // Lewati kalau ini ECHO dari simpanan kita sendiri (dalam 5 detik).
        const echo = serverAt && Date.now() - lastLocalSave.current < 5000;
        if (!echo && serverAt > lastServerAt.current) {
          lastServerAt.current = serverAt;
          if (Array.isArray(d.prefs.chat)) {
            // Hanya timpa kalau server memang lebih baru (device lain menulis).
            setPesan((lokal) => {
              // Jangan kalahkan chat lokal yang lebih panjang HANYA kalau
              // server lebih tua - di sini server sudah dipastikan lebih baru.
              return d.prefs.chat;
            });
            chatLoaded.current = true;
          }
          if (Array.isArray(d.prefs.laporan) && d.prefs.laporan.length) {
            setLaporan(d.prefs.laporan);
          }
        } else if (!chatLoaded.current && Array.isArray(d.prefs.chat)) {
          // Muat pertama kali (belum pernah tersinkron di sesi ini).
          setPesan(d.prefs.chat);
          chatLoaded.current = true;
          if (serverAt) lastServerAt.current = serverAt;
        }
      } catch { /* offline */ }
    };
    muat();
    const iv = setInterval(() => { if (!document.hidden) muat(); }, 10000);
    return () => { batal = true; clearInterval(iv); };
  }, []);

  // Simpan percakapan & laporan ke SERVER + localStorage (debounced 2 detik).
  const chatSaveRef = useRef(null);
  useEffect(() => {
    if (!chatLoaded.current) return;
    clearTimeout(chatSaveRef.current);
    chatSaveRef.current = setTimeout(async () => {
      try { window.localStorage.setItem('nexo_ai_chat', JSON.stringify(pesan.slice(-40))); } catch { /* penuh */ }
      try { window.localStorage.setItem('nexo_ai_laporan', JSON.stringify(laporan.slice(0, 30))); } catch { /* penuh */ }
      try {
        const chatTersimpan = pesan.slice(-40);
        // Tandai waktu simpan supaya polling tidak menganggap ini update
        // dari device lain (echo) dan menimpa balik.
        lastLocalSave.current = Date.now();
        const r = await fetch('/api/admin/ai/prefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat: chatTersimpan, laporan: laporan.slice(0, 30) }),
        });
        // Server balas updatedAt baru -> pakai sebagai patokan terbaru.
        const j = await r.json().catch(() => null);
        if (j?.updatedAt) lastServerAt.current = Number(j.updatedAt);
      } catch { /* offline */ }
    }, 2000);
    return () => clearTimeout(chatSaveRef.current);
  }, [pesan, laporan]);

  // Muat daftar arsip saat komponen dibuka.
  const muatArsip = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai/notes', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setArsip(d.notes || []);
    } catch { /* gagal muat arsip tidak boleh menghalangi pemakaian AI */ }
  }, []);

  useEffect(() => { muatArsip(); }, [muatArsip]);

  // Muat daftar pengingat + perbarui tiap 60 detik supaya penanda "jatuh tempo"
  // ikut hidup tanpa pemilik perlu refresh halaman.
  const muatPengingat = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai/reminders', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
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
    // Pengaman GANDA:
    //   1. AbortController membatalkan fetch kalau > 15 detik.
    //   2. setTimeout KEDUA memaksa layar loading hilang setelah 16 detik,
    //      apa pun yang terjadi (mis. res.json() menggantung). Tanpa ini,
    //      pemilik bisa mentok di "Memeriksa kesiapan AI..." selamanya.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15000);
    const timerPaksa = setTimeout(() => { if (!batal) setMemuatStatus(false); }, 16000);
    (async () => {
      try {
        const res = await fetch('/api/admin/ai', { cache: 'no-store', signal: ac.signal });
        const d = await res.json().catch(() => ({}));
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
        if (!batal) setStatus({ ok: false, aktif: false, errorMuatan: err?.name === 'AbortError' ? 'timeout 15 detik' : (err?.message || String(err)) });
      } finally {
        clearTimeout(timer);
        clearTimeout(timerPaksa);
        if (!batal) setMemuatStatus(false);
      }
    })();
    return () => { batal = true; clearTimeout(timer); clearTimeout(timerPaksa); };
  }, []);

  // Kirim satu permintaan. `muatan` = { tanya } atau { pintasan }.
  // Di mode DISKUSI riwayat percakapan ikut dikirim supaya AI nyambung.
  // Di mode ANALISIS jawaban disimpan sebagai laporan (bukan gelembung chat).
  //
  // JEDA MINIMUM: menghindari dua permintaan beruntun yang menghabiskan kuota
  // per menit. Diberi jeda 5 detik (permintaan pemilik 2026-10-02: "cooldown
  // per pesannya jangan kelamaan").
  const [tungguSampai, setTungguSampai] = useState(0);
  const [detikSisa, setDetikSisa] = useState(0);
  // Topik/pintasan yang SEDANG dijalankan (buat spinner di tombol itu saja).
  const [topikAktif, setTopikAktif] = useState(null);
  // SAFETY: reset jalan/detikSisa kalau stuck > 70 detik (anti-lock).
  useEffect(() => {
    if (!jalan && detikSisa <= 0) return;
    const t = setTimeout(() => { setJalan(false); setDetikSisa(0); }, 70000);
    return () => clearTimeout(t);
  }, [jalan, detikSisa]);
  // Tick setiap detik selama cooldown supaya tombol menampilkan sisa waktu.
  useEffect(() => {
    if (detikSisa <= 0) return;
    const t = setTimeout(() => setDetikSisa((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [detikSisa]);
  const jalankan = useCallback(async (muatan, judul, teksTampil) => {
    // Validasi: wajib ada model & provider. Tanpa ini, request jalan ke default
    // dan menggantung sampai timeout (kejadian nyata 2026-10-02).
    if (!provider?.trim() || !modelInput?.trim()) {
      setValidasiProvider(true); // highlight merah di bar kontrol
      setPanelTampil(true);
      setPesanSimpan('⚠️ Pilih provider & model dulu di bar kontrol.');
      setTimeout(() => setPesanSimpan(null), 6000);
      setTimeout(() => setValidasiProvider(false), 4000);
      return;
    }
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
    setTungguSampai(Date.now() + 5000);
    setDetikSisa(5);
    setJalan(true);
    setTopikAktif(judul || muatan?.pintasan || muatan?.tanya || null);
    const modeKirim = mode;

    // Ambil riwayat SEBELUM pesan baru ditambahkan. IKUT sertakan gambar dari
    // pesan lama supaya model tetap bisa merujuk gambar di pertanyaan lanjutan
    // ("kalau logonya warna apa?"). Tanpa ini, model "lupa" gambarnya.
    const riwayatKirim = [];
    setPesan((p) => {
      for (const m of p.slice(-12)) {
        riwayatKirim.push({ role: m.peran === 'ai' ? 'ai' : 'gw', isi: m.isi, gambar: Array.isArray(m.gambar) ? m.gambar : undefined });
      }
      return p;
    });

    // Gambar hanya untuk mode DISKUSI (analisis berbasis angka).
    // PENTING: jangan kosongkan gambar SEKARANG. Kalau request GAGAL (mis. model
    // salah), pemilik harus bisa kirim ulang gambar yang sama. Gambar baru
    // dihapus dari kotak ketik setelah request BERHASIL.
    const gambarKirim = modeKirim === 'diskusi' ? gambar.slice(0, 4) : [];

    if (modeKirim === 'diskusi') {
      // Tampilkan pesan pemilik lebih dulu supaya terasa responsif.
      setPesan((p) => [...p, { peran: 'gw', isi: teksTampil || judul, waktu: Date.now(), gambar: gambarKirim }]);
    }

    try {
      // Client-side timeout 58 detik (server maxDuration 60s). Kalau API stuck,
      // user dapat error cepat bukan loading tanpa batas.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 58000);
      const res = await fetch('/api/admin/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...muatan, mode: modeKirim, peran, riwayat: riwayatKirim, provider: provider || undefined, model: modelInput.trim() || undefined, thinking: modelSetting.thinking || 'auto', gambar: gambarKirim.length ? gambarKirim : undefined }),
        signal: ac.signal,
      });
      clearTimeout(timer);
      const d = await res.json().catch(() => ({}));

      // Request BERHASIL -> baru kosongkan gambar dari kotak ketik (kalau gagal,
      // gambar tetap ada supaya bisa dikirim ulang ke model yang benar).
      if (d.ok && gambarKirim.length) setGambar([]);

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
            usage: d.usage || null,
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
      // FIX 2026-10-07 ("mode max/thinking timeout 58 dtk"): server sekarang
      // membatalkan di 50 dtk dan membalas error rapi - jadi AbortError di sini
      // (58 dtk) cuma terjadi kalau server benar-benar macet. Pesannya dibuat
      // lebih informatif: sebut mode thinking tinggi memang lebih lambat.
      const pesanError = e?.name === 'AbortError'
        ? 'Timeout 58 detik - AI terlalu lama merespons. Mode thinking tinggi (max/xhigh) memang lebih lambat; coba lagi, turunkan level thinking, atau ganti provider.'
        : 'Gagal menghubungi server: ' + (e?.message || e);
      if (modeKirim === 'diskusi') {
        setPesan((p) => [...p, { peran: 'ai', error: true, isi: pesanError, waktu: Date.now() }]);
      } else {
        setLaporan((l) => [{ judul, error: pesanError, waktu: Date.now() }, ...l]);
      }
    } finally {
      setJalan(false);
      setTopikAktif(null);
      setTimeout(() => {
        if (modeKirim === 'diskusi') ujungChat.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
        else kotakHasil.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 80);
    }
  }, [mode, tungguSampai, provider, modelInput, modelSetting, gambar, peran]);

  const kirimBebas = (e) => {
    e.preventDefault();
    const t = tanya.trim();
    // Boleh kirim gambar tanpa teks (pertanyaan default "jelaskan gambar ini").
    if ((!t && gambar.length === 0) || jalan) return;
    setTanya('');
    // Kalau sedang balas pesan: sisipkan kutipan sebagai konteks ke AI.
    const kutipan = balas ? `(Menjawab pesan ${balas.peran === 'ai' ? 'AI' : 'saya'} sebelumnya: "${String(balas.cuplikan).slice(0, 300)}")\n\n` : '';
    const teks = kutipan + (t || 'Jelaskan gambar ini dan kaitkan dengan data NEXO kalau relevan.');
    const tampil = (balas ? `↩ ${t || 'gambar'}` : (t || 'Jelaskan gambar ini'));
    setBalas(null);
    jalankan({ tanya: teks }, tampil.length > 60 ? tampil.slice(0, 60) + '...' : tampil, tampil);
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

  // Hapus SATU pesan dari percakapan (permintaan pemilik 2026-10-02:
  // "setiap chat ini juga bisa gw hapus").
  const hapusSatuPesan = useCallback((idx) => {
    setPesan((p) => p.filter((_, i) => i !== idx));
  }, []);

  // ==========================================
  // DISKUSI TERSIMPAN (save / lanjut / hapus)
  // ==========================================
  const muatDiskusi = useCallback(async () => {
    setMemuatDiskusi(true);
    try {
      const res = await fetch('/api/admin/ai/diskusi', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setDaftarDiskusi(d.diskusi || []);
    } catch { /* abaikan */ }
    finally { setMemuatDiskusi(false); }
  }, []);
  useEffect(() => { muatDiskusi(); }, [muatDiskusi]);

  // Simpan percakapan sekarang. Kalau sedang melanjutkan sesi (diskusiAktifId),
  // perbarui (PATCH) supaya tidak menumpuk salinan.
  const simpanDiskusi = useCallback(async () => {
    if (pesan.length === 0) return;
    const judul =
      (pesan.find((m) => m.peran === 'gw')?.isi || 'Diskusi tanpa judul').slice(0, 80);
    const muatan = { judul, pesan, model: modelInput || null, provider: provider || null };
    try {
      const res = await fetch(
        '/api/admin/ai/diskusi' + (diskusiAktifId ? '?id=' + diskusiAktifId : ''),
        { method: diskusiAktifId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(muatan) }
      );
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        if (!diskusiAktifId && d.id) setDiskusiAktifId(d.id);
        setPesanSimpan(diskusiAktifId ? 'Diskusi diperbarui.' : 'Diskusi disimpan.');
        await muatDiskusi();
      } else setPesanSimpan('Gagal simpan: ' + (d.error || 'tidak diketahui'));
    } catch (e) { setPesanSimpan('Gagal simpan: ' + e.message); }
    setTimeout(() => setPesanSimpan(null), 4000);
  }, [pesan, modelInput, provider, diskusiAktifId, muatDiskusi]);

  // Buka (lanjutkan) diskusi tersimpan.
  const lanjutkanDiskusi = useCallback(async (d) => {
    // Daftar hanya kirim metadata. Ambil isi lengkap lewat ?id=N.
    let isi = Array.isArray(d.pesan) ? d.pesan : null;
    if (!isi) {
      try {
        const res = await fetch('/api/admin/ai/diskusi?id=' + d.id, { cache: 'no-store' });
        const r = await res.json().catch(() => ({}));
        if (r.ok && Array.isArray(r.diskusi?.pesan)) isi = r.diskusi.pesan;
      } catch { /* gagal - tetap buka kosong */ }
    }
    setPesan(Array.isArray(isi) ? isi : []);
    setDiskusiAktifId(d.id);
    if (d.provider) setProvider(d.provider);
    if (d.model) setModelInput(d.model);
    setMode('diskusi');
    setBukaDiskusi(false);
    setPesanSimpan(`Melanjutkan: ${d.judul}`);
    setTimeout(() => setPesanSimpan(null), 4000);
  }, []);

  // Hapus SATU diskusi tersimpan (dengan konfirmasi).
  const hapusDiskusi = useCallback((d) => {
    setKonfirmasi({
      judul: 'Hapus diskusi ini?',
      body: `Diskusi "${d.judul}" akan dihapus permanen.`,
      jalankan: async () => {
        const res = await fetch('/api/admin/ai/diskusi?id=' + d.id, { method: 'DELETE' });
        const r = await res.json().catch(() => ({}));
        if (r.ok) {
          if (diskusiAktifId === d.id) setDiskusiAktifId(null);
          await muatDiskusi();
          setPesanSimpan('Diskusi dihapus.');
          setTimeout(() => setPesanSimpan(null), 3000);
        }
      },
    });
  }, [diskusiAktifId, muatDiskusi]);

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
      const d = await res.json().catch(() => ({}));
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
        const d = await res.json().catch(() => ({}));
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
      const d = await res.json().catch(() => ({}));
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
        const d = await res.json().catch(() => ({}));
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
      const d = await res.json().catch(() => ({}));
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

  // Muat daftar provider kustom SAAT MOUNT (tidak menunggu panel kelola dibuka).
  // Muat daftar provider kustom SAAT MOUNT (tidak menunggu panel kelola dibuka).
  useEffect(() => { muatKelola(); }, [muatKelola]);

  // Muat SARAN dari agen (prioritas) per peran. Fetch ulang saat peran berubah
  // supaya kartu saran menyesuaikan peran yang dipilih (permintaan pemilik
  // 2026-10-02: "saran diambil dari agen yang beneran cek").
  const muatSaran = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai/saran?peran=' + encodeURIComponent(peran || 'umum'), { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok && Array.isArray(d.saran)) setSaranDin(d.saran);
    } catch { /* gagal - pakai fallback lokal */ }
  }, [peran]);
  useEffect(() => { muatSaran(); }, [muatSaran]);

  // CARI TOPIK via AI: AI membaca data terkini lalu usulkan pertanyaan paling
  // relevan (permintaan pemilik 2026-10-02: "langsung dari ai aja yang relevan").
  // Menggantikan tombol "Muat ulang".
  const [saranAI, setSaranAI] = useState(false);
  // FIX 2026-10-06: pesan hasil "Cari topik AI" khusus ditampilkan DI BAWAH
  // tombol (dulu pesannya nyasar ke bawah halaman sehingga user tidak lihat).
  const [pesanSaranAI, setPesanSaranAI] = useState(null); // { ok, teks }
  // Cooldown 60 detik setelah generate - hemat token & cegah spam.
  const [saranAICooldown, setSaranAICooldown] = useState(0);
  useEffect(() => {
    if (saranAICooldown <= 0) return;
    const t = setTimeout(() => setSaranAICooldown((d) => d - 1), 1000);
    return () => clearTimeout(t);
  }, [saranAICooldown]);
  const muatSaranAI = useCallback(async () => {
    if (saranAICooldown > 0) {
      setPesanSimpan(`Tunggu ${saranAICooldown} detik lagi sebelum cari topik baru.`);
      setTimeout(() => setPesanSimpan(null), 3000);
      return;
    }
    if (!provider?.trim() || !modelInput?.trim()) {
      setPesanSimpan('⚠️ Pilih provider & model dulu untuk cari topik AI.');
      setValidasiProvider(true);
      setPanelTampil(true);
      setTimeout(() => setPesanSimpan(null), 5000);
      setTimeout(() => setValidasiProvider(false), 4000);
      return;
    }
    setSaranAI(true);
    setSaranAICooldown(60); // mulai cooldown
    setPesanSaranAI(null);
    try {
      const url = '/api/admin/ai/saran?peran=' + encodeURIComponent(peran || 'umum') + '&ai=1'
        + '&provider=' + encodeURIComponent(provider) + '&model=' + encodeURIComponent(modelInput.trim());
      const res = await fetch(url, { cache: 'no-store' });
      // FIX 2026-10-07 ("tidak ada alasan dari server"): dulu kalau server
      // dipotong (timeout 60 dtk Vercel), body BUKAN JSON -> `d = {}` -> UI
      // menampilkan pesan generik tanpa sebab. Sekarang dibedakan: respons
      // non-JSON (kemungkinan timeout) dapat pesan yang menjelaskan.
      const rawTxt = await res.text().catch(() => '');
      let d = {};
      try { d = JSON.parse(rawTxt); } catch { d = {}; }
      const bodyNonJson = rawTxt && Object.keys(d).length === 0;
      // FIX 2026-10-06 (laporan pemilik: "udah gw pake AI kok tetep ga refresh"):
      //   Dulu server diam-diam fallback ke saran lama saat AI gagal (ok:true),
      //   jadi UI terlihat "tidak refresh" tanpa penjelasan. Sekarang server
      //   jujur (ok:false + alasan) dan UI MENAMPILKAN alasan aslinya di bawah
      //   tombol supaya pemilik tahu harus apa (ganti model, cek kuota, dst).
      if (d.ok && Array.isArray(d.saran) && d.saran.length) {
        setSaranDin(d.saran);
        // Bersihkan dismiss HANYA saat sukses - tag baru pasti tampil semua.
        setSaranDismiss(new Set());
        setPesanSaranAI({ ok: true, teks: `✓ ${d.saran.length} topik baru dari AI siap dipakai - lihat tag di bawah.` });
      } else {
        const alasanTampil = d.error
          ? d.error
          : (bodyNonJson
            ? 'Server tidak sempat menjawab (timeout 60 detik). Model ini terlalu lambat untuk data sekarang - coba lagi, atau ganti ke model yang lebih cepat.'
            : 'tidak ada alasan dari server.');
        setPesanSaranAI({ ok: false, teks: 'AI gagal bikin topik: ' + alasanTampil });
        // Gagal bukan alasan mengunci user 60 dtk - kurangi cooldown supaya
        // bisa langsung coba lagi (mis. setelah ganti model).
        setSaranAICooldown(10);
      }
    } catch {
      setPesanSaranAI({ ok: false, teks: 'Gagal menghubungi server untuk cari topik AI. Cek koneksi lalu coba lagi.' });
      setSaranAICooldown(10);
    }
    finally { setSaranAI(false); }
  }, [peran, provider, modelInput, saranAICooldown]);

  // Muat ulang daftar status (provider bawaan + kustom + model) supaya toggle
  // langsung menampilkan provider baru tanpa refresh halaman. Ikut muat ulang
  // daftar provider kustom (sumber cadangan kalau /ai bermasalah).
  const muatStatusUlang = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ai', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setStatus(d);
    } catch { /* abaikan */ }
    muatKelola();
  }, [muatKelola]);

  const [provMenyimpan, setProvMenyimpan] = useState(false);
  const simpanProvider = useCallback(async () => {
    // Validasi + highlight field yang kosong.
    const modeEdit = Boolean(editProvId);
    const keysFinal = keyBaru.trim() ? [...apiKeys, keyBaru.trim()] : apiKeys;
    const err = {};
    if (!formProv.nama.trim()) err.nama = true;
    if (!formProv.base_url.trim()) err.base_url = true;
    // API key wajib untuk provider BARU (saat edit, boleh kosong = tidak ubah).
    if (!modeEdit && keysFinal.length === 0) err.api_key = true;
    if (Object.keys(err).length) {
      setErrProv(err);
      flashKelola('Field merah wajib diisi.');
      setTimeout(() => setErrProv({}), 4000);
      return;
    }
    const kunciGabung = keysFinal.join(',');
    setProvMenyimpan(true);
    try {
      const res = await fetch('/api/admin/ai/providers' + (modeEdit ? '?id=' + editProvId : ''), {
        method: modeEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipe: 'provider', nama: formProv.nama, base_url: formProv.base_url, api_key: kunciGabung }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        setFormProv({ nama: '', base_url: '', api_key: '' });
        setApiKeys([]);
        setKeyBaru('');
        setEditProvId(null);
        setPesanSimpan(modeEdit ? '✓ Provider diperbarui.' : '✓ Provider ditambahkan.');
        setTimeout(() => setPesanSimpan(null), 4000);
        await Promise.all([muatKelola(), muatStatusUlang()]);
      } else {
        flashKelola('Gagal: ' + (d.error || 'tidak diketahui'));
      }
    } catch (e) { flashKelola('Gagal: ' + e.message); }
    finally { setProvMenyimpan(false); }
  }, [formProv, apiKeys, keyBaru, editProvId, muatKelola, muatStatusUlang]);

  // Isi form dengan data provider yang mau diedit. Field key dikosongkan -
  // kosong = jangan ubah kunci lama (dijaga di PATCH).
  const mulaiEditProvider = useCallback((p) => {
    setEditProvId(p.id);
    setFormProv({ nama: p.nama, base_url: p.baseUrl, api_key: '' });
    setApiKeys([]);
    setKeyBaru('');
    setLihatInputKunci(false);
    setTesHasil({ status: 'idle' });
  }, []);

  const batalEditProvider = useCallback(() => {
    setEditProvId(null);
    setFormProv({ nama: '', base_url: '', api_key: '' });
    setApiKeys([]);
    setKeyBaru('');
    setTesHasil({ status: 'idle' });
  }, []);

  const hapusProvider = useCallback(async (id) => {
    const p = daftarProvider.find((x) => x.id === id);
    const jumlahModel = daftarModel.filter((m) => m.provider === p?.slug).length;
    setKonfirmasi({
      judul: 'Hapus provider ini?',
      body: `Provider "${p?.nama || ''}" akan dihapus permanen.${jumlahModel > 0 ? ` ${jumlahModel} model tersimpan yang memakainya JUGA ikut terhapus.` : ''}`,
      jalankan: async () => {
        const res = await fetch('/api/admin/ai/providers?id=' + id, { method: 'DELETE' });
        const d = await res.json().catch(() => ({}));
        if (d.ok) {
          setPesanSimpan(`✓ Provider dihapus${d.modelTerhapus ? ` + ${d.modelTerhapus} model ikut terhapus` : ''}.`);
          setTimeout(() => setPesanSimpan(null), 4000);
          await Promise.all([muatKelola(), muatStatusUlang()]);
        }
        else { setPesanSimpan('Gagal: ' + (d.error || 'tidak diketahui')); setTimeout(() => setPesanSimpan(null), 4000); }
      },
    });
  }, [daftarProvider, daftarModel, muatKelola, muatStatusUlang]);

  const [modelMenyimpan, setModelMenyimpan] = useState(false);
  const simpanModel = useCallback(async () => {
    // Validasi + highlight field yang kosong.
    const err = {};
    if (!formModel.label.trim()) err.label = true;
    if (!formModel.model.trim()) err.model = true;
    if (!formModel.provider.trim()) err.provider = true;
    if (Object.keys(err).length) {
      setErrModel(err);
      flashKelola('Field merah wajib diisi.');
      setTimeout(() => setErrModel({}), 4000);
      return;
    }
    const modeEdit = Boolean(editModelId);
    if (!modeEdit) {
      const duplikat = daftarModel.find((m) => m.model === formModel.model.trim() && m.provider === formModel.provider.trim());
      if (duplikat) {
        setPesanSimpan(`⚠ Model "${formModel.model}" di provider "${formModel.provider}" sudah tersimpan.`);
        setTimeout(() => setPesanSimpan(null), 4000);
        return;
      }
    }
    setModelMenyimpan(true);
    try {
      const res = await fetch('/api/admin/ai/providers' + (modeEdit ? '?id=' + editModelId : ''), {
        method: modeEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipe: 'model', ...formModel }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        setFormModel({ label: '', model: '', provider: '', max_tokens: '', thinking: '' });
        setEditModelId(null);
        setPesanSimpan(modeEdit ? '✓ Model diperbarui.' : '✓ Model disimpan.');
        setTimeout(() => setPesanSimpan(null), 4000);
        await Promise.all([muatKelola(), muatStatusUlang()]);
      } else flashKelola('Gagal: ' + (d.error || 'tidak diketahui'));
    } catch (e) { flashKelola('Gagal: ' + e.message); }
    finally { setModelMenyimpan(false); }
  }, [formModel, editModelId, daftarModel, muatKelola, muatStatusUlang]);

  const mulaiEditModel = useCallback((m) => {
    setEditModelId(m.id);
    setFormModel({
      label: m.label, model: m.model, provider: m.provider,
      max_tokens: m.maxTokens == null ? '' : String(m.maxTokens),
      thinking: m.kecerdasan == null ? '' : String(m.kecerdasan),
    });
  }, []);

  const batalEditModel = useCallback(() => {
    setEditModelId(null);
    setFormModel({ label: '', model: '', provider: '', max_tokens: '', thinking: '' });
  }, []);

  const hapusModel = useCallback(async (id) => {
    const m = daftarModel.find((x) => x.id === id);
    setKonfirmasi({
      judul: 'Hapus model ini?',
      body: `Model "${m?.label || ''}" (${m?.model || ''}) akan dihapus dari daftar tersimpan.`,
      jalankan: async () => {
        const res = await fetch('/api/admin/ai/providers?id=' + id + '&tipe=model', { method: 'DELETE' });
        const d = await res.json().catch(() => ({}));
        if (d.ok) { setPesanSimpan('✓ Model dihapus.'); setTimeout(() => setPesanSimpan(null), 4000); await Promise.all([muatKelola(), muatStatusUlang()]); }
        else { setPesanSimpan('Gagal: ' + (d.error || 'tidak diketahui')); setTimeout(() => setPesanSimpan(null), 4000); }
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
  // Thinking) di bar kontrol atas.
  const pakaiModel = useCallback((m) => {
    setProvider(m.provider);
    setModelInput(m.model);
    // JANGAN timpa setting global (max token/Thinking) - pemilik mengatur
    // sekali di bar kontrol dan berlaku untuk semua model (permintaan 2026-10-02).
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
      const d = await res.json().catch(() => ({}));
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
    // Sertakan keyBaru kalau belum diklik "+ Tambah" (fix 2026-10-02).
    const keysFinal = keyBaru.trim() ? [...apiKeys, keyBaru.trim()] : apiKeys;
    try {
      const res = await fetch('/api/admin/ai/tes-koneksi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: formProv.base_url, api_key: keysFinal.join(',') }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setTesHasil({ status: 'ok', pesan: d.pesan, url: d.urlDicek, contoh: d.contoh || [] });
      else setTesHasil({ status: 'gagal', pesan: d.pesan || d.error || 'Gagal.', url: d.urlDicek });
    } catch (e) {
      setTesHasil({ status: 'gagal', pesan: e.message });
    }
  }, [formProv, apiKeys, keyBaru]);

  const cekModel = useCallback(async () => {
    const m = modelInput.trim();
    if (!m) { setCekHasil({ status: 'gagal', pesan: 'Isi nama model dulu.' }); return; }
    setCekHasil({ status: 'cek' });
    try {
      const res = await fetch(`/api/admin/ai/cek-model?provider=${encodeURIComponent(provider || '')}&model=${encodeURIComponent(m)}`, { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
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
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        setModelProv({ status: 'ok', models: d.models || [], jumlah: d.jumlah || 0, jumlahGratis: d.jumlahGratis || 0, hanyaGratis: g, label: d.label, url: d.urlDicek });
      } else {
        setModelProv({ status: 'gagal', models: [], hanyaGratis: g, pesan: d.error || 'Gagal memuat.', url: d.urlDicek });
      }
    } catch (e) {
      setModelProv({ status: 'gagal', models: [], hanyaGratis: g, pesan: e.message });
    }
  }, [provider, modelProv.hanyaGratis]);

  // Muat model dari SEMUA provider sekaligus (permintaan pemilik 2026-10-02:
  // "gw mau liat semua model ai dari semua provider, lengkap yang free").
  const muatModelSemua = useCallback(async (hanyaGratis) => {
    const g = hanyaGratis ?? modelProv.hanyaGratis;
    setModelProv((s) => ({ ...s, status: 'cek', hanyaGratis: g, semuaProvider: true }));
    try {
      const res = await fetch(`/api/admin/ai/daftar-model?semua=1&gratis=${g ? '1' : '0'}`, { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        setModelProv({
          status: 'ok', models: d.models || [], jumlah: d.jumlah || 0,
          jumlahGratis: d.jumlah || 0, hanyaGratis: g, semuaProvider: true,
          perProvider: d.perProvider || [],
          label: 'Semua provider',
        });
      } else {
        setModelProv({ status: 'gagal', models: [], hanyaGratis: g, semuaProvider: true, pesan: d.error || 'Gagal memuat.' });
      }
    } catch (e) {
      setModelProv({ status: 'gagal', models: [], hanyaGratis: g, semuaProvider: true, pesan: e.message });
    }
  }, [modelProv.hanyaGratis]);

  // Uji model yang sedang tampil di daftar (batch). Hanya dijalankan saat
  // pemilik menekan tombol. Hasil di-cache 24 jam di server.
  const ujiModelTampil = useCallback(async () => {
    const daftar = (modelProv.models || []).map((m) => m.id).filter(Boolean).slice(0, 40);
    if (!daftar.length) return;
    setUjiJalan(true);
    try {
      if (modelProv.semuaProvider) {
        // Mode semua-provider: uji per provider secara berurutan.
        const perProv = {};
        for (const m of modelProv.models) {
          if (!m.providerId) continue;
          (perProv[m.providerId] = perProv[m.providerId] || []).push(m.id);
        }
        for (const [provId, models] of Object.entries(perProv)) {
          try {
            const res = await fetch('/api/admin/ai/uji-model', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: provId, models: models.slice(0, 40) }),
            });
            const d = await res.json().catch(() => ({}));
            if (d.ok) {
              setUjiHasil((s) => {
                const next = { ...s };
                for (const h of d.hasil || []) next[`${provId}::${h.model}`] = { ok: h.ok, alasan: h.alasan };
                return next;
              });
            }
          } catch { /* lewati provider ini */ }
        }
      } else {
        const res = await fetch('/api/admin/ai/uji-model', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider || '', models: daftar }),
        });
        const d = await res.json().catch(() => ({}));
        if (d.ok) {
          setUjiHasil((s) => {
            const next = { ...s };
            for (const h of d.hasil || []) next[`${provider || ''}::${h.model}`] = { ok: h.ok, alasan: h.alasan };
            return next;
          });
        } else setPesanSimpan('Gagal uji: ' + (d.error || 'tidak diketahui'));
      }
    } catch (e) { setPesanSimpan('Gagal uji: ' + e.message); }
    finally { setUjiJalan(false); setTimeout(() => setPesanSimpan(null), 4000); }
  }, [modelProv.models, modelProv.semuaProvider, provider]);
  const muatUsage = useCallback(async () => {
    setUsage({ status: 'cek' });
    try {
      const res = await fetch(`/api/admin/ai/usage?provider=${encodeURIComponent(provider || '')}`, { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok) setUsage({ status: 'ok', data: d });
      else setUsage({ status: 'gagal', pesan: d.error || 'Gagal cek kuota.' });
    } catch (e) {
      setUsage({ status: 'gagal', pesan: e.message });
    }
  }, [provider]);

  // DAFTAR PROVIDER UNTUK TOGGLE: gabung provider dari /ai (bawaan + kustom)
  // dengan yang dari /providers. Kalau /ai bermasalah, /providers menutupinya
  // supaya tombol provider tetap muncul (fix 2026-10-02).
  // Provider yang dipakai AGEN dikecualikan (dedicated ke agent).
  const [agentProviderId, setAgentProviderId] = useState('');
  useEffect(() => {
    (async () => {
      // Baca dari SERVER prefs dulu (lintas device), fallback localStorage.
      try {
        const res = await fetch('/api/admin/ai/prefs', { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (d.ok && d.prefs?.agentProvider) { setAgentProviderId(d.prefs.agentProvider); return; }
      } catch { /* fallback */ }
      try { setAgentProviderId(window.localStorage.getItem('nexo_agen_provider') || ''); } catch { /* abaikan */ }
    })();
  }, []);
  const providerToggle = (() => {
    const hasil = [...(status?.providers || [])];
    const adaSlug = new Set(hasil.map((p) => p.id));
    for (const p of (daftarProvider || [])) {
      if (!adaSlug.has(p.slug)) {
        hasil.push({ id: p.slug, label: p.nama, model: '', kunci: p.adaKunci ? 1 : 0, kustom: true });
        adaSlug.add(p.slug);
      }
    }
    // Kecualikan provider agent (dedicated).
    return agentProviderId ? hasil.filter((p) => p.id !== agentProviderId) : hasil;
  })();

  // PENTING: kalau provider tersimpan (localStorage) tidak valid/tidak ada di
  // daftar-toggle, paksa pilih yang PERTAMA. Tanpa ini, `provider` kosong ->
  // server pakai default -> model (mis. qwen) dikirim ke provider salah ->
  // "No model found" (kejadian nyata 2026-10-02).
  useEffect(() => {
    if (!providerToggle.length) return;
    const valid = providerToggle.some((p) => p.id === provider);
    if (!valid) setProvider(providerToggle[0].id);
  }, [providerToggle, provider]);

  // Mode DISKUSI & ANALISIS dipakai dari `mode` (satu state).

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
            <ul className="mt-2 space-y-2">
              {daftarProvider.map((p) => (
                <li key={p.id} className="rounded-xl border border-border-soft bg-bg-soft/40">
                  {/* Baris utama: nama + URL + badge key */}
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{p.nama}</p>
                      <p className="truncate text-[0.7rem] text-ink-muted">{p.baseUrl}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-bg-soft px-2 py-0.5 text-[0.65rem] font-semibold text-ink-muted">
                      {p.jumlahKunci || 0} key
                    </span>
                  </div>
                  {/* Baris aksi: tombol */}
                  <div className="flex items-center gap-1.5 border-t border-border-soft/50 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleLihatKunci(p.id)}
                      title={kunciTerlihat[p.id] ? 'Sembunyikan kunci' : 'Lihat kunci'}
                      className="flex items-center gap-1 rounded-lg border border-border-soft px-2 py-1 text-[0.7rem] font-medium text-ink-muted transition hover:border-accent/50 hover:text-ink cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {kunciTerlihat[p.id] ? (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                            <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/>
                            <path d="M1 1l22 22"/>
                          </>
                        ) : (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </>
                        )}
                      </svg>
                      <span className="hidden xs:inline">{kunciTerlihat[p.id] ? 'Sembunyi' : 'Lihat'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => mulaiEditProvider(p)}
                      className="rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => hapusProvider(p.id)}
                      className="ml-auto rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                  {/* Daftar key terlihat (saat toggle aktif) */}
                  {kunciTerlihat[p.id] && p.kunci && (
                    <div className="border-t border-border-soft/50 bg-card-cream px-3 py-2">
                      <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint">API Key ({p.jumlahKunci})</p>
                      <ul className="mt-1 space-y-1">
                        {p.kunci.map((k) => (
                          <li key={k.id} className="break-all font-mono text-[0.65rem] text-ink-muted">{k.tersamar}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Form provider (tambah / edit) */}
          <div className={`mt-4 rounded-xl border p-3 sm:p-4 ${editProvId ? 'border-accent/50 bg-accent/5' : 'border-border-soft bg-bg-soft/30'}`}>
            <p className="text-xs font-bold text-ink-muted">{editProvId ? 'Edit provider' : 'Tambah provider'}</p>

            {/* Nama + URL base: stack di mobile, side-by-side di sm+ */}
            <div className="mt-3 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-3">
              <label className="flex flex-col gap-1">
                <span className={`text-[0.7rem] font-semibold ${errProv.nama ? 'text-danger' : 'text-ink-faint'}`}>Nama{errProv.nama ? ' *wajib' : ''}</span>
                <input
                  value={formProv.nama}
                  onChange={(e) => { setFormProv({ ...formProv, nama: e.target.value }); if (errProv.nama) setErrProv((x) => ({ ...x, nama: false })); }}
                  placeholder="DeepSeek"
                  className={`w-full rounded-lg border bg-card-cream px-3 py-2 text-sm text-ink outline-none transition ${errProv.nama ? 'border-danger ring-2 ring-danger/30' : 'border-border-soft focus:border-accent'}`}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={`text-[0.7rem] font-semibold ${errProv.base_url ? 'text-danger' : 'text-ink-faint'}`}>URL base{errProv.base_url ? ' *wajib' : ''}</span>
                <input
                  value={formProv.base_url}
                  onChange={(e) => { setFormProv({ ...formProv, base_url: e.target.value }); if (errProv.base_url) setErrProv((x) => ({ ...x, base_url: false })); }}
                  placeholder="https://api.deepseek.com/v1"
                  className={`w-full rounded-lg border bg-card-cream px-3 py-2 text-sm text-ink outline-none transition ${errProv.base_url ? 'border-danger ring-2 ring-danger/30' : 'border-border-soft focus:border-accent'}`}
                />
              </label>
            </div>

            {/* API Key section */}
            <div className="mt-3">
              <span className={`text-[0.7rem] font-semibold ${errProv.api_key ? 'text-danger' : 'text-ink-faint'}`}>API Key{errProv.api_key ? ' *wajib' : ''}</span>
              <div className={`mt-1 rounded-lg border bg-card-cream p-2.5 ${errProv.api_key ? 'border-danger ring-2 ring-danger/30' : 'border-border-soft'}`}>
                {/* Daftar key yang sudah ada */}
                {apiKeys.length > 0 && (
                  <ul className="mb-2 max-h-36 space-y-1 overflow-y-auto">
                    {apiKeys.map((k, i) => (
                      <li key={i} className="flex items-center gap-2 rounded bg-bg-soft/50 px-2 py-1.5">
                        <span className={`min-w-0 flex-1 truncate font-mono text-[0.7rem] ${lihatInputKunci ? 'text-ink' : 'text-ink-muted'}`}>
                          {lihatInputKunci ? k : k.slice(0, 8) + '...' + k.slice(-4)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setApiKeys((arr) => arr.filter((_, j) => j !== i))}
                          title="Hapus kunci ini"
                          className="shrink-0 rounded p-1 text-ink-faint transition hover:text-danger cursor-pointer"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Input key baru */}
                <div className="flex gap-1.5">
                  <input
                    value={keyBaru}
                    onChange={(e) => setKeyBaru(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && keyBaru.trim()) {
                        e.preventDefault();
                        setApiKeys((arr) => [...arr, keyBaru.trim()]);
                        setKeyBaru('');
                      }
                    }}
                    placeholder={editProvId ? 'Tempel key BARU (lama tetap tersimpan)' : 'Tempel API key baru di sini'}
                    type={lihatInputKunci ? 'text' : 'password'}
                    className="flex-1 min-w-0 rounded-lg border border-border-soft bg-bg-soft/50 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={() => { if (keyBaru.trim()) { setApiKeys((arr) => [...arr, keyBaru.trim()]); setKeyBaru(''); } }}
                    disabled={!keyBaru.trim()}
                    className="shrink-0 rounded-lg border border-accent/40 px-3 py-2 text-xs font-bold text-accent transition hover:bg-accent/10 disabled:opacity-40 cursor-pointer"
                  >
                    + Tambah
                  </button>
                  {/* Toggle lihat/sembunyikan input */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (editProvId && !lihatInputKunci && apiKeys.length === 0) {
                        await toggleLihatKunci(editProvId);
                        const asli = kunciTerlihat[editProvId];
                        if (asli) {
                          setApiKeys(asli.split(',').map((k) => k.trim()).filter(Boolean));
                          setLihatInputKunci(true);
                        } else { setPesanSimpan('Kunci tersimpan tidak bisa dibaca.'); setTimeout(() => setPesanSimpan(null), 4000); }
                        return;
                      }
                      setLihatInputKunci((v) => !v);
                    }}
                    title={lihatInputKunci ? 'Sembunyikan kunci' : 'Lihat kunci'}
                    className="shrink-0 rounded-lg border border-border-soft px-2.5 py-2 text-ink-muted transition hover:text-ink cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {lihatInputKunci ? (
                        <>
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/>
                          <path d="M1 1l22 22"/>
                        </>
                      ) : (
                        <>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Tombol aksi */}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={tesKoneksiProv}
                disabled={tesHasil.status === 'cek'}
                className="rounded-lg border border-border-soft px-3 py-2 text-xs font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink disabled:opacity-50 cursor-pointer"
              >
                {tesHasil.status === 'cek' ? 'Tes...' : 'Tes koneksi'}
              </button>
              <button
                type="button"
                onClick={simpanProvider}
                disabled={provMenyimpan}
                className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {provMenyimpan ? 'Menyimpan...' : (editProvId ? 'Simpan perubahan' : 'Simpan provider')}
              </button>
              {editProvId && (
                <button
                  type="button"
                  onClick={batalEditProvider}
                  className="rounded-lg border border-border-soft px-3 py-2 text-xs font-bold text-ink-muted transition hover:text-ink cursor-pointer"
                >
                  Batal
                </button>
              )}
            </div>
            {editProvId && (
              <p className="mt-1.5 text-[0.65rem] text-ink-faint">Tempel key baru = nambah. Kosongkan = biarkan key lama.</p>
            )}
            {/* Hasil tes koneksi */}
            {tesHasil.status === 'ok' && (
              <div className="mt-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
                <p className="font-semibold">✓ {tesHasil.pesan}</p>
                {tesHasil.contoh?.length > 0 && (
                  <p className="mt-0.5 break-all font-mono text-[0.65rem] text-ink-muted">Contoh: {tesHasil.contoh.join(', ')}</p>
                )}
              </div>
            )}
            {tesHasil.status === 'gagal' && (
              <div className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
                <p className="font-semibold">{tesHasil.pesan}</p>
                {tesHasil.url && (
                  <p className="mt-0.5 break-all font-mono text-[0.65rem] text-ink-muted">Dicek: {tesHasil.url}</p>
                )}
              </div>
            )}
          </div>

          {/* Model tersimpan */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint">Model tersimpan ({daftarModel.length})</p>
            {(() => {
              // Hitung duplikat (model+provider sama).
              const lihat = new Set();
              let jumlahDuplikat = 0;
              for (const m of daftarModel) {
                const kunci = `${m.model}::${m.provider}`;
                if (lihat.has(kunci)) jumlahDuplikat++;
                lihat.add(kunci);
              }
              if (jumlahDuplikat === 0) return null;
              return (
                <button
                  type="button"
                  onClick={() => {
                    setKonfirmasi({
                      judul: `Hapus ${jumlahDuplikat} model duplikat?`,
                      body: 'Model dengan nama & provider yang sama akan dihapus. Yang pertama kali disimpan tetap ada.',
                      jalankan: async () => {
                        setPesanSimpan('Menghapus duplikat...');
                        const lihat2 = new Set();
                        const hapusIds = [];
                        for (const m of daftarModel) {
                          const kunci = `${m.model}::${m.provider}`;
                          if (lihat2.has(kunci)) hapusIds.push(m.id);
                          else lihat2.add(kunci);
                        }
                        for (const id of hapusIds) {
                          try { await fetch('/api/admin/ai/providers?id=' + id + '&tipe=model', { method: 'DELETE' }); } catch { /* lanjut */ }
                        }
                        setPesanSimpan(`✓ ${hapusIds.length} duplikat dihapus.`);
                        setTimeout(() => setPesanSimpan(null), 4000);
                        await Promise.all([muatKelola(), muatStatusUlang()]);
                      },
                    });
                  }}
                  className="rounded-lg border border-danger/40 px-2 py-0.5 text-[0.65rem] font-bold text-danger transition hover:bg-danger/10 cursor-pointer"
                >
                  Hapus {jumlahDuplikat} duplikat
                </button>
              );
            })()}
          </div>
          {daftarModel.length === 0 ? (
            <p className="mt-2 text-xs text-ink-muted">Belum ada model tersimpan.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {daftarModel.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-bg-soft/40 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{m.label}</p>
                    <p className="truncate text-[0.7rem] text-ink-muted">{m.provider} • {m.model}</p>
                    {/* Kolom DB 'kecerdasan' menyimpan LEVEL THINKING (teks).
                        Maks token tidak ditampilkan lagi (dihapus dari web 2026-10-04). */}
                    {m.kecerdasan && (
                      <p className="text-[0.65rem] text-ink-faint">
                        Thinking: {THINKING_LABEL[m.kecerdasan] || m.kecerdasan}
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
                onChange={(e) => { setFormModel({ ...formModel, label: e.target.value }); if (errModel.label) setErrModel((x) => ({ ...x, label: false })); }}
                placeholder={errModel.label ? '* Label wajib' : 'Label (mis. Nemotron Cepat)'}
                className={`rounded-lg border bg-card-cream px-3 py-1.5 text-xs text-ink outline-none transition ${errModel.label ? 'border-danger ring-2 ring-danger/30' : 'border-border-soft focus:border-accent'}`}
              />
              <input
                value={formModel.model}
                onChange={(e) => { setFormModel({ ...formModel, model: e.target.value }); if (errModel.model) setErrModel((x) => ({ ...x, model: false })); }}
                placeholder={errModel.model ? '* Nama model wajib' : 'Nama model (mis. nvidia/nemotron...:free)'}
                className={`rounded-lg border bg-card-cream px-3 py-1.5 text-xs text-ink outline-none transition ${errModel.model ? 'border-danger ring-2 ring-danger/30' : 'border-border-soft focus:border-accent'}`}
              />
              <select
                value={formModel.provider}
                onChange={(e) => { setFormModel({ ...formModel, provider: e.target.value }); if (errModel.provider) setErrModel((x) => ({ ...x, provider: false })); }}
                className={`rounded-lg border bg-card-cream px-3 py-1.5 text-xs text-ink outline-none transition ${errModel.provider ? 'border-danger ring-2 ring-danger/30' : 'border-border-soft focus:border-accent'}`}
              >
                <option value="">Pilih provider...</option>
                {providerToggle.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}{p.kustom ? ' (kustom)' : ''}</option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-[0.65rem] text-ink-faint">
              Thinking diatur di bar kontrol atas (berlaku semua model). Di sini cukup label + nama model + provider. Maks token diatur server (AI_MAX_TOKENS).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={simpanModel}
                disabled={modelMenyimpan}
                className="btn-primary text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {modelMenyimpan ? 'Menyimpan...' : (editModelId ? 'Simpan perubahan' : 'Simpan model')}
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
    <div className="space-y-3">
      {/* INFO PROVIDER - ringkas, satu baris. Detail disembunyikan sampai
          diklik supaya layar tidak penuh (permintaan pemilik 2026-10-02:
          "terlalu penuh layar, pusing"). */}
      {(() => {
        const berKunci = providerToggle.filter((p) => Number(p.kunci) > 0);
        const aktifLabel = providerToggle.find((p) => p.id === provider)?.label || provider || '-';
        return (
          <details className="nx-card px-4 py-2.5 sm:px-5">
            <summary className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${berKunci.length ? 'bg-success' : 'bg-danger'}`} />
              <span className="font-semibold text-ink">{berKunci.length} provider siap</span>
              <span className="text-ink-faint">- aktif: {aktifLabel}</span>
              <span className="ml-auto text-ink-faint">detail</span>
            </summary>
            <div className="mt-2 space-y-1 border-t border-border-soft pt-2">
              {providerToggle.map((p) => (
                <p key={p.id} className="text-[0.7rem] text-ink-muted">
                  {p.label} - {p.kunci || 0} kunci{p.kustom ? ' (kustom)' : ''}
                </p>
              ))}
              {status?.diag?.errorDb && <p className="text-[0.7rem] text-danger">Error DB: {status.diag.errorDb}</p>}
              {status?.errorMuatan && <p className="text-[0.7rem] text-danger">Muat status: {status.errorMuatan}</p>}
            </div>
          </details>
        );
      })()}

      {/* ==========================================
          PANEL PENGINGAT (muncul saat tombol lonceng diklik)
          ==========================================
          Permintaan pemilik: tombol notif di halaman Analisis AI, menyala
          MERAH kalau ada pengingat. Panelnya hanya terbuka saat diklik -
          tidak memakan ruang saat tidak dibutuhkan. */}
      {bukaPengingat && (
        <div className="nx-card px-3 py-3 sm:px-5 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">
              Pengingat
              <span className="ml-1.5 text-xs font-normal text-ink-muted">
                ({pengingat.filter((p) => !p.selesai).length})
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setBukaPengingat(false)}
              className="rounded-lg border border-border-soft px-2.5 py-1 text-xs font-semibold text-ink-muted transition hover:text-ink cursor-pointer"
            >
              Tutup
            </button>
          </div>

          {pengingat.filter((p) => !p.selesai).length === 0 ? (
            <p className="mt-2 text-xs text-ink-muted">
              Belum ada. Pengingat dibuat oleh <strong className="text-ink">Agen</strong> (tab Agen).
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {pengingat.filter((p) => !p.selesai).map((p) => (
                <li
                  key={p.id}
                  className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 ${
                    p.jatuhTempo ? 'border-danger/40 bg-danger/8' : 'border-border-soft bg-bg-soft/40'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink line-clamp-2">{p.teks}</p>
                    <p className={`text-[0.65rem] ${p.jatuhTempo ? 'font-bold text-danger' : 'text-ink-faint'}`}>
                      {p.jatuhTempo ? 'SEKARANG - ' : ''}{p.waktuTeks}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => tandaiSelesai(p.id, true)}
                      className="rounded border border-success/40 px-2 py-0.5 text-[0.65rem] font-bold text-success transition hover:bg-success/10 cursor-pointer"
                    >
                      Selesai
                    </button>
                    <button
                      type="button"
                      onClick={() => hapusPengingat(p.id)}
                      className="rounded border border-border-soft px-2 py-0.5 text-[0.65rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
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
      <div className="nx-card z-20 px-4 py-3.5 sm:sticky sm:top-2 sm:px-5 sm:py-4 backdrop-blur-sm">
        {/* Baris 1: judul + pemilih MODE + tombol sembunyikan panel. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-ink">NEXO AI</h3>
            <span
              title="AI siap dipakai"
              className="inline-block h-2 w-2 rounded-full bg-success"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap rounded-xl border border-border-soft bg-bg-soft/60 p-1">
              {[
                ['analisis', 'Analisis', 'Laporan TEMUAN / SARAN / RISIKO'],
                ['diskusi', 'Diskusi', 'Chat 2 arah, bisa ditanya lanjut'],
                ['agen', 'Agen', 'Agen memantau & mengusulkan aksi (butuh persetujuanmu)'],
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
            {/* Tombol sembunyikan/tampilkan panel kontrol (provider/model/peran). */}
            <button
              type="button"
              onClick={() => setPanelTampil((v) => !v)}
              title={panelTampil ? 'Sembunyikan panel kontrol' : 'Tampilkan panel kontrol'}
              className="shrink-0 rounded-lg border border-border-soft px-2 py-1.5 text-[0.7rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
            >
              <span className="flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {panelTampil ? (
                    <path d="M6 9l6 6 6-6"/>
                  ) : (
                    <path d="M18 15l-6-6-6 6"/>
                  )}
                </svg>
                <span className="hidden sm:inline">{panelTampil ? 'Sembunyi' : 'Panel'}</span>
              </span>
            </button>
          </div>
        </div>

        {/* Panel kontrol (provider/model/peran/aksi) - bisa disembunyikan. */}
        {panelTampil && (<>

        {/* Baris 2: provider + model manual. TETAP TAMPIL di semua mode
            (permintaan pemilik 2026-10-02: "modelnya bisa gw pilih" - termasuk
            di mode Agen supaya pemilik bisa memilih model agen). */}
        <div className="mt-3 space-y-2">
          {/* Provider toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint">Provider</span>
            <div className={`flex flex-wrap rounded-xl border p-1 transition ${validasiProvider ? 'border-danger/60 bg-danger/5' : 'border-border-soft bg-bg-soft/60'}`}>
              {providerToggle.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProvider(p.id);
                    if (p.model && p.model.trim()) setModelInput(p.model);
                    else setModelInput('');
                    setValidasiProvider(false);
                  }}
                  title={p.model ? `Default: ${p.model}` : undefined}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                    provider === p.id ? 'bg-card-cream text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {agentProviderId && (
              <span className="rounded-full bg-accent px-2.5 py-1 text-[0.6rem] font-bold text-white shadow-sm">
                {status?.providers?.find((p) => p.id === agentProviderId)?.label || agentProviderId} → agent
              </span>
            )}
          </div>

          {/* Model input + dropdown tersimpan + menu aksi (satu baris bersih). */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint">Model</span>
            <input
              type="text"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder="Nama model (contoh: qwen/qwen3.8-27b:free)"
              className={`flex-1 min-w-[160px] rounded-xl border px-3 py-1.5 text-xs text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-1 focus:ring-ink-muted/30 transition ${validasiProvider ? 'border-danger/60 bg-danger/5' : 'border-border-soft bg-bg-soft/60'}`}
            />
            {/* Dropdown model tersimpan */}
            {(() => {
              const modelGabung = [
                ...(status?.models || []),
                ...(daftarModel || []).filter((m) => !(status?.models || []).some((x) => x.id === m.id)),
              ];
              if (!modelGabung.length) return null;
              return (
                <select
                  value=""
                  onChange={(e) => {
                    const m = modelGabung.find((x) => String(x.id) === e.target.value);
                    if (m) pakaiModel(m);
                  }}
                  title="Pilih dari model tersimpan"
                  className="rounded-xl border border-border-soft bg-bg-soft/60 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent cursor-pointer"
                >
                  <option value="">Tersimpan...</option>
                  {modelGabung.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              );
            })()}
            {/* Menu aksi model (dropdown - hemat tempat) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuModel((v) => !v)}
                title="Aksi model"
                className="flex items-center gap-1 rounded-xl border border-border-soft bg-bg-soft/60 px-2.5 py-1.5 text-[0.7rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
                </svg>
                Aksi
              </button>
              {menuModel && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuModel(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-xl border border-border-soft bg-card-cream shadow-lg">
                    {[
                      { label: cekHasil.status === 'cek' ? 'Cek...' : 'Cek model', fn: cekModel, dis: cekHasil.status === 'cek' },
                      { label: modelProv.status === 'cek' ? '...' : (modelProv.status === 'ok' && !modelProv.semuaProvider ? 'Tutup daftar' : 'Lihat model'), fn: () => { if (modelProv.status === 'ok' && !modelProv.semuaProvider) setModelProv((s) => ({ ...s, status: 'idle' })); else muatModelProv(modelProv.hanyaGratis); setMenuModel(false); }, dis: modelProv.status === 'cek' },
                      { label: modelProv.status === 'cek' ? '...' : (modelProv.status === 'ok' && modelProv.semuaProvider ? 'Tutup semua' : 'Semua model gratis'), fn: () => { if (modelProv.status === 'ok' && modelProv.semuaProvider) setModelProv((s) => ({ ...s, status: 'idle' })); else muatModelSemua(true); setMenuModel(false); }, dis: modelProv.status === 'cek' },
                      { label: usage.status === 'ok' ? 'Tutup usage' : 'Lihat usage', fn: () => { if (usage.status === 'ok') setUsage({ status: 'idle' }); else muatUsage(); setMenuModel(false); }, dis: usage.status === 'cek' },
                    ].map((it, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={it.dis}
                        onClick={() => { if (it.label.includes('model')) setMenuModel(false); it.fn(); }}
                        className="block w-full px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-accent/10 disabled:opacity-40 cursor-pointer"
                      >
                        {it.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
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
                  {modelProv.semuaProvider && modelProv.perProvider
                    ? ` dari ${modelProv.perProvider.filter((p) => (p.models || []).length).length} provider`
                    : ''}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modelProv.hanyaGratis}
                    onChange={(e) => (modelProv.semuaProvider ? muatModelSemua(e.target.checked) : muatModelProv(e.target.checked))}
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
                <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer" title="Default aktif: sembunyikan model yang gagal uji">
                  <input
                    type="checkbox"
                    checked={modelProv.filterLolos !== false}
                    onChange={(e) => setModelProv((s) => ({ ...s, filterLolos: e.target.checked }))}
                    className="cursor-pointer"
                  />
                  Sembunyikan yang gagal
                </label>
                {/* Uji model nyata: hanya tampilkan yang benar-benar bisa dipakai. */}
                <button
                  type="button"
                  onClick={ujiModelTampil}
                  disabled={ujiJalan}
                  title="Uji masing-masing model dengan 1 request kecil (hasil di-cache 24 jam)"
                  className="rounded-lg border border-accent/40 px-2.5 py-1 text-[0.7rem] font-bold text-accent transition hover:bg-accent/10 disabled:opacity-50 cursor-pointer"
                >
                  {ujiJalan ? 'Menguji...' : 'Uji model'}
                </button>
              </div>
            </div>
            {(() => {
              const tampil = modelProv.models.filter((m) =>
                (!modelProv.filterLihat || m.vision) &&
                (!modelProv.filterNalar || m.reasoning) &&
                (modelProv.filterLolos === false || ujiHasil[`${m.providerId || ''}::${m.id}`]?.ok === true || ujiHasil[`${m.providerId || ''}::${m.id}`] === undefined)
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
                {tampil.map((m, mi) => (
                  <li key={(m.providerId || '') + '::' + m.id + '::' + mi} className={`rounded-lg ${modelProv.dipilih === (m.providerId || '') + '::' + m.id ? 'bg-accent/10' : ''}`}>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          // Buka/tutup panel pilihan model ini.
                          setModelProv((s) => ({
                            ...s,
                            dipilih: s.dipilih === (m.providerId || '') + '::' + m.id ? null : (m.providerId || '') + '::' + m.id,
                          }));
                        }}
                        title="Pilih model ini"
                        className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-lg px-2 py-1 text-left transition hover:bg-accent/15 cursor-pointer"
                      >
                        <span className="min-w-0 max-w-full truncate font-mono text-[0.7rem] text-ink">{m.id}</span>
                        <span className="flex flex-wrap items-center gap-1">
                          {/* Badge provider kalau mode semua-provider. */}
                          {m.providerLabel && modelProv.semuaProvider && (
                            <span className="rounded bg-bg-soft px-1.5 py-0.5 text-[0.6rem] font-semibold text-ink-muted">{m.providerLabel}</span>
                          )}
                          {m.vision && <span title="Bisa lihat gambar (vision)" className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-accent">LIHAT</span>}
                          {m.reasoning && <span title="Bisa bernalar (reasoning)" className="rounded bg-accent/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-accent">NALAR</span>}
                          {m.gratis === true && <span className="rounded bg-success/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-success">GRATIS</span>}
                          {/* Badge hasil uji (kalau sudah diuji). */}
                          {(() => {
                            const u = ujiHasil[`${m.providerId || ''}::${m.id}`];
                            if (!u) return null;
                            return u.ok
                              ? <span title="Lolos uji - bisa dipakai" className="rounded bg-success/20 px-1.5 py-0.5 text-[0.6rem] font-bold text-success">✓ OK</span>
                              : <span title={`Gagal uji: ${u.alasan || '-'}`} className="rounded bg-danger/15 px-1.5 py-0.5 text-[0.6rem] font-bold text-danger">✗ {u.alasan || 'gagal'}</span>;
                          })()}
                        </span>
                      </button>
                      {/* Pakai cepat tanpa atur. */}
                      <button
                        type="button"
                        onClick={() => {
                          if (m.providerId) setProvider(m.providerId);
                          setModelInput(m.id);
                          // Hanya perbarui info vision (untuk peringatan gambar).
                          // Max token/Thinking tetap dari setting global.
                          setModelSetting((s) => ({ ...s, vision: m.vision ?? null }));
                          setModelProv((s) => ({ ...s, status: 'idle', dipilih: null }));
                        }}
                        title="Pakai model ini langsung (default)"
                        className="shrink-0 rounded-lg border border-accent/40 px-2 py-1 text-[0.65rem] font-bold text-accent transition hover:bg-accent/10 cursor-pointer"
                      >
                        Pakai
                      </button>
                    </div>
                    {/* Pengaturan model terpilih: Thinking. */}
                    {modelProv.dipilih === (m.providerId || '') + '::' + m.id && (
                      <div className="mt-1 rounded-lg border border-border-soft bg-card-cream p-2">
                        <p className="text-[0.65rem] text-ink-muted">
                          Thinking pakai pengaturan global di atas (berlaku semua model).
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (m.providerId) setProvider(m.providerId);
                              setModelInput(m.id);
                              setModelSetting((s) => ({ ...s, vision: m.vision ?? null }));
                              setModelProv((s) => ({ ...s, status: 'idle', dipilih: null }));
                            }}
                            className="btn-primary text-[0.7rem]"
                          >
                            Pakai model ini
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
                            onClick={async () => {
                              const label = m.id.split('/').pop().split(':')[0].slice(0, 40);
                              const providerId = m.providerId || provider || '';
                              // Cek duplikat.
                              const duplikat = daftarModel.find((x) => x.model === m.id && x.provider === providerId);
                              if (duplikat) {
                                setPesanSimpan(`⚠ Model "${m.id}" sudah tersimpan di ${providerId}.`);
                                setTimeout(() => setPesanSimpan(null), 4000);
                                return;
                              }
                              setPesanSimpan('Menyimpan...');
                              try {
                                const res = await fetch('/api/admin/ai/providers', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ tipe: 'model', label, model: m.id, provider: providerId }),
                                });
                                const d = await res.json().catch(() => ({}));
                                if (d.ok) {
                                  setPesanSimpan(`✓ Model "${label}" tersimpan permanen.`);
                                  setTimeout(() => setPesanSimpan(null), 4000);
                                  await Promise.all([muatKelola(), muatStatusUlang()]);
                                } else {
                                  setPesanSimpan('Gagal: ' + (d.error || 'tidak diketahui'));
                                  setTimeout(() => setPesanSimpan(null), 4000);
                                }
                              } catch (e) {
                                setPesanSimpan('Gagal: ' + e.message);
                                setTimeout(() => setPesanSimpan(null), 4000);
                              }
                            }}
                            className={`rounded-lg border px-2.5 py-1 text-[0.7rem] font-bold transition cursor-pointer ${
                              daftarModel.some((x) => x.model === m.id && x.provider === (m.providerId || provider || ''))
                                ? 'border-success/40 bg-success/5 text-success'
                                : 'border-accent/40 text-accent hover:bg-accent/10'
                            }`}
                          >
                            {daftarModel.some((x) => x.model === m.id && x.provider === (m.providerId || provider || ''))
                              ? '✓ Tersimpan'
                              : 'Simpan permanen'}
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

        {/* Baris 3: ringkasan + pengaturan (dilipat) + kelola. Ringkas.
            MODE AGEN: pengaturan Thinking DISEMBUNYIKAN - agen sudah
            dioptimalkan server (Thinking Auto) supaya efisien karena jalan
            24/7 dan TIDAK bisa diubah (permintaan pemilik 2026-10-04).
            MAX TOKEN TIDAK ditampilkan lagi di web (dihapus permintaan
            pemilik 2026-10-04) - diatur server lewat env AI_MAX_TOKENS. */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {mode === 'agen' ? (
            <span className="text-[0.7rem] text-ink-muted">
              Thinking dioptimalkan otomatis untuk agen (Auto).
            </span>
          ) : (
            <span className="rounded-full bg-bg-soft px-2.5 py-1 text-[0.7rem] font-semibold text-ink-muted">
              {`Thinking: ${THINKING_LABEL[modelSetting.thinking || 'auto'] || 'Auto'}`}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {mode !== 'agen' && (
              <button
                type="button"
                onClick={() => setBukaSetting((v) => !v)}
                className="rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
              >
                {bukaSetting ? 'Tutup pengaturan' : 'Pengaturan'}
              </button>
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
              {kelola ? 'Tutup kelola' : 'Kelola provider'}
            </button>
          </div>
        </div>

        {/* PERAN AI - SELALU TAMPIL (bukan dilipat) supaya mudah diganti.
            Analisis menyesuaikan peran yang dipilih. Permintaan pemilik
            2026-10-02: "mana tombol toggle setiap role, munculin dong".
            MODE AGEN: peran tidak relevan (agen pakai 5 peran sekaligus untuk
            saran), jadi disembunyikan. */}
        {mode !== 'agen' && (
          <PilihPeran
            peran={status?.peran || []}
            nilai={peran}
            onPilih={setPeran}
            disabled={jalan}
            adaKodeBase={status?.adaKodeBase}
          />
        )}

        {/* PANEL PENGATURAN (THINKING) - dilipat, hemat ruang.
            KONTROL MAX TOKEN DIHAPUS dari web (permintaan pemilik 2026-10-04):
            pemilik tidak ingin mengatur token di web karena tidak tahu
            berapa biaya pengeluarannya. Token kini diatur SERVER lewat env
            AI_MAX_TOKENS (default 2000) - tidak ada input manual di UI.
            Tidak tampil di mode agen (dioptimalkan server: selalu Thinking Auto). */}
        {bukaSetting && mode !== 'agen' && (
          <div className="mt-2 rounded-xl border border-border-soft bg-bg-soft/30 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[0.75rem] text-ink-muted">
                <span className="shrink-0">Thinking</span>
                <select
                  value={modelSetting.thinking || 'auto'}
                  onChange={(e) => setModelSetting((s) => ({ ...s, thinking: e.target.value }))}
                  className="rounded-lg border border-border-soft bg-card-cream px-2 py-1 text-[0.75rem] text-ink outline-none focus:border-accent cursor-pointer"
                >
                  <option value="auto">Auto</option>
                  <option value="minimal">Minimal</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">Xhigh</option>
                  <option value="max">Max</option>
                  <option value="thinking">Thinking</option>
                </select>
              </label>
            </div>
            <p className="mt-1 text-[0.7rem] text-ink-faint">Auto = biarkan provider memutuskan; level lain mengirim reasoning_effort / thinking budget. Maks token diatur server (AI_MAX_TOKENS).</p>
          </div>
        )}

        <p className="mt-1.5 text-xs text-ink-muted">
          {mode === 'analisis'
            ? 'Pilih topik cepat di bawah atau tulis pertanyaanmu sendiri.'
            : mode === 'agen'
              ? 'Agen memantau data & mengusulkan aksi - kamu yang memutuskan.'
              : 'Ngobrol bebas - AI ingat percakapan sebelumnya.'}
        </p>
        </>)}
      </div>

      {/* ==========================================
          PANEL KELOLA PROVIDER & MODEL
          ==========================================
          Tambah provider kustom (nama + URL + API key), hapus, lalu simpan
          model (label + nama model + provider) yang bisa dipakai ulang. */}
      {kelola && renderKelola()}

      {/* ==========================================
          MODE ANALISIS (searah): tombol pintasan + laporan
          ==========================================
          SELALU ter-render (hidden saat bukan mode) supaya proses AI yang
          sedang berjalan TIDAK terputus saat pindah tab. */}
      <div className={mode === 'analisis' ? '' : 'hidden'}>
          <div className="nx-card px-4 py-4 sm:px-5 sm:py-5">
            <p className="text-xs text-ink-muted">
              Laporan TEMUAN / SARAN / RISIKO dari data NEXO - sekali klik topik.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-ink-muted">
                Analisis Cepat
                {saranDin.some((s) => s.sumber === 'ai') && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold normal-case tracking-normal text-white shadow-sm">dari AI</span>
                )}
              </p>
              <button
                type="button"
                onClick={muatSaranAI}
                disabled={saranAI || saranAICooldown > 0}
                title={saranAICooldown > 0 ? `Tunggu ${saranAICooldown} detik` : 'AI cari topik paling relevan dari data terkini'}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[0.65rem] font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {saranAI ? (
                  <>
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Memuat topik...
                  </>
                ) : saranAICooldown > 0 ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                    </svg>
                    Tunggu {saranAICooldown}s
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    Cari topik AI
                  </>
                )}
              </button>
            </div>
            {/* Status loading AI generate (biar kelihatan sedang bekerja). */}
            {saranAI && (
              <p className="mt-2 flex items-center gap-2 rounded-lg bg-accent/5 px-3 py-2 text-[0.7rem] font-semibold text-accent">
                <span className="pulse-dot" aria-hidden="true" />
                AI sedang membaca data & menyusun topik paling relevan... (5-15 detik)
              </p>
            )}
            {/* FIX 2026-10-06: pesan hasil cari topik (sukses/gagal) ditampilkan
                DI SINI - tepat di bawah tombol. Dulu pesannya cuma muncul di
                bagian bawah halaman (dekat Arsip Jawaban), jadi pemilik yang
                klik "Cari topik AI" tidak melihat penjelasan apa pun dan
                menyimpulkan "kok ga refresh". */}
            {!saranAI && pesanSaranAI && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-[0.7rem] font-semibold ${
                pesanSaranAI.ok
                  ? 'bg-success/10 text-success'
                  : 'bg-danger/10 text-danger'
              }`}>
                {pesanSaranAI.teks}
              </p>
            )}
            {/* Di HP tombol dibuat GRID 2 kolom: label panjang seperti
                "Pertumbuhan Komunitas" jadi tidak memaksa satu baris penuh, dan
                tingginya naik ke 40px supaya nyaman ditekan jari (sebelumnya 30px,
                di bawah ambang nyaman). Di layar lebar kembali ke flex-wrap. */}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {(() => {
                // PRIORITAS: 1) saran AI generate, 2) saran agen, 3) saran dinamis
                // snapshot, 4) pintasan peran, 5) statis (darurat).
                const saranAIGen = saranDin.filter((s) => s.sumber === 'ai');
                const saranAgen = saranDin.filter((s) => s.sumber === 'agen');
                const saranSnapshot = saranDin.filter((s) => s.sumber !== 'agen' && s.sumber !== 'ai');
                const dariServer = status?.pintasanPeran?.[peran] || [];
                const pintasanPeranIni = dariServer.length ? dariServer : pintasanPeranKlien(peran);
                const PINTASAN_LOKAL = [
                  { id: 'promo', label: 'Saran Promo' },
                  { id: 'sepi', label: 'Item & Game Sepi' },
                  { id: 'retensi', label: 'Retensi Pemain' },
                  { id: 'ekonomi', label: 'Kesehatan Ekonomi' },
                  { id: 'komunitas', label: 'Pertumbuhan Komunitas' },
                  { id: 'error', label: 'Log Error' },
                  { id: 'idegame', label: 'Ide Game Baru' },
                  { id: 'guild', label: 'Masalah Guild & War' },
                  { id: 'semua', label: 'Gambaran Menyeluruh' },
                ];
                const daftarPintasan = saranAIGen.length
                  ? saranAIGen.map((s) => ({ id: s.id, label: s.label, tanya: s.tanya }))
                  : saranAgen.length
                    ? saranAgen.map((s) => ({ id: s.id, label: s.label, tanya: s.tanya }))
                    : saranSnapshot.length
                      ? saranSnapshot.map((s) => ({ id: s.id, label: s.label, tanya: s.tanya }))
                      : ((peran !== 'umum' && pintasanPeranIni.length)
                        ? pintasanPeranIni
                        : ((status?.pintasan || []).length ? status.pintasan : PINTASAN_LOKAL));
                const tampil = daftarPintasan.filter((p) => !saranDismiss.has(p.id));
                return tampil.map((p) => {
                  const aktif = topikAktif === p.label;
                  return (
                  <span key={p.id} className="relative inline-flex">
                    <button
                      type="button"
                      disabled={jalan || detikSisa > 0}
                      onClick={() => jalankan(p.tanya ? { tanya: p.tanya } : { pintasan: p.id }, p.label)}
                      className={`flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-3 py-2 pr-7 text-center text-xs font-semibold leading-tight transition disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:justify-start sm:px-3.5 sm:py-1.5 cursor-pointer ${
                        aktif ? 'border-accent bg-accent text-white shadow-sm' : 'border-border-soft bg-bg-soft text-ink hover:border-accent hover:bg-accent/15'
                      }`}
                    >
                      {aktif ? (
                        <>
                          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                          {p.label}
                        </>
                      ) : p.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissSaran(p.id)}
                      title="Hapus saran ini"
                      className="absolute right-0.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint transition hover:bg-danger/10 hover:text-danger cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </span>
                  );
                });
              })()}
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
              <span className="pulse-dot" aria-hidden="true" /> AI ({providerToggle.find((p) => p.id === provider)?.label || provider || 'AI'}) sedang membaca data, bisa 5-30 detik.
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
      </div>

      {/* ==========================================
          MODE AGEN (pemantau otomatis + usulan aksi)
          ==========================================
          Permintaan pemilik 2026-10-02: agen memantau, usul aksi, pemilik
          setujui. Komponen terpisah (AgenAI.jsx) supaya file ini tetap rapi. */}
      {/* SELALU ter-render (dibungkus div hidden saat bukan mode agen) supaya
          proses agen TIDAK ter-reset saat pindah tab. Permintaan pemilik
          2026-10-02: "pindah ke diskusi lalu balik, agennya berhenti". */}
      <div className={mode === 'agen' ? '' : 'hidden'}>
        <AgenAI
          jalan={jalan}
          detikSisa={detikSisa}
          provider={provider}
          model={modelInput}
          onSelesai={muatSaran}
        />
      </div>

      {/* ==========================================
          MODE DISKUSI (chat 2 arah)
          ==========================================
          Pemilik: "kalo yang chat buat gw diskusi kedepannya bakal gimana".
          Pesan pemilik di kanan, balasan AI di kiri.
          SELALU ter-render (hidden saat bukan mode) supaya proses lanjut. */}
      <div className={mode === 'diskusi' ? '' : 'hidden'}>
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
                {/* Token jawaban saja (bukan total input+output yang membingungkan). */}
                {(() => {
                  const totalJawab = pesan.reduce((s, m) => s + (Number(m?.usage?.completionTokens) || 0), 0);
                  if (!totalJawab) return null;
                  return (
                    <p className="mt-0.5 text-[0.7rem] font-semibold text-accent">
                      Token jawaban: {totalJawab.toLocaleString('id-ID')}
                    </p>
                  );
                })()}
                <p className="mt-0.5 text-xs text-ink-muted">
                  Ngobrol bebas soal data NEXO - AI ingat percakapan ini.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {pesan.length > 0 && (
                  <button
                    type="button"
                    onClick={simpanDiskusi}
                    className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs font-bold text-accent transition hover:bg-accent/10 cursor-pointer"
                    title="Simpan diskusi ini (bisa dilanjutkan kapan saja)"
                  >
                    {diskusiAktifId ? 'Perbarui' : 'Simpan diskusi'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setBukaDiskusi((v) => !v); if (!bukaDiskusi) muatDiskusi(); }}
                  className="rounded-lg border border-border-soft px-3 py-1.5 text-xs font-semibold text-ink-muted transition hover:border-accent/50 hover:text-ink cursor-pointer"
                  title="Daftar diskusi tersimpan"
                >
                  Tersimpan ({daftarDiskusi.length})
                </button>
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
            </div>

        {/* Daftar diskusi tersimpan (save/hapus/lanjutkan). */}
        {bukaDiskusi && (
          <div className="mt-3 rounded-xl border border-border-soft bg-bg-soft/30 p-3">
            <p className="text-xs font-bold text-ink-muted">Diskusi tersimpan</p>
            {memuatDiskusi ? (
              <p className="mt-2 text-xs text-ink-muted"><span className="pulse-dot" aria-hidden="true" /> Memuat...</p>
            ) : daftarDiskusi.length === 0 ? (
              <p className="mt-2 text-xs text-ink-muted">Belum ada. Tulis percakapan lalu klik "Simpan diskusi".</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {daftarDiskusi.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-card-cream px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{d.judul}</p>
                      <p className="text-[0.65rem] text-ink-faint">
                        {Math.ceil((d.jumlahPesan || 0) / 2)} giliran • {new Date(d.updatedAt || d.createdAt).toLocaleString('id-ID')}
                        {d.provider ? ` • ${d.provider}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => lanjutkanDiskusi(d)}
                      className="shrink-0 rounded-lg border border-accent/40 px-2.5 py-1 text-[0.7rem] font-bold text-accent transition hover:bg-accent/10 cursor-pointer"
                    >
                      Lanjutkan
                    </button>
                    <button
                      type="button"
                      onClick={() => hapusDiskusi(d)}
                      className="shrink-0 rounded-lg border border-border-soft px-2.5 py-1 text-[0.7rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Kartu saran klik. Kalau peran non-umum: saran = pintasan peran
            (teknis). Else: saran diskusi data biasa. */}
        {(() => {
          const SARAN_LOKAL = [
            { id: 'l-game', label: 'Game paling laris?', tanya: 'Game apa yang paling banyak dimainkan minggu ini dan kenapa menurutmu menarik? Kasih angka.' },
            { id: 'l-baru', label: 'Ide game baru', tanya: 'Usulkan 3 ide game BARU yang inovatif dan nyambung minat pemain NEXO. Jangan ulang yang sudah ada.' },
            { id: 'l-item', label: 'Item paling laku', tanya: 'Item apa yang paling laku dan mana yang menumpuk tidak terjual? Jelaskan dengan angka.' },
            { id: 'l-ekonomi', label: 'Ekonomi sehat?', tanya: 'Menurut data, apakah ekonomi NEXO sehat? Ada tanda inflasi atau penumpukan poin?' },
            { id: 'l-perbaiki', label: 'Apa yang diperbaiki?', tanya: 'Dari semua data, 3 hal apa yang paling mendesak diperbaiki? Urut dari yang paling berdampak.' },
            { id: 'l-promo', label: 'Ide promo', tanya: 'Promo apa yang sebaiknya dijalankan berikutnya? Pilih item/game tepat dan jelaskan alasannya pakai angka.' },
          ];
          const dariServer = status?.pintasanPeran?.[peran] || [];
          const pintasanPeranIni = (dariServer.length ? dariServer : pintasanPeranKlien(peran)).map((x) => ({ id: x.id, label: x.label, tanya: x.tanya || x.label }));
          // PRIORITAS: 1) saran AI, 2) agen, 3) dinamis snapshot, 4) pintasan peran, 5) statis.
          const saranAIGen = saranDin.filter((s) => s.sumber === 'ai');
          const saranAgen = saranDin.filter((s) => s.sumber === 'agen');
          const saranSnapshot = saranDin.filter((s) => s.sumber !== 'agen' && s.sumber !== 'ai');
          const saran = saranAIGen.length
            ? saranAIGen
            : saranAgen.length
              ? saranAgen
              : saranSnapshot.length
                ? saranSnapshot
                : ((peran !== 'umum' && pintasanPeranIni.length)
                  ? pintasanPeranIni
                  : ((status?.saranDiskusi || []).length ? status.saranDiskusi : SARAN_LOKAL));
          return (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-ink-faint">
                  Saran cepat
                  {saranAIGen.length > 0 && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[0.6rem] font-bold normal-case tracking-normal text-white shadow-sm">dari AI</span>
                  )}
                </p>
                <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={muatSaranAI}
                  disabled={saranAI || saranAICooldown > 0}
                  title={saranAICooldown > 0 ? `Tunggu ${saranAICooldown} detik` : 'AI cari topik paling relevan dari data terkini'}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[0.65rem] font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {saranAI ? (
                    <>
                      <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Memuat topik...
                    </>
                  ) : saranAICooldown > 0 ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                      </svg>
                      Tunggu {saranAICooldown}s
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                      </svg>
                      Cari topik AI
                    </>
                  )}
                </button>
                </div>
              </div>
              {saranAI && (
                <p className="mt-2 flex items-center gap-2 rounded-lg bg-accent/5 px-3 py-2 text-[0.7rem] font-semibold text-accent">
                  <span className="pulse-dot" aria-hidden="true" />
                  AI sedang membaca data & menyusun topik paling relevan... (5-15 detik)
                </p>
              )}
              {/* FIX 2026-10-06: hasil cari topik tampil di sini juga (mode
                  diskusi) - sebelumnya pesan nyasar ke bawah halaman. */}
              {!saranAI && pesanSaranAI && (
                <p className={`mt-2 rounded-lg px-3 py-2 text-[0.7rem] font-semibold ${
                  pesanSaranAI.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                }`}>
                  {pesanSaranAI.teks}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {saran.filter((s) => !saranDismiss.has(s.id)).map((s) => (
                  <span key={s.id} className="relative inline-flex">
                    <button
                      type="button"
                      disabled={jalan || detikSisa > 0}
                      onClick={() => jalankan({ tanya: s.tanya || s.label }, s.label, s.label)}
                      className={`rounded-full border px-3 py-1.5 pr-6 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer ${
                        topikAktif === s.label ? 'border-accent bg-accent text-white shadow-sm' : 'border-accent/30 bg-accent/5 text-ink hover:border-accent hover:bg-accent/15'
                      }`}
                    >
                      {topikAktif === s.label ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                          {s.label}
                        </span>
                      ) : s.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissSaran(s.id)}
                      title="Hapus saran ini"
                      className="absolute right-0.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint transition hover:bg-danger/10 hover:text-danger cursor-pointer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

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
                    {m.peran === 'ai' && m.usage?.totalTokens != null && (
                      <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[0.55rem] font-semibold normal-case tracking-normal text-accent" title={`Konteks (input): ${m.usage.promptTokens ?? '-'} token | Jawaban: ${m.usage.completionTokens ?? '-'} token`}>
                        jawab {m.usage.completionTokens ?? '-'} • konteks {m.usage.promptTokens ?? '-'}
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
                  {/* Balas pesan ini (reply) + Hapus. */}
                  <button
                    type="button"
                    onClick={() => { setBalas({ indeks: i, peran: m.peran, cuplikan: m.isi || '' }); setTanya(''); ujungChat.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }}
                    title="Balas pesan ini"
                    className="ml-1.5 mt-2 rounded-lg border border-border-soft px-2.5 py-1 text-[0.68rem] font-bold text-ink-muted transition hover:border-accent/60 hover:text-ink cursor-pointer"
                  >
                    ↩ Balas
                  </button>
                  <button
                    type="button"
                    onClick={() => hapusSatuPesan(i)}
                    title="Hapus pesan ini"
                    className="ml-1.5 mt-2 rounded-lg border border-border-soft px-2.5 py-1 text-[0.68rem] font-bold text-ink-muted transition hover:border-danger/50 hover:text-danger cursor-pointer"
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
            {jalan && (
              <li className="flex justify-start">
                <div className="rounded-2xl bg-bg-soft/60 px-4 py-2.5 text-sm text-ink-muted">
                  <span className="pulse-dot" aria-hidden="true" /> AI ({providerToggle.find((p) => p.id === provider)?.label || provider || 'AI'}) sedang membaca data, bisa 5-30 detik...
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={ujungChat} />
      </div>

      {/* KOLOM KETIK di bawah percakapan - seperti ChatGPT.
          Dukung DRAG & DROP gambar (permintaan pemilik 2026-10-02). */}
      <div
        className={`z-10 rounded-2xl border bg-card-cream p-2 shadow-[0_8px_28px_rgba(43,33,24,0.12)] sm:sticky sm:bottom-4 transition ${dragAktif ? 'border-accent ring-2 ring-accent/40' : 'border-border-soft'}`}
        onDragOver={(e) => { e.preventDefault(); if (mode === 'diskusi') setDragAktif(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragAktif(false); }}
        onDrop={async (e) => {
          e.preventDefault();
          setDragAktif(false);
          if (mode === 'diskusi') await tambahGambarDariFile(e.dataTransfer?.files);
        }}
      >
        {dragAktif && (
          <p className="mb-2 rounded-lg bg-accent/10 px-3 py-2 text-center text-[0.7rem] font-semibold text-accent">
            Lepaskan gambar di sini untuk melampirkan
          </p>
        )}
        {/* Kutipan balasan (reply). */}
        {balas && (
          <div className="mb-2 flex items-start gap-2 rounded-lg border-l-2 border-accent bg-accent/5 px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] font-bold text-accent">Membalas {balas.peran === 'ai' ? 'AI' : 'pesan saya'}</p>
              <p className="truncate text-[0.7rem] text-ink-muted">{String(balas.cuplikan).slice(0, 120)}</p>
            </div>
            <button type="button" onClick={() => setBalas(null)} className="shrink-0 text-ink-faint hover:text-danger cursor-pointer" title="Batal balas">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        {/* Preview gambar terlampir. */}
        {gambar.length > 0 && (
          <div className="mb-2">
            <div className="flex flex-wrap gap-2">
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
            {/* Peringatan: gambar hanya dibaca model yang bisa lihat (vision). */}
            {modelSetting.vision === false && (
              <p className="mt-1.5 rounded-lg bg-danger/10 px-2.5 py-1 text-[0.7rem] font-semibold text-danger">
                Model ini tidak bisa lihat gambar. Pilih model bertanda LIHAT (klik "Lihat model" → centang "Bisa lihat gambar").
              </p>
            )}
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
                await tambahGambarDariFile(e.target.files);
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
            className="btn-primary flex shrink-0 items-center gap-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {jalan ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                ...
              </>
            ) : `Kirim${detikSisa > 0 ? ` (${detikSisa}s)` : ''}`}
          </button>
        </form>
      </div>
      </div>

      {/* ==========================================
          KARTU PEMAKAIAN AI (permintaan pemilik 2026-10-04)
          ==========================================
          "ada usage seperti [Total Requests, tokens, Est. Cost, Recent
          Requests] ... ada graphicnya di bawah chat AI ... real ga halu
          berdasarkan data ... bisa di hide ... buat card baru dibawah biar
          ga numpuk di atas".

          Dipasang DI LUAR blok mode (selalu tampil, tidak tersembunyi saat
          ganti mode analisis/diskusi/agen) supaya riwayat pemakaian tetap
          terlihat. Kartu ini sendiri bisa disembunyikan lewat tombolnya. */}
      <AiUsage />

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

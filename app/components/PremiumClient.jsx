'use client';

import { useCallback, useEffect, useState, useRef } from 'react';

const PERKS = [
  { emoji: 'gem', text: 'Badge Supporter Eksklusif (NEXO Pass) in-game & di profil web' },
  { emoji: 'crown', text: 'Role NEXO PASS berwana emas mengkilap di Discord' },
  { emoji: 'backpack', text: 'Kapasitas Inventori TERBUKA BEBAS (dari max 5 jadi Unlimited)' },
  { emoji: 'battery', text: '+20% Bonus limit main harian (Kuota Energi & Action Points)' },
  { emoji: 'zap', text: 'Prioritas Render: avatar & aset in-game diprioritaskan server' },
  { emoji: 'download3', text: 'Profil Web Premium: grafik riwayat & badge khusus di website' },
];

function nowMs() {
  return Date.now();
}

export default function PremiumClient({ loggedIn, botOnline, initialPremiumActive, initialOrder, discordId }) {
  const [loading, setLoading] = useState(false); // No initial loading anymore!
  const [buying, setBuying] = useState(false);
  const [online, setOnline] = useState(botOnline);
  const [order, setOrder] = useState(initialOrder || null);
  const [error, setError] = useState(null);
  const [premiumActive, setPremiumActive] = useState(initialPremiumActive || false);
  
  // Form states
  const [showForm, setShowForm] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [receiptBase64, setReceiptBase64] = useState('');
  const [receiptName, setReceiptName] = useState('');
  const [fileError, setFileError] = useState(null);
  const fileInputRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const [payRes, meRes] = await Promise.all([
        fetch('/api/payment/manual', { cache: 'no-store' }),
        fetch('/api/me', { cache: 'no-store' }),
      ]);
      if (payRes.ok) {
        const d = await payRes.json();
        setOrder(d.order || null);
        setOnline(Boolean(d.botOnline));
      }
      if (meRes.ok) {
        const m = await meRes.json();
        const p = m.profile?.profile?.premium;
        const active =
          p === true ||
          (p && typeof p === 'object' && (p.lifetime || Number(p.expiresAt) > Date.now()));
        setPremiumActive(Boolean(m.profile?.exists && active));
      }
    } catch {}
  }, []);

  // Poll status untuk memantau approve admin secara background
  useEffect(() => {
    if (!loggedIn || order?.status !== 'pending') return;
    const i1 = setInterval(loadStatus, 3000);
    return () => clearInterval(i1);
  }, [loggedIn, order?.status, loadStatus]);

  const handleFileChange = (e) => {
    setFileError(null);
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFileError('File harus berupa gambar (JPG/PNG).');
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setFileError('Ukuran file maksimal 1MB. Silahkan compress/screenshot ulang.');
      return;
    }
    setReceiptName(file.name || 'bukti-transfer.png');

    const reader = new FileReader();
    reader.onload = (ev) => setReceiptBase64(ev.target.result);
    reader.readAsDataURL(file);
  };

  async function startBuy() {
    if (!loggedIn) {
      window.location.href = '/login?returnTo=%2Fpremium';
      return;
    }
    
    // Instantly show form, no need to check /api/me here which could hang
    setShowForm(true);
    setError(null);
  }

  async function submitPayment() {
    if (!senderName || senderName.length < 3) {
      setError('Masukkan nama pengirim yang valid.');
      return;
    }
    if (!receiptBase64) {
      setError('Upload bukti transfer terlebih dahulu.');
      return;
    }
    setBuying(true);
    setError(null);
    
    fetch('/api/payment/manual', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderName, receiptBase64, receiptName })
    })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) {
          if (d.error === 'premium_active') {
            setPremiumActive(true);
            setShowForm(false);
            loadStatus();
            return;
          }
          throw new Error(d.error === 'bot_offline' ? 'Sedang tidak bisa membeli: bot lagi mati.' : (d.error || 'Gagal mengirim pembayaran.'));
        }
        setShowForm(false);
        setOrder({ status: 'pending' });
        loadStatus();
      })
      .catch((e) => setError(e.message))
      .finally(() => setBuying(false));
  }

  if (loading) {
    return (
      <div className="mt-8 flex animate-pulse flex-col items-center gap-4">
        <div className="h-10 w-32 rounded-lg bg-surface-raised" />
        <div className="h-4 w-48 rounded bg-surface-raised" />
      </div>
    );
  }

  // Satu Pass = satu pembelian per bulan. Yang sudah premium TIDAK bisa beli
  // / perpanjang lagi - tombol bayar baru muncul setelah pass di lepas admin
  // atau jatuh tempo (lihat userHasPremium).
  if (premiumActive) {
    return (
      <div className="mt-8 flex flex-col items-center gap-2">
        <div className="rounded-xl bg-success px-5 py-3 text-sm font-semibold text-white">
          Kamu sudah Premium
        </div>
        <p className="text-xs text-ink-muted">Semua perk aktif di Discord dan halaman profil.</p>
      </div>
    );
  }

  const pending = order?.status === 'pending';
  // 'paid' HANYA dihitung sukses kalau premiumnya masih aktif atau baru
  // disetujui (< 3 menit). Order paid basi (premium sudah dicabut/expired)
  // tidak boleh memblokir form beli lagi - inilah penyebab tombol "stuck".
  const paid =
    order?.status === 'paid' &&
    Boolean(premiumActive || (order.paidAt && nowMs() - order.paidAt < 3 * 60 * 1000));

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      {!loggedIn && (
        <p className="text-xs text-ink-muted">Login untuk melihat status langgananmu.</p>
      )}

      {error && (
        <div className="max-w-md rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-center text-sm text-danger shadow-sm">
          {error}
        </div>
      )}
      
      {!online && (
        <div className="max-w-md rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-center text-sm text-warning shadow-sm">
          <strong>Perhatian:</strong> Sistem bot Nexo sedang offline/maintenance. Pesanan mungkin agak terlambat diproses.
        </div>
      )}

      {showForm && !pending && !paid ? (
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[#E3D9C2] bg-white p-6 shadow-xl relative text-left">
          <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 text-ink-muted hover:text-ink">
            ✕
          </button>
          
          <h3 className="text-xl font-bold mb-4">Bayar via QRIS</h3>
          <p className="text-sm text-ink-muted mb-4">
            Scan QRIS di bawah ini dengan aplikasi e-wallet atau m-banking kamu seperti GoPay, OVO, DANA, atau BCA sebesar <strong>Rp 20.000</strong>.
          </p>
          
          <div className="bg-white p-2 rounded-xl border-4 border-accent/20 mx-auto w-fit mb-4">
            <img src="/images/qris.png" alt="QRIS Payment" width={200} height={200} className="rounded-lg object-contain" />
          </div>

          <div className="mb-4 rounded-lg border border-[#E3D9C2] bg-[#FBF7EC] p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">NEXO Pass akan diaktifkan ke Discord ID kamu</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-ink select-all">{discordId}</p>
          </div>

          <div className="mb-4 rounded-lg bg-[#FBF7EC] p-3 text-xs text-ink-muted">
            <strong>Jam Operasional 08.00 - 22.00 WIB.</strong> Pembayaran di jam ini diproses cepat oleh Admin, di luar jam itu pesanan diproses besok.
          </div>

          <div className="mb-4 rounded-lg bg-danger px-3 py-2.5 text-xs leading-relaxed text-white">
            <strong>Unggah bukti transfer yang asli.</strong> Bukti palsu atau hasil suntingan membuat pesanan ditolak dan akunmu kena sanksi hingga ban permanen sesuai Ketentuan Layanan.
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                Nama Pengirim, sesuai rekening atau e-wallet
              </label>
              <input
                type="text"
                placeholder="Contoh Budi Santoso"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full rounded-lg border border-[#E3D9C2] bg-white px-4 py-2 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                disabled={buying}
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-1">
                Upload Bukti Transfer
              </label>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="w-full text-sm text-ink-muted file:mr-4 file:rounded-full file:border-0 file:bg-[#FBF7EC] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#2B2118] hover:file:bg-[#EFE7D3]"
                disabled={buying}
              />
              {fileError && <p className="mt-1 text-xs text-danger">{fileError}</p>}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={submitPayment}
              disabled={buying || !senderName || !receiptBase64}
              className="btn-primary flex-1 justify-center px-5! py-3! font-semibold shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buying ? 'Mengirim...' : 'Konfirmasi Bayar'}
            </button>
          </div>
        </div>
      ) : loggedIn && paid && (premiumActive || (order.paidAt && nowMs() - order.paidAt < 3 * 60 * 1000)) ? (
        <div className="rounded-xl bg-success px-5 py-3 text-sm font-semibold text-white">
          Pembayaran diterima! Premium sudah aktif.
        </div>
      ) : loggedIn && pending ? (
        <div className="max-w-sm w-full rounded-2xl border border-warning/40 bg-warning/10 p-6 text-center text-warning shadow-sm">
          <span className="mx-auto mb-3 inline-flex items-center gap-2 rounded-full bg-warning px-4 py-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
            Menunggu Verifikasi Admin
          </span>
          <h3 className="font-bold text-lg mb-2">Lagi diproses, silahkan tunggu</h3>
          <p className="text-sm opacity-90">
            Admin sedang memvalidasi bukti transfer kamu. Cek halaman ini secara berkala, pesanan akan segera disetujui.
          </p>
        </div>
      ) : (
        <button
          onClick={startBuy}
          disabled={buying}
          className="rounded-full bg-[#FBF7EC] border border-[#E3D9C2] text-[#2B2118] hover:bg-[#F4EEDF] px-8 py-4 font-bold shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Bayar via QRIS
        </button>
      )}
    </div>
  );
}

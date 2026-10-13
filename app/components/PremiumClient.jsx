'use client';

import { useCallback, useEffect, useState } from 'react';
import PremiumBenefits from './PremiumBenefits';
import { sisaHari, isLifetime, MAX_MONTHS, PLAN_PRICE, hargaBulan, bulanKeHari } from '../lib/premiumPlan';
import { emojiSrc } from '../lib/emojisClient';

function nowMs() {
  return Date.now();
}

export default function PremiumClient({ loggedIn, botOnline, initialPremiumActive, initialOrder, discordId }) {
  const [buying, setBuying] = useState(false);
  const [online, setOnline] = useState(botOnline);
  const [order, setOrder] = useState(initialOrder || null);
  const [error, setError] = useState(null);
  const [premiumActive, setPremiumActive] = useState(initialPremiumActive || false);
  // Data premium mentah (tier/expiresAt/lifetime) - dipakai untuk menampilkan
  // SISA HARI KONKRET, bukan angka tetap. Dulu halaman hanya bilang
  // "Kamu sudah Premium" tanpa menyebut sisa waktunya.
  const [premium, setPremium] = useState(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  // DURASI LANGGANAN (permintaan pemilik 2026-10-08): pembeli bisa memilih
  // berapa bulan (1-12). Harga & nominal yang ditampilkan mengikuti pilihan.
  const [bulan, setBulan] = useState(1);
  // METODE PEMBAYARAN (revisi 2026-10-12): dropdown berisi SEMUA channel aktif
  // merchant (QRIS, e-wallet, VA semua bank, retail, kartu kredit). Daftar
  // diambil live dari /api/payment/duitku/methods; nilai = KODE channel Duitku.
  const [metode, setMetode] = useState('NQ');
  const [methods, setMethods] = useState([]);
  // GUEST CHECKOUT (permintaan pemilik 2026-10-13): pembeli TANPA login tetap
  // bisa bayar - Discord ID diisi manual di form (target grant pass).
  const [guestId, setGuestId] = useState('');
  const guestIdValid = /^\d{17,20}$/.test(guestId.trim());
  const totalHarga = hargaBulan(bulan);

  // Muat daftar metode sekali saat form pertama dibuka (endpoint cache 1 jam).
  useEffect(() => {
    if (!showForm || methods.length) return;
    fetch('/api/payment/duitku/methods', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.methods) && d.methods.length) {
          setMethods(d.methods);
          // Kalau metode terpilih tidak ada di daftar live, pindah ke yang pertama.
          setMetode((m) => (d.methods.some((x) => x.code === m) ? m : d.methods[0].code));
        }
      })
      .catch(() => {});
  }, [showForm, methods.length]);

  // Kelompokkan metode per kategori untuk <optgroup> dropdown.
  const metodeGroups = (() => {
    const g = {};
    for (const m of methods) {
      const k = m.kategori || 'Lainnya';
      (g[k] = g[k] || []).push(m);
    }
    return g;
  })();
  const metodeDipilih = methods.find((m) => m.code === metode) || null;

  const loadStatus = useCallback(async () => {
    try {
      const [payRes, meRes] = await Promise.all([
        fetch('/api/payment/manual', { cache: 'no-store' }),
        fetch('/api/me', { cache: 'no-store' }),
      ]);
      if (payRes.ok) {
        const d = await payRes.json().catch(() => ({}));
        setOrder(d.order || null);
        setOnline(Boolean(d.botOnline));
      }
      if (meRes.ok) {
        const m = await meRes.json().catch(() => ({}));
        const p = m.profile?.profile?.premium;
        const active =
          p === true ||
          (p && typeof p === 'object' && (p.lifetime || Number(p.expiresAt) > Date.now()));
        setPremiumActive(Boolean(m.profile?.exists && active));
        // Simpan objek premium kalau bentuknya memang objek (punya expiresAt).
        // Kalau bentuknya boolean lama (true), tetap aman - sisa hari tidak
        // ditampilkan daripada menampilkan angka salah.
        setPremium(p && typeof p === 'object' ? p : null);
      }
    } catch {}
  }, []);

  // Poll status untuk memantau aktivasi otomatis Duitku secara background.
  // Setelah bayar di halaman Duitku, user kembali ke sini (?selesai=1) dan
  // webhook mengaktifkan pass dalam hitungan detik - poll ini menangkapnya.
  useEffect(() => {
    if (!loggedIn || order?.status !== 'pending') return;
    const i1 = setInterval(loadStatus, 3000);
    return () => clearInterval(i1);
  }, [loggedIn, order?.status, loadStatus]);

  async function startBuy() {
    // GUEST CHECKOUT (2026-10-13): dulu guest DIPAKSA login dulu. Sekarang
    // form langsung terbuka - Discord ID diisi manual di dalam form. Ini juga
    // memudahkan tim verifikasi Duitku yang mau mencoba pembayaran.
    setShowForm(true);
    setError(null);
  }

  // ==========================================
  // BAYAR VIA DUITKU (2026-10-12 - menggantikan QRIS manual)
  // ==========================================
  // Alur: POST /api/payment/duitku/create -> server buat order + inquiry ke
  // Duitku -> dapat paymentUrl -> redirect. Setelah user selesai bayar di
  // halaman Duitku, dia kembali ke /premium?selesai=1 dan webhook Duitku
  // sudah mengaktifkan pass otomatis (tanpa approve admin).
  async function submitPayment() {
    setBuying(true);
    setError(null);
    try {
      const res = await fetch('/api/payment/duitku/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Guest kirim discordId manual; user login tidak perlu (server ambil
        // dari session).
        body: JSON.stringify({ months: bulan, method: metode, ...(loggedIn ? {} : { discordId: guestId.trim() }) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        if (d.error === 'premium_active') {
          setPremiumActive(true);
          setShowForm(false);
          loadStatus();
          return;
        }
        throw new Error(d.error || 'Gagal membuat transaksi. Coba lagi ya.');
      }
      // Redirect ke halaman pembayaran Duitku (VA/QRIS/e-wallet).
      window.location.href = d.paymentUrl;
    } catch (e) {
      setError(e.message);
      setBuying(false);
    }
  }

  // Satu Pass = satu pembelian per bulan. Yang sudah premium TIDAK bisa beli
  // / perpanjang lagi - tombol bayar baru muncul setelah pass di lepas admin
  // atau jatuh tempo (lihat userHasPremium).
  if (premiumActive) {
    // Masa aktif KONKRET: dihitung dari expires_at yang sebenarnya, bukan angka
    // tetap "30 hari". Kalau lifetime -> "Aktif selamanya".
    const lt = isLifetime(premium);
    const hari = !lt && premium?.expiresAt ? sisaHari(premium.expiresAt) : null;
    const tanggal = !lt && premium?.expiresAt
      ? new Date(Number(premium.expiresAt)).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    return (
      <div className="mt-8 flex flex-col items-center gap-3">
        {/* Badge status aktif: gaya SAMA dengan badge di profil
            (cream + cincin oranye 50%) - dulu hijau pekat sehingga menyalahi
            warna merek NEXO dan berbeda dari badge di halaman lain. */}
        <div className="inline-flex flex-col items-center gap-1 rounded-2xl border border-accent/50 bg-card-cream px-5 py-3 text-center text-ink shadow-sm">
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            {emojiSrc('download3') && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emojiSrc('download3')} alt="" width={16} height={16} className="h-4 w-4" />
            )}
            NEXO Pass aktif
          </span>
          {lt ? (
            <span className="text-xs text-ink-muted">Aktif selamanya</span>
          ) : hari != null ? (
            <span className="text-xs text-ink-muted">
              {hari > 0 ? `Sisa ${hari} hari` : 'Berakhir hari ini'}
              {tanggal ? ` - sampai ${tanggal}` : ''}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-ink-muted">Semua perk di bawah aktif di Discord dan halaman profil.</p>
        <PremiumBenefits premium={premium} />
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
          <strong>⚠ BOT OFFLINE</strong> - pesanan tetap tersimpan dan otomatis diproses saat bot kembali online.
        </div>
      )}

      {showForm && !pending && !paid ? (
        <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border-soft bg-white p-6 shadow-xl relative text-left">
          <button onClick={() => setShowForm(false)} className="absolute top-4 right-4 text-ink-muted hover:text-ink">
            ✕
          </button>

          <h3 className="text-xl font-bold mb-4">Bayar NEXO Pass</h3>

          {/* DURASI (revisi 2026-10-12: tombol 1-12 bln diganti dropdown -
              permintaan pemilik "gw mau di geser jadi dropdown"). */}
          <div className="mb-4">
            <label htmlFor="p-durasi" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
              Durasi Langganan
            </label>
            <select
              id="p-durasi"
              value={bulan}
              onChange={(e) => setBulan(parseInt(e.target.value, 10))}
              disabled={buying}
              className="w-full rounded-lg border border-border-soft bg-white px-3 py-2.5 text-sm font-semibold text-ink focus:border-accent focus:outline-none cursor-pointer disabled:opacity-50"
            >
              {Array.from({ length: MAX_MONTHS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} bulan ({bulanKeHari(n)} hari) - Rp {hargaBulan(n).toLocaleString('id-ID')}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-ink-muted">
              Pilihan: <strong>{bulan} bulan</strong> ({bulanKeHari(bulan)} hari) •{' '}
              <strong>Rp {totalHarga.toLocaleString('id-ID')}</strong>
              {bulan > 1 ? ` (Rp ${PLAN_PRICE.toLocaleString('id-ID')}/bulan)` : ''}
            </p>
          </div>

          {/* METODE PEMBAYARAN (revisi 2026-10-12): dropdown SEMUA channel
              aktif merchant - QRIS, e-wallet, VA semua bank, retail, kartu
              kredit. Daftar dari /api/payment/duitku/methods (live + cache). */}
          <div className="mb-4">
            <label htmlFor="p-metode" className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
              Metode Pembayaran
            </label>
            <select
              id="p-metode"
              value={metode}
              onChange={(e) => setMetode(e.target.value)}
              disabled={buying}
              className="w-full rounded-lg border border-border-soft bg-white px-3 py-2.5 text-sm font-semibold text-ink focus:border-accent focus:outline-none cursor-pointer disabled:opacity-50"
            >
              {methods.length === 0 && <option value="NQ">Memuat metode...</option>}
              {Object.entries(metodeGroups).map(([kategori, list]) => (
                <optgroup key={kategori} label={kategori}>
                  {list.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {metodeDipilih && (
              <p className="mt-2 text-xs text-ink-muted">
                {String(metodeDipilih.kategori || '').includes('QRIS')
                  ? 'Satu QR bisa discan aplikasi apa pun (GoPay, OVO, DANA, m-banking).'
                  : String(metodeDipilih.kategori || '').includes('Virtual Account')
                    ? 'Kamu akan mendapat nomor Virtual Account untuk transfer.'
                    : String(metodeDipilih.kategori || '').includes('E-Wallet')
                      ? 'Pembayaran lewat aplikasi e-wallet pilihanmu.'
                      : 'Ikuti petunjuk di halaman pembayaran Duitku.'}
              </p>
            )}
          </div>

          <p className="text-sm text-ink-muted mb-4">
            Kamu akan diarahkan ke halaman pembayaran aman <strong>Duitku</strong> sebesar{' '}
            <strong>Rp {totalHarga.toLocaleString('id-ID')}</strong> via <strong>{metodeDipilih?.name || 'QRIS'}</strong>.
          </p>

          <div className="mb-4 rounded-lg border border-border-soft bg-card-cream p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">NEXO Pass akan diaktifkan ke Discord ID</p>
            {loggedIn ? (
              <p className="mt-0.5 font-mono text-sm font-bold text-ink select-all">{discordId}</p>
            ) : (
              // GUEST: isi Discord ID manual. Panduan cara menyalin ID
              // ditulis singkat di bawah input.
              <div className="mt-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={guestId}
                  onChange={(e) => setGuestId(e.target.value.replace(/\D/g, ''))}
                  placeholder="Contoh: 836383639439671366"
                  disabled={buying}
                  className="w-full rounded-lg border border-border-soft bg-white px-3 py-2 text-center font-mono text-sm font-bold text-ink focus:border-accent focus:outline-none disabled:opacity-50"
                />
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-muted">
                  Belum login? Tidak masalah, tetap bisa bayar. Cara lihat ID:
                  Discord &gt; Pengaturan &gt; Lanjutan &gt; aktifkan Mode Developer
                  &gt; klik profilmu &gt; Copy ID.
                </p>
                {guestId.length > 0 && !guestIdValid && (
                  <p className="mt-1 text-[10px] font-semibold text-danger">Discord ID harus 17-20 digit angka.</p>
                )}
              </div>
            )}
          </div>

          <div className="mb-4 rounded-lg bg-card-cream p-3 text-xs text-ink-muted">
            <strong>Otomatis & instan.</strong> Setelah pembayaran terkonfirmasi, NEXO Pass langsung aktif di akunmu - tanpa perlu kirim bukti atau menunggu admin.
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={submitPayment}
              disabled={buying || (!loggedIn && !guestIdValid)}
              className="btn-primary flex-1 justify-center px-5! py-3! font-semibold shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {buying ? 'Menyiapkan pembayaran...' : `Bayar Rp ${totalHarga.toLocaleString('id-ID')}`}
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
            Menunggu Pembayaran
          </span>
          <h3 className="font-bold text-lg mb-2">Selesaikan pembayaranmu</h3>
          {/* Info pesanan yang sedang menunggu - biar user tahu nominal &
              durasi yang akan dibayar (dari GET /api/payment/manual). */}
          {order?.plan && (
            <p className="mb-2 text-sm font-semibold">
              {order.plan}{order?.amount ? ` • Rp ${Number(order.amount).toLocaleString('id-ID')}` : ''}
            </p>
          )}
          <p className="text-sm opacity-90">
            Kalau kamu sudah membayar di halaman Duitku, pass akan aktif otomatis dalam hitungan detik - halaman ini memperbarui sendiri.
            Belum bayar? Lanjutkan pembayaranmu dari tombol di bawah.
          </p>
          {/* FIX 2026-10-12: dulu tombol ini membuka form lalu submit ditolak
              "masih punya pesanan pending" - user terjebak. Sekarang server
              me-RESUME order pending yang masih berlaku (<60 menit) dan
              mengembalikan paymentUrl yang sama. Kalau sudah kedaluwarsa,
              server otomatis menandai expired lalu membuat order baru. */}
          <button
            onClick={submitPayment}
            disabled={buying}
            className="mt-4 rounded-lg border border-warning/50 bg-white px-4 py-2 text-xs font-semibold text-warning transition hover:bg-warning hover:text-white cursor-pointer disabled:opacity-50"
          >
            {buying ? 'Menyiapkan...' : 'Lanjutkan Pembayaran'}
          </button>
        </div>
      ) : (
        <button
          onClick={startBuy}
          disabled={buying}
          className="rounded-full bg-card-cream border border-border-soft text-ink hover:bg-bg px-8 py-4 font-bold shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Bayar NEXO Pass
        </button>
      )}

      {/* Daftar keunggulan: tampil juga untuk yang BELUM berlangganan supaya
          pembeli tahu persis apa yang dia dapat sebelum membayar. */}
      <PremiumBenefits premium={null} />
    </div>
  );
}

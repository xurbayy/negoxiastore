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
  // METODE PEMBAYARAN (permintaan pemilik 2026-10-12): QRIS (default) atau
  // Virtual Account BCA. Duitku inquiry butuh satu kode channel; 'qris' -> NQ
  // (Nobu QRIS - satu QR untuk semua aplikasi), 'va' -> BC (BCA VA).
  const [metode, setMetode] = useState('qris');
  const totalHarga = hargaBulan(bulan);

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
    if (!loggedIn) {
      window.location.href = '/login?returnTo=%2Fpremium';
      return;
    }

    // Instantly show form, no need to check /api/me here which could hang
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
        body: JSON.stringify({ months: bulan, method: metode }),
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

          {/* PILIH DURASI (permintaan pemilik 2026-10-08): pembeli memilih
              berapa bulan (maks 12 / setahun). Harga & nominal mengikuti. */}
          <div className="mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
              Durasi Langganan
            </label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: MAX_MONTHS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setBulan(n)}
                  disabled={buying}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                    bulan === n
                      ? 'border-accent bg-accent text-white'
                      : 'border-border-soft bg-white text-ink hover:border-accent'
                  }`}
                >
                  {n} bln
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Pilihan: <strong>{bulan} bulan</strong> ({bulanKeHari(bulan)} hari) •{' '}
              <strong>Rp {totalHarga.toLocaleString('id-ID')}</strong>
              {bulan > 1 ? ` (Rp ${PLAN_PRICE.toLocaleString('id-ID')}/bulan)` : ''}
            </p>
          </div>

          {/* PILIH METODE PEMBAYARAN (permintaan pemilik 2026-10-12):
              QRIS (scan pakai aplikasi apa pun) atau VA BCA. */}
          <div className="mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-muted mb-2">
              Metode Pembayaran
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMetode('qris')}
                disabled={buying}
                className={`rounded-lg border px-3 py-2.5 text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                  metode === 'qris'
                    ? 'border-accent bg-accent text-white'
                    : 'border-border-soft bg-white text-ink hover:border-accent'
                }`}
              >
                QRIS
                <span className={`mt-0.5 block text-[10px] font-medium ${metode === 'qris' ? 'text-white/80' : 'text-ink-muted'}`}>
                  Scan pakai aplikasi apa pun
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMetode('va')}
                disabled={buying}
                className={`rounded-lg border px-3 py-2.5 text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                  metode === 'va'
                    ? 'border-accent bg-accent text-white'
                    : 'border-border-soft bg-white text-ink hover:border-accent'
                }`}
              >
                Virtual Account
                <span className={`mt-0.5 block text-[10px] font-medium ${metode === 'va' ? 'text-white/80' : 'text-ink-muted'}`}>
                  Transfer bank BCA
                </span>
              </button>
            </div>
          </div>

          <p className="text-sm text-ink-muted mb-4">
            Kamu akan diarahkan ke halaman pembayaran aman <strong>Duitku</strong> sebesar{' '}
            <strong>Rp {totalHarga.toLocaleString('id-ID')}</strong>
            {metode === 'qris' ? ' - siapkan aplikasi e-wallet atau m-banking untuk scan QRIS.' : ' - transfer ke nomor Virtual Account BCA yang muncul.'}
          </p>

          <div className="mb-4 rounded-lg border border-border-soft bg-card-cream p-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">NEXO Pass akan diaktifkan ke Discord ID kamu</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-ink select-all">{discordId}</p>
          </div>

          <div className="mb-4 rounded-lg bg-card-cream p-3 text-xs text-ink-muted">
            <strong>Otomatis & instan.</strong> Setelah pembayaran terkonfirmasi, NEXO Pass langsung aktif di akunmu - tanpa perlu kirim bukti atau menunggu admin.
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={submitPayment}
              disabled={buying}
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

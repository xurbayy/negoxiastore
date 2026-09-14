'use client';

import { useCallback, useEffect, useState } from 'react';
import { emojiSrc } from '../lib/emojisClient';

const PERKS = [
  { emoji: 'PE_PandaBackPack', text: 'Inventori Unlimited: simpan item tanpa batas 5 per jenis' },
  { emoji: 'sun58', text: 'Kuota Harian +5.000 pts: limit main harianmu naik di atas streak bonus' },
  { emoji: '267042fire', text: 'Klaim Harian +10%: reward nxdaily selalu 10% lebih besar' },
  { emoji: 'goldcoin', text: 'Bunga Pinjaman -10%: pinjam di bank lebih murah' },
  { emoji: 'tasks', text: '+1 Slot Misi Harian: 4 misi per hari, lebih banyak poin dicairkan' },
  { emoji: 'UC_Checkmark', text: 'Prioritas Render: papan game muncul lebih cepat + cooldown render setengah' },
  { emoji: 'controller', text: 'Akses Game Beta: coba game baru sebelum rilis publik' },
  { emoji: 'download3', text: 'Profil Web Premium: grafik riwayat & badge khusus di website' },
];

// Alur beli NEXO Pass: cek status order -> beli (Snap popup Midtrans).
// Sudah premium = tombol disabled. Belum login = redirect /login?returnTo=/premium.
function nowMs() {
  return Date.now();
}

export default function PremiumClient({ loggedIn, botOnline = true, justPaid = false }) {
  const [order, setOrder] = useState(null);
  const [premiumActive, setPremiumActive] = useState(false);
  const [online, setOnline] = useState(botOnline);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const [payRes, meRes] = await Promise.all([
        fetch('/api/payment/snap', { cache: 'no-store' }),
        fetch('/api/me', { cache: 'no-store' }),
      ]);
      if (payRes.ok) {
        const d = await payRes.json();
        setOrder(d.order || null);

        setOnline(Boolean(d.botOnline));
      }
      if (meRes.ok) {
        const m = await meRes.json();
        setPremiumActive(Boolean(m.profile?.exists && m.profile?.profile?.premium));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loggedIn) loadStatus();
    else setLoading(false);
  }, [loggedIn, loadStatus]);

  // Baru diarahkan dari Midtrans (payment=done): kejar status tiap 2 detik
  // selama 12 detik pertama sampai order berubah dari pending.
  useEffect(() => {
    if (!loggedIn || !justPaid) return;
    let tries = 0;
    const iv = setInterval(async () => {
      tries += 1;
      const res = await fetch('/api/payment/snap', { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.order && d.order.status !== 'pending') { clearInterval(iv); loadStatus(); return; }
      if (tries >= 6) clearInterval(iv);
    }, 2000);
    return () => clearInterval(iv);
  }, [loggedIn, justPaid, loadStatus]);

  // Poll status: cepat (5 dtk) saat ada pembayaran menggantung; jinak 30 dtk
  // utk deteksi "bot sudah hidup lagi" tanpa refresh halaman.
  useEffect(() => {
    const iv = setInterval(loadStatus, order && order.status === 'pending' ? 2000 : 30000);
    return () => clearInterval(iv);
  }, [order, loadStatus]);

  async function buy() {
    if (!loggedIn) {
      window.location.href = '/api/auth/login?returnTo=%2Fpremium';
      return;
    }
    // Aturan: tanpa registered=true di bot, tombol beli tidak boleh aktif.
    try {
      const meRes = await fetch('/api/me', { cache: 'no-store' });
      const me = await meRes.json();
      if (me.profile?.registered !== true || me.profile?.needsOnboarding === true) {
        setError('Datamu belum terdaftar sebagai pemain. Daftar dulu di Discord: invite NEXO lalu ketik nxdaily. Setelah itu baru bisa beli NEXO Pass.');
        return;
      }
    } catch {
      setError('Gagal memeriksa status pemain. Coba lagi.');
      return;
    }
    setBuying(true);
    setError(null);
    fetch('/api/payment/snap', { method: 'POST' })
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) {
          if (d.error === 'premium_active') {
            setPremiumActive(true);
            loadStatus();
            return;
          }
          throw new Error(d.error === 'bot_offline' ? 'Sedang tidak bisa membeli: bot lagi mati. Coba lagi beberapa menit lagi, uangnya dijamin aman.' : (d.error || 'Gagal membuat transaksi.'));
        }
        setOrder({ status: 'pending', snapToken: d.token });
        if (window.snap) {
          window.snap.pay(d.token, {
            onSuccess: () => loadStatus(),
            onPending: () => loadStatus(),
            onError: () => setError('Pembayaran gagal diproses. Coba lagi.'),
            onClose: () => loadStatus(),
          });
        } else {
          setError('Popup pembayaran belum siap. Muat ulang halaman lalu coba lagi.');
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setBuying(false));
  }

  function payNow() {
    if (order?.snapToken && window.snap) {
      window.snap.pay(order.snapToken, {
        onSuccess: () => loadStatus(),
        onPending: () => loadStatus(),
        onError: () => setError('Pembayaran gagal diproses.'),
        onClose: () => {},
      });
    }
  }

  if (loading) {
    return <div className="skeleton mx-auto mt-8 h-14 w-64" />;
  }

  // Status premium aktif: kartu hijau jelas + tombol hilang (tidak membingungkan)
  if (premiumActive) {
    return (
      <div className="mt-8 flex flex-col items-center gap-2">
        <div className="flex items-center gap-3 rounded-2xl bg-success px-6 py-4 text-white shadow-md">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-success">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M5 13l4 4L19 7" /></svg>
          </span>
          <p className="font-semibold">Kamu sudah Premium</p>
        </div>
        <p className="text-xs text-ink-muted">Semua perk aktif di Discord dan halaman profil.</p>
      </div>
    );
  }

  const pending = order?.status === 'pending';
  const paid = order?.status === 'paid';

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      {!loggedIn && (
        <>
          <button type="button" onClick={buy} className="btn-primary !px-8 !py-3.5 text-base cursor-pointer">
            Login untuk Membeli
          </button>
          <p className="text-xs text-ink-muted">Login pakai Discord, lanjut bayar via QRIS atau e-wallet.</p>
        </>
      )}

      {loggedIn && paid && (premiumActive || (order.paidAt && nowMs() - order.paidAt < 3 * 60 * 1000)) ? (
        <p className="rounded-xl border border-success/40 bg-success/10 px-5 py-3 text-sm font-semibold text-success">
          Pembayaran diterima! Premium aktif dalam ~5-10 detik{premiumActive ? ' - sudah aktif, cek lonceng notifikasi.' : '.'}
        </p>
      ) : loggedIn && pending ? (
        <>
          {justPaid ? (
            // Baru balik dari halaman Midtrans "Payment successful" - JANGAN
            // tampilkan tombol "Lanjut Bayar" (risiko user bayar DUA KALI).
            // Webhook sedang memproses; halaman ini poll tiap 2 detik.
            <p className="rounded-xl border border-success/40 bg-success/10 px-5 py-3 text-sm font-semibold text-success">
              Pembayaran diterima! Sedang diverifikasi otomatis - jangan bayar lagi, premium menyala sendiri dalam beberapa detik.
            </p>
          ) : (
            <>
              <p className="rounded-xl border border-accent/40 bg-accent/10 px-5 py-3 text-sm text-accent-hover">
                Pembayaran terakhir belum selesai. Kalau kamu sudah transfer, JANGAN bayar dua kali - statusnya otomatis dicek ulang tiap beberapa detik. Atau lanjut bayar di bawah.
              </p>
              <button type="button" onClick={payNow} className="btn-primary cursor-pointer text-sm">
                Lanjut Bayar
              </button>
            </>
          )}
        </>
      ) : loggedIn ? (
        <button type="button" onClick={buy} disabled={buying || !online} className="btn-primary !px-8 !py-3.5 text-base cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
          {buying ? 'Memproses…' : !online ? 'Bot Offline - Beli Nanti Lagi' : 'Beli NEXO Pass · Rp 20.000/bulan'}
        </button>
      ) : null}

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="mx-auto mt-8 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-2">
        {PERKS.map((p) => (
          <li key={p.text} className="flex items-start gap-3 rounded-xl border border-border-soft bg-card-cream px-4 py-3.5">
            {emojiSrc(p.emoji) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={emojiSrc(p.emoji)} alt="" width={20} height={20} loading="lazy" className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <span className="text-sm leading-snug text-ink">{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

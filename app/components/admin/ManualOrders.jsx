'use client';

import { useState } from 'react';
import ConfirmModal from './ConfirmModal';
import { PLAN_DAYS } from '../../lib/premiumPlan';

// Terima DUA bentuk (fix 2026-10-04):
//  - OBJEK  : { senderName, adaBukti, ringkas } - bentuk BARU dari /api/admin/data
//             (metadata ringkas; gambar diambil on-demand)
//  - STRING : JSON lama { senderName, receiptBase64 } - masih mungkin dari
//             endpoint lain / cache lama
// Dulu hanya menangani string -> saat API mengirim objek, JSON.parse gagal dan
// SEMUA pengirim tampil "Unknown" (bug yang dilaporkan pemilik).
function parseRef(ref) {
  if (!ref) return { senderName: 'Unknown', receiptBase64: null, adaBukti: false };
  if (typeof ref === 'object') {
    return {
      senderName: ref.senderName || 'Unknown',
      receiptBase64: ref.receiptBase64 || null,
      adaBukti: Boolean(ref.adaBukti || ref.receiptBase64),
    };
  }
  try {
    const p = JSON.parse(ref);
    return {
      senderName: p?.senderName || 'Unknown',
      receiptBase64: p?.receiptBase64 || null,
      adaBukti: Boolean(p?.receiptBase64),
    };
  } catch {
    return { senderName: 'Unknown', receiptBase64: null, adaBukti: false };
  }
}

// ==========================================
// BUKTI TRANSFER - ambil gambar ON-DEMAND (permintaan pemilik 2026-10-04)
// ==========================================
// Dulu gambar base64 ikut di SETIAP poll /api/admin/data: 519 KB tiap 5 detik
// padahal hampir tidak pernah dilihat. Sekarang daftar hanya membawa metadata
// (`adaBukti`), dan gambar diambil lewat /api/admin/manual-order?id=N hanya
// saat kartu order ini benar-benar tampil.
function BuktiTransfer({ order }) {
  const [img, setImg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const meta = parseRef(order.gatewayRef);

  const muat = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/manual-order?id=${order.id}`, { cache: 'no-store' });
      const d = await res.json().catch(() => ({}));
      if (d.ok && d.receiptBase64) setImg(d.receiptBase64);
      else setErr('Bukti gambar tidak tersedia.');
    } catch (e) {
      setErr(e?.message || 'Gagal memuat bukti.');
    } finally {
      setLoading(false);
    }
  };

  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt="Bukti Transfer" className="max-h-64 object-contain mx-auto rounded" />;
  }
  if (!meta.adaBukti) return <span className="text-xs text-ink-muted">Tidak ada bukti gambar</span>;
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={muat}
        disabled={loading}
        className="rounded-lg border border-border-soft bg-card-cream px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-accent hover:bg-accent/10 disabled:opacity-50 cursor-pointer"
      >
        {loading ? 'Memuat bukti...' : '🖼️ Lihat Bukti Transfer'}
      </button>
      {err && <p className="text-[0.7rem] text-danger">{err}</p>}
    </div>
  );
}

const STATUS_BADGE = {
  pending: 'bg-warning text-white',
  paid: 'bg-success text-white',
  expired: 'bg-danger text-white',
};

export default function ManualOrders({ orders, reload }) {
  const all = orders || [];
  const pendingOrders = all.filter((o) => o.status === 'pending' && o.gateway === 'manual');
  // Riwayat = order manual yang sudah selesai (disetujui / ditolak / expired).
  const historyOrders = all
    .filter((o) => o.gateway === 'manual' && o.status !== 'pending')
    .sort((a, b) => b.createdAt - a.createdAt);

  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { kind, order? }
  const [flash, setFlash] = useState(null);

  // Tidak ada confirm()/alert() bawaan browser: konfirmasi pakai ConfirmModal
  // desain panel sendiri, pesan error tampil inline.
  function showFlash(msg) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 4000);
  }

  async function callApi(orderId, action) {
    setBusyId(orderId);
    try {
      const res = await fetch('/api/admin/manual-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) showFlash(data.error || 'Gagal memproses.');
      await reload?.();
    } catch {
      showFlash('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  async function callDelete(orderId, isAll) {
    setBusyId(isAll ? 'all' : orderId);
    try {
      const res = await fetch('/api/admin/manual-order', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isAll ? { all: true } : { orderId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.ok) showFlash(data.error || 'Gagal menghapus.');
      await reload?.();
    } catch {
      showFlash('Gagal menghubungi server.');
    } finally {
      setBusyId(null);
      setConfirm(null);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === 'approve') await callApi(confirm.order.id, 'approve');
    else if (confirm.kind === 'reject') await callApi(confirm.order.id, 'reject');
    else if (confirm.kind === 'delete') await callDelete(confirm.order.id, false);
    else if (confirm.kind === 'deleteAll') await callDelete(null, true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Pembayaran QRIS</h2>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {pendingOrders.length} Pending
        </div>
      </div>

      {flash && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {flash}
        </p>
      )}

      <p className="text-sm text-ink-muted">
        Daftar pemain yang sudah checkout via manual QRIS. Periksa bukti transfer mereka dengan mutasi E-Wallet kamu sebelum klik Terima.
      </p>

      {pendingOrders.length === 0 ? (
        <div className="border border-surface-raised rounded-2xl bg-surface p-8 text-center text-ink-muted">
          Belum ada pesanan manual yang masuk.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pendingOrders.map((order) => {
            const data = parseRef(order.gatewayRef);
            return (
              <div key={order.id} className="border border-surface-raised rounded-2xl bg-surface p-4 flex flex-col gap-4 relative">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold">Order #{order.id}</h3>
                    <p className="text-xs text-ink-muted">Discord ID: {order.discordId}</p>
                    <p className="text-sm font-medium mt-1">Pengirim: <span className="text-primary">{data.senderName}</span></p>
                    <p className="text-xs text-ink-muted mt-1">{new Date(order.createdAt).toLocaleString('id-ID')}</p>
                  </div>
                </div>

                <div className="border border-surface-raised rounded bg-surface-sunken p-2 text-center overflow-hidden">
                  <BuktiTransfer order={order} />
                </div>

                <div className="flex gap-2 mt-auto">
                  <button
                    className="flex-1 rounded-xl bg-success text-white py-2 font-semibold hover:bg-success/90 disabled:opacity-50 cursor-pointer"
                    onClick={() => setConfirm({ kind: 'approve', order })}
                    disabled={busyId === order.id}
                  >
                    Terima & Aktifkan
                  </button>
                  <button
                    className="flex-none px-4 rounded-xl bg-danger text-white py-2 font-semibold hover:bg-danger/90 disabled:opacity-50 cursor-pointer"
                    onClick={() => setConfirm({ kind: 'reject', order })}
                    disabled={busyId === order.id}
                  >
                    Tolak
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ RIWAYAT PESANAN ═══ */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <h3 className="font-display text-lg font-bold text-ink">Riwayat Pesanan</h3>
        {historyOrders.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirm({ kind: 'deleteAll' })}
            disabled={busyId === 'all'}
            className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50 cursor-pointer"
          >
            {busyId === 'all' ? 'Menghapus…' : 'Hapus Semua Riwayat'}
          </button>
        )}
      </div>

      {historyOrders.length === 0 ? (
        <div className="border border-surface-raised rounded-2xl bg-surface p-6 text-center text-sm text-ink-muted">
          Riwayat masih kosong. Pesanan yang sudah disetujui atau ditolak masuk ke sini.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-raised">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border-soft bg-surface text-xs uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Pembeli</th>
                <th className="px-4 py-3">Pengirim</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {historyOrders.map((order) => {
                const data = parseRef(order.gatewayRef);
                return (
                  <tr key={order.id} className="border-b border-border-soft/60 last:border-0 align-top">
                    <td className="px-4 py-3 font-mono text-xs">#{order.id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted">{order.discordId}</td>
                    <td className="px-4 py-3">{data.senderName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_BADGE[order.status] || 'bg-surface-raised text-ink-muted'}`}>
                        {order.status === 'expired' ? 'Ditolak / Expired' : order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">
                      {new Date(order.createdAt).toLocaleString('id-ID')}
                      {order.paidAt ? ` → dibayar ${new Date(order.paidAt).toLocaleString('id-ID')}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setConfirm({ kind: 'delete', order })}
                        disabled={busyId === order.id}
                        className="rounded-lg border border-border-soft px-2.5 py-1 text-xs font-semibold text-ink-muted transition hover:border-danger/40 hover:text-danger disabled:opacity-50 cursor-pointer"
                      >
                        {busyId === order.id ? '…' : 'Hapus'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title={
            confirm.kind === 'approve' ? `Terima Order #${confirm.order.id}?`
            : confirm.kind === 'reject' ? `Tolak Order #${confirm.order.id}?`
            : confirm.kind === 'delete' ? `Hapus riwayat Order #${confirm.order.id}?`
            : 'Hapus SEMUA riwayat pesanan?'
          }
          body={
            confirm.kind === 'approve' ? `NEXO Pass ${PLAN_DAYS} hari akan diaktifkan ke pembeli dan notifikasi dikirim. Pastikan nominal di bukti transfer cocok dengan mutasi E-Wallet kamu.`
            : confirm.kind === 'reject' ? 'Pesanan ditandai ditolak dan pembeli dapat notifikasi. Mereka bisa submit ulang dengan bukti yang benar.'
            : confirm.kind === 'delete' ? 'Riwayat order ini (termasuk gambar bukti transfernya) dihapus permanen dari panel. Tidak memengaruhi status premium pemain.'
            : 'Semua riwayat pesanan QRIS yang sudah selesai (disetujui, ditolak, atau expired) akan dihapus permanen. Pesanan yang masih pending TIDAK ikut terhapus.'
          }
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
          busy={busyId !== null}
        />
      )}
    </div>
  );
}

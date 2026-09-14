'use client';

import { useState } from 'react';

export default function ManualOrders({ orders }) {
  const [processingId, setProcessingId] = useState(null);
  
  const pendingOrders = (orders || []).filter(o => o.status === 'pending' && o.gateway === 'manual');
  
  async function handleAction(orderId, action) {
    if (!confirm(action === 'approve' ? 'Terima pembayaran ini & berikan NEXO Pass?' : 'Tolak pesanan ini?')) return;
    
    setProcessingId(orderId);
    try {
      const res = await fetch('/api/admin/manual-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json();
      if (!data.ok) alert('Gagal: ' + data.error);
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setProcessingId(null);
    }
  }

  function parseRef(ref) {
    try {
      return JSON.parse(ref);
    } catch {
      return { senderName: 'Unknown', receiptBase64: null };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Manual Orders (QRIS)</h2>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {pendingOrders.length} Pending
        </div>
      </div>

      <p className="text-sm text-ink-muted">
        Daftar pemain yang sudah checkout via manual QRIS. Periksa bukti transfer mereka dengan mutasi E-Wallet kamu sebelum klik Terima.
      </p>

      {pendingOrders.length === 0 ? (
        <div className="border border-surface-raised rounded-2xl bg-surface p-8 text-center text-ink-muted">
          Belum ada pesanan manual yang masuk.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pendingOrders.map(order => {
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
                  {data.receiptBase64 ? (
                    <img src={data.receiptBase64} alt="Bukti Transfer" className="max-h-64 object-contain mx-auto rounded" />
                  ) : (
                    <span className="text-xs text-ink-muted">Tidak ada bukti gambar</span>
                  )}
                </div>

                <div className="flex gap-2 mt-auto">
                  <button 
                    className="flex-1 rounded-xl bg-success text-white py-2 font-semibold hover:bg-success/90 disabled:opacity-50"
                    onClick={() => handleAction(order.id, 'approve')}
                    disabled={processingId === order.id}
                  >
                    Terima & Aktifkan
                  </button>
                  <button 
                    className="flex-none px-4 rounded-xl bg-danger text-white py-2 font-semibold hover:bg-danger/90 disabled:opacity-50"
                    onClick={() => handleAction(order.id, 'reject')}
                    disabled={processingId === order.id}
                  >
                    Tolak
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

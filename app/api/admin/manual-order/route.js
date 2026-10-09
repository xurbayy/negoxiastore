import { NextResponse } from 'next/server';
import { getAdminSession, getSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { touchActivity } from '../../../lib/activity';
import { PLAN_DAYS, bulanKeHari, normalBulan } from '../../../lib/premiumPlan';
import { notifyQueue } from '../../../lib/pgNotifyWeb';
import { sisipNotif } from '../../../lib/notif';
// Invalidasi ON-WRITE + catat ke Activity Log (permintaan pemilik 2026-10-04:
// "semua kegiatan tak terkecuali" masuk activity log).
import { invalidateLive } from '../../../lib/snapshot';
import { invalidateDataCache } from '../data/route';

export const dynamic = 'force-dynamic';

// Catat hapus riwayat order ke Activity Log + bersihkan cache (perubahan
// langsung terlihat di panel).
async function catatHapusOrder(actor, detail) {
  try {
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO bot_commands (action, payload, actor_id, status, result, created_at, executed_at)
            VALUES ('hapus_order_qris', ?, ?, 'done', ?, ?, ?)`,
      args: [JSON.stringify({ detail }), actor, `Hapus riwayat order QRIS: ${detail}`, Date.now(), Date.now()],
    });
  } catch { /* pencatatan tidak boleh menjatuhkan aksi */ }
  try { invalidateLive(); } catch {}
  try { invalidateDataCache(); } catch {}
}

// GET /api/admin/manual-order?id=N
// Ambil DETAIL satu order manual - termasuk GAMBAR BUKTI TRANSFER (base64).
//
// KENAPA TERPISAH (permintaan pemilik 2026-10-04: "optimalkan jangan ada yang
// bocor"): daftar order di /api/admin/data dulu mengirim receiptBase64 apa
// adanya -> 519 KB per poll (tiap 5 detik!) padahal 99% waktu admin tidak
// membuka gambarnya. Sekarang daftar hanya membawa metadata kecil, dan gambar
// diambil lewat endpoint INI saat admin benar-benar klik "Lihat Bukti".
export async function GET(request) {
  const admin = await getAdminSession();
  const session = await getSession();
  let authorized = Boolean(admin);
  if (!authorized && session) {
    const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    authorized = adminIds.includes(session.discordId);
  }
  if (!authorized) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return NextResponse.json({ ok: false, error: 'id wajib.' }, { status: 400 });

  await schemaReady();
  const db = getDb();
  const r = await db.execute({
    sql: 'SELECT gateway_ref FROM orders WHERE id = ? LIMIT 1',
    args: [id],
  }).catch(() => ({ rows: [] }));
  if (!r.rows.length) return NextResponse.json({ ok: false, error: 'Order tidak ditemukan.' }, { status: 404 });

  let ref = null;
  try { ref = JSON.parse(r.rows[0].gateway_ref || 'null'); } catch { ref = null; }
  return NextResponse.json({
    ok: true,
    id,
    senderName: ref?.senderName || null,
    receiptBase64: ref?.receiptBase64 || null,
  });
}

export async function POST(request) {
  const admin = await getAdminSession();
  const session = await getSession();
  
  let authorized = Boolean(admin);
  if (!authorized && session) {
    const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    authorized = adminIds.includes(session.discordId);
  }
  if (!authorized) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  
  const { orderId, action } = body;
  if (!orderId || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'Invalid parameters' }, { status: 400 });
  }

  await schemaReady();
  const db = getDb();
  
  const orderRes = await db.execute({
    sql: "SELECT discord_id, status, gateway_ref FROM orders WHERE id = ? AND gateway = 'manual'",
    args: [Number(orderId)],
  });

  if (!orderRes.rows.length) {
    return NextResponse.json({ ok: false, error: 'Order not found' }, { status: 404 });
  }
  
  const order = orderRes.rows[0];
  if (order.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'Order sudah diproses sebelumnya.' }, { status: 400 });
  }

  // DURASI dari order (permintaan pemilik 2026-10-08): pembeli memilih 1-12
  // bulan saat checkout; approve memberi masa aktif sesuai pilihan itu.
  // Order lama (sebelum fitur durasi) tidak punya field months -> default
  // PLAN_DAYS (30 hari) supaya perilaku lama tetap sama.
  let durasiHari = PLAN_DAYS;
  let durasiBulan = 1;
  try {
    const ref = JSON.parse(order.gateway_ref || 'null');
    if (ref && typeof ref === 'object') {
      if (Number.isFinite(Number(ref.days)) && Number(ref.days) > 0) {
        durasiHari = Math.floor(Number(ref.days));
        durasiBulan = Math.max(1, Math.round(durasiHari / 30));
      } else if (ref.months != null) {
        durasiBulan = normalBulan(ref.months);
        durasiHari = bulanKeHari(durasiBulan);
      }
    }
  } catch { /* pakai default */ }

  const now = Date.now();
  if (action === 'approve') {
    const flip = await db.execute({
      sql: "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'",
      args: [now, Number(orderId)],
    });
    
    if (flip.rowsAffected > 0 && order.discord_id) {
      await db.execute({
        sql: "INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES ('grant_premium', ?, 'admin_manual', 'pending', ?)",
        args: [JSON.stringify({ userId: order.discord_id, tier: 'pro', days: durasiHari }), now],
      });
      // Ping instan ke bot (LISTEN/NOTIFY).
      notifyQueue(['grant_premium']).catch(() => {});
      await db.execute({
        sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
        args: [order.discord_id, now],
      });
      // Notifikasi web untuk user: pembayaran diterima (durasi sesuai order).
      await sisipNotif({ userId: order.discord_id, type: 'event', title: `Pembayaran Order #${orderId} Diterima`, body: `Bukti transfer kamu sudah kami verifikasi. NEXO Pass ${durasiBulan} bulan (${durasiHari} hari) kini AKTIF di akun Discord-mu. Terima kasih sudah mendukung NEXO Games!`, db }).catch(() => {});
      // NOTIF ADMIN (permintaan pemilik 2026-10-06): pembelian NEXO Pass masuk
      // ke notif panel + push perangkat admin.
      try {
        const { sisipNotifAdmin } = await import('../../../lib/adminNotif');
        await sisipNotifAdmin({
          tipe: 'premium',
          judul: '💎 Pembelian NEXO Pass (Manual)',
          isi: `Order #${orderId} disetujui. NEXO Pass ${durasiBulan} bulan (${durasiHari} hari) aktif untuk ${order.discord_id}.`,
          url: '/admin#dashboard',
          db,
        });
      } catch { /* opsional */ }
    }
  } else {
    // reject
    const flip = await db.execute({
      sql: "UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending'",
      args: [Number(orderId)],
    });
    if (flip.rowsAffected > 0 && order.discord_id) {
      // Notifikasi web untuk user: pesanan ditolak
      await sisipNotif({ userId: order.discord_id, type: 'info', title: `Pesanan Order #${orderId} Ditolak`, body: 'Bukti transfer kamu tidak dapat kami verifikasi (nominal/nama tidak cocok atau gambar tidak jelas). Jika kamu sudah membayar, hubungi admin di Discord dengan menyebutkan Order ID. Kamu boleh membuat pesanan baru dengan bukti yang benar.', db }).catch(() => {});
    }
  }

  await touchActivity().catch(() => {});
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/manual-order { orderId } -> hapus SATU riwayat order QRIS;
// { all: true } -> hapus SEMUA riwayat order manual. Sekalian tarik DM admin
// yang masih ngantre utk order itu biar tidak nyasar.
export async function DELETE(request) {
  const admin = await getAdminSession();
  const session = await getSession();

  let authorized = Boolean(admin);
  if (!authorized && session) {
    const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    authorized = adminIds.includes(session.discordId);
  }
  if (!authorized) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  let body;
  try { body = await request.json(); } catch { body = null; }
  const all = body?.all === true;
  const orderId = Number(body?.orderId);

  await schemaReady();
  const db = getDb();
  const actor = admin ? `admin:${admin.adminUsername}` : (session?.discordId || 'unknown');

  if (all) {
    // Hanya riwayat selesai. Pesanan pending TIDAK ikut kehapus.
    const res = await db.execute({ sql: "DELETE FROM orders WHERE gateway = 'manual' AND status != 'pending'" });
    await touchActivity().catch(() => {});
    await catatHapusOrder(actor, `SEMUA riwayat (${res.rowsAffected || 0} order)`);
    return NextResponse.json({ ok: true, deleted: Number(res.rowsAffected || 0) });
  }

  if (!Number.isFinite(orderId) || orderId <= 0) {
    return NextResponse.json({ ok: false, error: 'orderId tidak valid.' }, { status: 400 });
  }
  const res = await db.execute({
    sql: "DELETE FROM orders WHERE id = ? AND gateway = 'manual'",
    args: [orderId],
  });
  if (res.rowsAffected === 0) {
    return NextResponse.json({ ok: false, error: 'Order tidak ditemukan.' }, { status: 404 });
  }
  await catatHapusOrder(actor, `order #${orderId}`);
  return NextResponse.json({ ok: true, deleted: 1 });
}

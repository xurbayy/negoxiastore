import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { getBotHeartbeat } from '../../../lib/snapshot';

export const dynamic = 'force-dynamic';

// POST /api/payment/manual - FLOW LAMA (QRIS manual + upload bukti) DIMATIKAN
// ============================================================================
// Sejak 2026-10-12 pembelian NEXO Pass memakai payment gateway Duitku
// (/api/payment/duitku/create) - pembayaran otomatis, aktif instan via
// webhook, tanpa approve admin. Endpoint ini ditutup supaya tidak ada dua
// jalur pembayaran yang membingungkan.
//
// GET (di bawah) TETAP AKTIF: dipakai PremiumClient untuk cek status order
// terakhir (berlaku untuk order Duitku juga - query by discord_id, bukan
// gateway). Riwayat order manual lama juga masih tampil di panel admin.
export async function POST() {
  return NextResponse.json({
    ok: false,
    error: 'Pembelian via QRIS manual sudah tidak tersedia. Silakan beli lewat halaman Premium (pembayaran otomatis Duitku).',
  }, { status: 410 });
}
// GET /api/payment/manual - Cek status order
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });

  await schemaReady();
  const db = getDb();
  const res = await db.execute({
    sql: 'SELECT id, discord_id, plan, amount, status, gateway_ref, created_at, paid_at FROM orders WHERE discord_id = ? ORDER BY created_at DESC LIMIT 1',
    args: [session.discordId],
  });
  
  // BOT ONLINE (2026-10-03): dari HEARTBEAT DB (bridge_meta.last_seen, ditulis
  // bot tiap poll) - bukan snapshot push. Snapshot bisa basi padahal bot
  // sehat, dan sebaliknya - heartbeat lebih akurat.
  const heartbeat = await getBotHeartbeat();
  const botOnline = Boolean(heartbeat && Date.now() - heartbeat <= 3 * 60 * 1000);
  if (!res.rows.length) return NextResponse.json({ ok: true, order: null, botOnline });

  let row = res.rows[0];

  // Auto-expire order manual yang nyangkut > 24 jam belum diapprove admin
  const age = Date.now() - Number(row.created_at);
  if (row.status === 'pending' && age > 24 * 60 * 60 * 1000) {
    await db.execute({
      sql: "UPDATE orders SET status = 'expired' WHERE id = ?",
      args: [Number(row.id)],
    });
    row.status = 'expired';
  }

  return NextResponse.json({
    ok: true,
    botOnline,
    order: {
      id: Number(row.id),
      plan: row.plan,
      amount: Number(row.amount),
      status: row.status,
      createdAt: Number(row.created_at),
      paidAt: row.paid_at ? Number(row.paid_at) : null,
    },
  });
}

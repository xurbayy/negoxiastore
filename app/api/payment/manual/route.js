import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { getDb, schemaReady } from '../../../lib/db';
import { getLatestSnapshot, userHasPremium } from '../../../lib/snapshot';
import { touchActivity } from '../../../lib/activity';
import { rateLimitGlobal } from '../../../lib/rate-limit';

export const dynamic = 'force-dynamic';
const PRICE = 20000;

// POST /api/payment/manual - Submit bukti transfer manual
export async function POST(request) {
  // Jaring anti-DDoS: endpoint ini menerima upload gambar base64 (sampai ~1MB),
  // jadi paling berat. Batasi total request lintas IP (kiriman sah sangat jarang,
  // satu user hanya sekali bayar). Ini TIDAK mengganggu pemakaian normal.
  if (!rateLimitGlobal('payment-manual', 60, 60_000)) {
    return NextResponse.json({ ok: false, error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, { status: 429 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { senderName, receiptBase64, receiptName } = body;
  if (!senderName || senderName.length < 3 || senderName.length > 50) {
    return NextResponse.json({ ok: false, error: 'Nama pengirim harus diisi (3-50 karakter).' }, { status: 400 });
  }
  if (!receiptBase64 || !receiptBase64.startsWith('data:image/')) {
    return NextResponse.json({ ok: false, error: 'Bukti transfer (gambar) harus dilampirkan.' }, { status: 400 });
  }

  // Maksimal ~1MB base64
  if (receiptBase64.length > 1.5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'Ukuran gambar terlalu besar. Maksimal 1MB.' }, { status: 400 });
  }

  await schemaReady();
  const db = getDb();

  // Bot status check removed so users can still submit manual orders
  // The commands will queue up in bot_commands and be processed when the bot is back online

  const isPremium = await userHasPremium(session.discordId);
  // Satu pembelian per bulan: yang masih premium tidak bisa beli lagi
  // (tombol bayar baru muncul setelah pass dilepas admin / jatuh tempo).
  if (isPremium) {
    return NextResponse.json({ ok: false, error: 'premium_active' }, { status: 409 });
  }

  // Cek antrean: tidak boleh numpuk pesanan pending
  const pendingRow = await db.execute({
    sql: "SELECT id FROM orders WHERE discord_id = ? AND status = 'pending' LIMIT 1",
    args: [session.discordId],
  });
  if (pendingRow.rows.length) {
    return NextResponse.json({ ok: false, error: 'Kamu masih punya pesanan yang sedang diproses admin. Harap tunggu.' }, { status: 429 });
  }

  const created = Date.now();
  // Simpan JSON ke gateway_ref
  const safeReceiptName = String(receiptName || 'bukti-transfer.png').replace(/[^\w.\-]+/g, '_').slice(0, 60);
  const gatewayRef = JSON.stringify({ senderName, receiptBase64, receiptName: safeReceiptName });

  const res = await db.execute({
    sql: "INSERT INTO orders (discord_id, plan, amount, gateway, status, gateway_ref, created_at) VALUES (?, 'NEXOPASS', ?, 'manual', 'pending', ?, ?)",
    args: [session.discordId, PRICE, gatewayRef, created],
  });

  const orderId = Number(res.lastInsertRowid);

  // Kirim command ke bot untuk DM admin (termasuk lampiran bukti transfer)
  const dmMsg = `Ada pembayaran NEXOPASS baru! (Order #${orderId})\nUser: <@${session.discordId}> (ID: ${session.discordId})\nPengirim: **${senderName}**\n\nSegera cek dan setujui di Admin Panel Web!`;
  await db.execute({
    sql: "INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES ('dm_admin', ?, 'web', 'pending', ?)",
    args: [JSON.stringify({ adminId: '836383639439671366', message: dmMsg, fileName: safeReceiptName, fileBase64: receiptBase64 }), created],
  });

  await touchActivity();
  return NextResponse.json({ ok: true });
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
  
  const liveSnap = await getLatestSnapshot();
  const botOnline = Boolean(liveSnap && Date.now() - Number(liveSnap.ts) <= 3 * 60 * 1000);
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

#!/usr/bin/env node
/**
 * TEST PEMBAYARAN END-TO-END (localhost) - mensimulasikan Midtrans selayaknya
 * production: buat order pending -> kirim webhook settlement dgn signature
 * ASLI (sha512 pakai Server Key) -> cek order jadi 'paid', grant_premium masuk
 * antrean, bot/dev-feed eksekusi -> profil premium aktif.
 *
 *   node scripts/test-payment.js                 <- pakai 2 akun di DB web
 *   node scripts/test-payment.js 1013317356103159869
 *
 * Catatan: order #3 lama tidak dibayar beneran (404 di Midtrans), jadi kita
 * buat order baru + settlement lewat jalur webhook yang sama persis seperti
 * Midtrans asli - inilah yang akan diuji Vercel nanti.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const WEB = process.env.WEB_URL || 'http://localhost:3457';
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/);
const get = (k) => env.find((l) => l.startsWith(k + '='))?.split('=').slice(1).join('=').trim();
const TURSO_URL = get('TURSO_URL');
const TURSO_TOKEN = get('TURSO_AUTH_TOKEN');
const SERVER_KEY = get('MIDTRANS_SERVER_KEY');

(async () => {
  const discordId = process.argv[2] || '1013317356103159869'; // exyn0_
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  // 1. Order pending baru (persis yang dibuat tombol Beli)
  const created = Date.now();
  const res = await db.execute({
    sql: "INSERT INTO orders (discord_id, plan, amount, gateway, status, created_at) VALUES (?, 'nexo_pass_monthly', 20000, 'midtrans', 'pending', ?)",
    args: [discordId, created],
  });
  const orderId = `NEXO-${Number(res.lastInsertRowid)}-${created}`;
  console.log('[TEST] order dibuat:', orderId);

  // 2. Webhook settlement dengan signature ASLI (sama seperti Midtrans kirim)
  const statusCode = '200';
  const gross = '20000';
  const signature = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${gross}${SERVER_KEY}`)
    .digest('hex');
  const whRes = await fetch(`${WEB}/api/payment/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      status_code: statusCode,
      gross_amount: gross,
      signature_key: signature,
      transaction_status: 'settlement',
      fraud_status: 'accept',
      transaction_id: crypto.randomUUID(),
    }),
  });
  const whJson = await whRes.json().catch(() => ({}));
  console.log('[TEST] webhook ->', whRes.status, JSON.stringify(whJson));
  if (whJson.deferred) {
    console.log('[TEST] bot offline: jalankan dulu `node scratch/web-dev-feed.js --loop` di repo bot, lalu ulangi.');
    process.exit(1);
  }

  // 3. Verifikasi DB: paid + antrean grant_premium
  await new Promise((r) => setTimeout(r, 800));
  const o = await db.execute({
    sql: 'SELECT status, paid_at FROM orders WHERE id = (SELECT MAX(id) FROM orders WHERE discord_id = ?)',
    args: [discordId],
  });
  console.log('[TEST] order status:', JSON.stringify(o.rows[0]));
  const q = await db.execute({
    sql: "SELECT id, action, status FROM bot_commands WHERE action = 'grant_premium' AND payload LIKE ? ORDER BY id DESC LIMIT 1",
    args: [`%${discordId}%`],
  });
  console.log('[TEST] antrean bot:', q.rows.length ? JSON.stringify(q.rows[0]) : 'belum ada?!');

  console.log(`[TEST] OK. Tunggu dev-feed poll (<=15 detik) lalu buka ${WEB}/me - premium ${discordId === '1013317356103159869' ? 'exyn0_' : 'akun itu'} harus muncul.`);
  process.exit(0);
})().catch((e) => {
  console.error('[TEST] gagal:', e.message);
  process.exit(1);
});

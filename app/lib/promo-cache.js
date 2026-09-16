// Sistem stok cerdas anti-over-claim (web-prompt v4 bagian /api/redeem).
// web_promo_cache: web menghitung sisa stok REAL-TIME sendiri + reservasi atomik,
// bot tetap validasi final. Tidak pernah mempersilakan user mencoba stok habis.
import { getDb, schemaReady } from './db';

// Panggil tiap snapshot bot masuk (POST /api/bot/stats).
// reserved = MAX(klaim-web-aktif, claimed_bot) supaya klaim via Discord ikut
// terhitung TANPA dihitung dua kali.
// exhausted SELALU dihitung ulang dari angka snapshot bot (claimed >= quota):
// flag tidak boleh sticky. Dulu exhausted yang sudah 1 tidak pernah kembali 0
// walau bot mengirim data baru bahwa kuota masih sisa -> kode hidup tampil
// "HABIS" di panel dan ditolak /api/redeem (bug 2026-09-14). Bila bot memang
// kehabisan stok, snapshot berikutnya tetap claimed >= quota -> flag menyala
// lagi sendiri, jadi tidak ada risiko over-claim (bot tetap validator final).
export async function syncPromoCache(db, promoCodes) {
  const codes = Array.isArray(promoCodes) ? promoCodes : [];
  const now = Date.now();
  const seen = [];

  for (const p of codes) {
    const code = String(p.code || '').toUpperCase().trim();
    if (!code) continue;
    seen.push(code);
    const quota = Number(p.quota) || 0;
    const claimed = Number(p.claimed) || 0;

    // === RESET KLAIM LAMA DARI INKARNASI LAMA KODE (2026-09-16) ===
    // Bot: admin hapus kode -> promo_claims bot IKUT terhapus -> user bisa
    // claim lagi di Discord. Web: riwayat web_redeem_claims tidak pernah ikut
    // dihapus, jadi setelah kode dibuat ulang user yang sama DITOLAK dengan
    // "Kamu sudah klaim kode ini" padahal di Discord bisa. Tidak sinkron.
    //
    // Sinyal: promo_codes.created_at bot di-update saat kode dibuat ulang
    // (INSERT OR REPLACE). Klaim web dengan claimed_at SEBELUM waktu pembuatan
    // inkarnasi ini = peninggalan kode versi lama -> dihapus. Klaim yang lebih
    // baru dari inkarnasi aktif TIDAK tersentuh (termasuk yang masih pending),
    // jadi tidak ada risiko double-claim: bot tetap validator final.
    // Untuk kode yang tidak pernah dibuat ulang, created_at lama -> DELETE
    // selalu no-op.
    const createdMs = Number(p.createdAtMs) || 0;
    if (createdMs > 0) {
      await db.execute({
        sql: 'DELETE FROM web_redeem_claims WHERE code = ? AND claimed_at < ?',
        args: [code, createdMs],
      });
    }

    // reserved dihitung ulang dari klaim web AKTIF (sisa setelah reset di atas),
    // digabung dengan angka bot (klaim via Discord). Ini menggantikan curReserved
    // lama yang bisa tertinggal dari inkarnasi kode sebelumnya.
    const cnt = await db.execute({
      sql: "SELECT COUNT(*) c FROM web_redeem_claims WHERE code = ? AND status != 'failed'",
      args: [code],
    });
    const reservedWeb = Number(cnt.rows[0]?.c || 0);
    const reserved = Math.max(reservedWeb, Math.min(claimed, Math.max(quota, 0)));
    const exhausted = quota > 0 && claimed >= quota ? 1 : 0;

    const cur = await db.execute({
      sql: 'SELECT reserved FROM web_promo_cache WHERE code = ?',
      args: [code],
    });

    if (cur.rows.length) {
      await db.execute({
        sql: `UPDATE web_promo_cache
              SET rewardType = ?, rewardValue = ?, quota = ?, reserved = ?, exhausted = ?, updated_at = ?
              WHERE code = ?`,
        args: [String(p.rewardType || 'points'), String(p.rewardValue ?? ''), quota, reserved, exhausted, now, code],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO web_promo_cache (code, rewardType, rewardValue, quota, reserved, exhausted, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [code, String(p.rewardType || 'points'), String(p.rewardValue ?? ''), quota, reserved, exhausted, now],
      });
    }
  }

  // Kode yang hilang dari daftar bot = dihapus admin -> tandai habis.
  const cur = await db.execute('SELECT code FROM web_promo_cache WHERE exhausted = 0');
  for (const r of cur.rows) {
    if (!seen.includes(String(r.code))) {
      await db.execute({
        sql: 'UPDATE web_promo_cache SET exhausted = 1, updated_at = ? WHERE code = ?',
        args: [now, String(r.code)],
      });
    }
  }
}

// Reservasi atomik SATU slot. true = jatah user terkunci; false = stok habis.
export async function reserveSlot(db, code) {
  const res = await db.execute({
    sql: 'UPDATE web_promo_cache SET reserved = reserved + 1 WHERE code = ? AND exhausted = 0 AND reserved < quota',
    args: [code],
  });
  return res.rowsAffected > 0;
}

export async function releaseSlot(db, code) {
  await db.execute({
    sql: 'UPDATE web_promo_cache SET reserved = MAX(0, reserved - 1) WHERE code = ?',
    args: [code],
  });
}

export async function markExhausted(db, code) {
  await db.execute({
    sql: 'UPDATE web_promo_cache SET exhausted = 1, updated_at = ? WHERE code = ?',
    args: [Date.now(), code],
  });
}

// Klaim 'pending' >5 menit tanpa ack bot -> failed + slot dilepas.
export async function sweepStaleClaims(db, staleMs = 5 * 60 * 1000) {
  const cutoff = Date.now() - staleMs;
  const stale = await db.execute({
    sql: "SELECT discord_id, code FROM web_redeem_claims WHERE status = 'pending' AND claimed_at < ?",
    args: [cutoff],
  });
  for (const r of stale.rows) {
    await db.execute({
      sql: "UPDATE web_redeem_claims SET status = 'failed', fail_reason = 'timeout - bot tidak merespons' WHERE discord_id = ? AND code = ?",
      args: [String(r.discord_id), String(r.code)],
    });
    await releaseSlot(db, String(r.code).toUpperCase());
  }
  return stale.rows.length;
}

export async function getPromoCache() {
  await schemaReady();
  const db = getDb();
  await sweepStaleClaims(db).catch(() => {});
  const res = await db.execute(
    'SELECT code, rewardType, rewardValue, quota, reserved, exhausted FROM web_promo_cache ORDER BY updated_at DESC'
  );
  return res.rows.map((r) => ({
    code: String(r.code),
    rewardType: String(r.rewardType || 'points'),
    rewardValue: String(r.rewardValue ?? ''),
    quota: Number(r.quota),
    reserved: Number(r.reserved),
    exhausted: Number(r.exhausted) === 1,
    remaining: Math.max(0, Number(r.quota) - Number(r.reserved)),
  }));
}

export const GONE_MSG = 'Kode ini sudah habis atau berakhir.';
export const STOLEN_MSG = 'Kuota kode ini sudah habis.';

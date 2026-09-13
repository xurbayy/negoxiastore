import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { getDb } from '../../../lib/db';
import { releaseSlot, markExhausted } from '../../../lib/promo-cache';
import { touchActivity } from '../../../lib/activity';

export const dynamic = 'force-dynamic';

// POST /api/bot/ack - bot laporkan hasil eksekusi commands + dataRequests.
export async function POST(request) {
  const denied = verifyBearer(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400);
  }
  const results = Array.isArray(body?.results) ? body.results : [];

  await ready();
  const db = getDb();

  for (const r of results) {
    const id = Number(r?.id);
    if (!Number.isFinite(id)) continue;
    const status = String(r?.status || 'done');
    const result = r?.result != null ? String(r.result).slice(0, 300) : null;

    if (r && r.data !== undefined) {
      // dataRequest: bot kirim profil user
      await db.execute({
        sql: "UPDATE data_requests SET status = 'done', data = ?, filled_at = ? WHERE id = ?",
        args: [JSON.stringify(r.data), Date.now(), id],
      });
    } else {
      await db.execute({
        sql: 'UPDATE bot_commands SET status = ?, result = ?, executed_at = ? WHERE id = ?',
        args: [status, result, Date.now(), id],
      });
      const cmdInfo = await db.execute({
        sql: 'SELECT action, payload FROM bot_commands WHERE id = ?',
        args: [id],
      });
      const row0 = cmdInfo.rows[0];
      // Sinkron klaim redeem web <-> cache stok (aturan ack v4)
      if (row0 && row0.action === 'redeem_promo_web') {
        try {
          const p = JSON.parse(row0.payload || '{}');
          const code = String(p.code || '').toUpperCase();
          const userId = String(p.userId || '');
          if (code && userId) {
            if (status === 'done') {
              // delivered - slot tetap terhitung (reserved sudah +1 saat klaim).
              await db.execute({
                sql: "UPDATE web_redeem_claims SET status = 'delivered', fail_reason = NULL WHERE discord_id = ? AND code = ?",
                args: [userId, code],
              });
              // ACK LIVE: profil user ikut disegarkan tanpa nunggu user refresh.
              await db.execute({
                sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
                args: [userId, Date.now()],
              });
            } else if (status === 'failed') {
              const reason = String(result || '').toLowerCase();
              // HANYA indikasi stok yang mematikan kode. "sudah menukarkan" itu
              // tolak-PER-USER (klaim via Discord nxpromo) -> jangan matikan
              // kode buat semua orang; slotnya dilepas, syncPromoCachesnapshot
              // nanti yang koreksi reserved dari claimed_count bot.
              const habis = reason.includes('stok habis') || reason.includes('kuota');
              if (reason.includes('sudah menukarkan')) {
                // User ini TERNYATA sudah redeem via Discord (nxpromo) ->
                // klaim web dianggap terpenuhi: cegah loop retry + slot tetap
                // terhitung (claimed_count bot sudah memasukkan dia).
                await db.execute({
                  sql: "UPDATE web_redeem_claims SET status = 'delivered', fail_reason = 'sudah klaim via Discord' WHERE discord_id = ? AND code = ?",
                  args: [userId, code],
                });
              } else if (habis) {
                // bot yang benar: stoknya memang habis -> exhausted, claim dihapus
                await markExhausted(db, code);
                await db.execute({
                  sql: 'DELETE FROM web_redeem_claims WHERE discord_id = ? AND code = ?',
                  args: [userId, code],
                });
              } else {
                // alasan lain: user boleh coba lagi -> failed + slot dilepas
                await db.execute({
                  sql: "UPDATE web_redeem_claims SET status = 'failed', fail_reason = ? WHERE discord_id = ? AND code = ?",
                  args: [String(result || 'gagal'), userId, code],
                });
                await releaseSlot(db, code);
              }
            }
          }
        } catch {}
      }
      // grant/revoke premium ack: segarkan profil user tsb (ACK LIVE)
      if (status === 'done' && row0 && (row0.action === 'grant_premium' || row0.action === 'revoke_premium')) {
        try {
          const p = JSON.parse(row0.payload || '{}');
          if (p.userId) {
            await db.execute({
              sql: "INSERT INTO data_requests (discord_id, status, created_at) VALUES (?, 'pending', ?)",
              args: [String(p.userId), Date.now()],
            });
          }
        } catch {}
      }
    }
  }

  if (results.some((r) => r && r.data === undefined)) await touchActivity();
  return json({ ok: true, updated: results.length });
}

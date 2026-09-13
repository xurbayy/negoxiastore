import { verifyBearer, json, ready } from '../../../lib/api-helpers';
import { hasRecentActivity } from '../../../lib/activity';
import { getDb } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// GET /api/bot/queue - bot tarik antrean tiap 15 detik.
// Status TIDAK diubah di sini (idempotent untuk retry); status diubah di ack.
export async function GET(request) {
  const denied = verifyBearer(request);
  if (denied) return denied;

  await ready();
  const db = getDb();

  // URGENSI: duit user sudah masuk (grant_premium) atau klaim redeem antre
  // -> tarik duluan + suruh bot poll 1 detik. Player tidak boleh panik.
  const commands = await db.execute(
    "SELECT id, action, payload, actor_id FROM bot_commands WHERE status = 'pending' ORDER BY CASE WHEN action IN ('grant_premium', 'redeem_promo_web') THEN 0 ELSE 1 END, created_at ASC LIMIT 50"
  );
  const dataRequests = await db.execute(
    "SELECT id, discord_id FROM data_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 20"
  );

  const hasUrgent = commands.rows.some((r) => r.action === 'grant_premium' || r.action === 'redeem_promo_web');
  const urgentHint = hasUrgent ? 1000 : (await hasRecentActivity(5000) ? 1000 : undefined);

  return json({
    nextPollMs: urgentHint,
    commands: commands.rows.map((r) => ({
      id: Number(r.id),
      action: r.action,
      payload: safeParse(r.payload, {}),
      actorId: r.actor_id,
    })),
    dataRequests: dataRequests.rows.map((r) => ({
      id: Number(r.id),
      discordId: r.discord_id,
    })),
  });
}

function safeParse(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

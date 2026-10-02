import { getSession, getAdminSession } from '../../../../../lib/session';
import { getDb, schemaReady } from '../../../../../lib/db';
import { json } from '../../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/agen/laporan - hapus laporan agen
// ==========================================
// DELETE ?id=N - hapus satu laporan agen.
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

export async function DELETE(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'id wajib.' }, 400);
  await schemaReady();
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM ai_agen WHERE id = ?', args: [id] });
  await db.execute({ sql: 'DELETE FROM ai_agen_usulan WHERE agen_id = ?', args: [id] });
  return json({ ok: true });
}

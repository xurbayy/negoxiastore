import { getSession, getAdminSession } from '../../../../../lib/session';
import { getDb, schemaReady } from '../../../../../lib/db';
import { json } from '../../../../../lib/api-helpers';
import { OAUTH_PROVIDERS } from '../../../../../lib/aiOAuth';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/oauth/status - daftar provider OAuth + status koneksi
// ==========================================
// GET -> [{ id, label, connected, updatedAt }]
// DELETE ?provider=openrouter -> putuskan koneksi.
async function getAdminId() {
  const admin = await getAdminSession();
  if (admin) return admin.id || admin.discordId || 'admin';
  const session = await getSession();
  if (!session) return null;
  const ids = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.includes(session.discordId)) return null;
  return session.discordId;
}

export async function GET() {
  const adminId = await getAdminId();
  if (!adminId) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  const r = await db.execute({
    sql: 'SELECT provider, updated_at, label FROM ai_oauth WHERE discord_id = ?',
    args: [adminId],
  });
  const terhubung = new Map((r.rows || []).map((x) => [String(x.provider), Number(x.updated_at)]));
  const daftar = Object.entries(OAUTH_PROVIDERS).map(([id, p]) => ({
    id,
    label: p.label,
    connected: terhubung.has(id),
    updatedAt: terhubung.get(id) || null,
  }));
  return json({ ok: true, providers: daftar });
}

export async function DELETE(request) {
  const adminId = await getAdminId();
  if (!adminId) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const provider = (url.searchParams.get('provider') || '').trim().toLowerCase();
  if (!provider) return json({ ok: false, error: 'provider wajib.' }, 400);
  await schemaReady();
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM ai_oauth WHERE discord_id = ? AND provider = ?', args: [adminId, provider] });
  return json({ ok: true });
}

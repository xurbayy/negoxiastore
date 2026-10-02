import { getSession, getAdminSession } from '../../../../../lib/session';
import { getDb, schemaReady } from '../../../../../lib/db';
import { validasiUsulan } from '../../../../../lib/aiAgen';
import { json, ready } from '../../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/agen/usulan - setujui / tolak usulan agen
// ==========================================
//
// PATCH ?id=N { putusan: 'setuju'|'tolak' }
//   setuju -> antrekan aksi ke bot (bot_commands) + tandai 'disetujui'
//   tolak  -> tandai 'ditolak' (tidak ada aksi)
//
// KEPUTUSAN SEPENUHNYA DI TANGAN PEMILIK. Agen hanya mengusulkan.
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

export async function PATCH(request) {
  const admin = await getAdminSession();
  const session = await getSession();
  let actorId = null;
  if (admin) actorId = `admin:${admin.adminUsername}`;
  else if (session && (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(session.discordId)) actorId = session.discordId;
  if (!actorId) return json({ ok: false, error: 'forbidden' }, 403);

  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'id wajib.' }, 400);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const putusan = String(body?.putusan || '').trim();

  await schemaReady();
  const db = getDb();
  const r = await db.execute({ sql: 'SELECT id, judul, aksi, payload, status FROM ai_agen_usulan WHERE id = ? LIMIT 1', args: [id] });
  const row = r.rows?.[0];
  if (!row) return json({ ok: false, error: 'Usulan tidak ditemukan.' }, 404);
  if (row.status !== 'menunggu') return json({ ok: false, error: `Usulan sudah ${row.status}.` }, 400);

  if (putusan === 'tolak') {
    await db.execute({ sql: "UPDATE ai_agen_usulan SET status = 'ditolak', diputus_at = ? WHERE id = ?", args: [Date.now(), id] });
    return json({ ok: true, status: 'ditolak' });
  }

  if (putusan !== 'setuju') return json({ ok: false, error: 'putusan harus setuju/tolak.' }, 400);

  // VALIDASI ULANG (jangan percaya data lama).
  let payload = null;
  try { payload = JSON.parse(row.payload); } catch { payload = null; }
  const v = validasiUsulan({ aksi: row.aksi, payload });
  if (!v.ok) return json({ ok: false, error: v.alasan }, 400);

  // Antrekan ke bot (bot mengeksekusi lewat whitelist-nya sendiri).
  await ready();
  const ins = await db.execute({
    sql: 'INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [row.aksi, JSON.stringify(payload), actorId, 'pending', Date.now()],
  });
  const cmdId = Number(ins.lastInsertRowid ?? 0);
  await db.execute({ sql: "UPDATE ai_agen_usulan SET status = 'disetujui', hasil = ?, diputus_at = ? WHERE id = ?", args: [`Perintah #${cmdId} dikirim ke bot.`, Date.now(), id] });

  return json({ ok: true, status: 'disetujui', commandId: cmdId });
}

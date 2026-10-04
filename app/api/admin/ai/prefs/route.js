import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/prefs - simpan/muat preferensi AI admin
// ==========================================
//
// Permintaan pemilik 2026-10-02: "kenapa logout / pindah device malah reset?
// harusnya kesimpan model terakhir yang gw ulik."
//
// localStorage tidak transfer antar device & bisa hilang saat logout.
// Simpan ke DB (admin_ai_prefs) supaya persist.
//
// GET  -> muat prefs admin yang login
// POST -> simpan prefs { provider, model, mode, peran, maxTokens, kecerdasan }
async function getAdminId() {
  const admin = await getAdminSession();
  if (admin) return admin.id || admin.discordId || 'admin';
  const session = await getSession();
  if (!session) return null;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(session.discordId)) return null;
  return session.discordId;
}

export async function GET() {
  const adminId = await getAdminId();
  if (!adminId) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  const res = await db.execute({
    // updatedAt ikut dikirim (fix 2026-10-04): client perlu tahu KAPAN prefs
    // terakhir berubah untuk sinkronisasi lintas device yang benar. Dulu client
    // membandingkan PANJANG array chat - itu salah: kalau device ini punya chat
    // lebih banyak (dari localStorage lama), update dari device lain TIDAK
    // pernah diterapkan (keluhan: "buka di mobile, di PC ga ada").
    sql: 'SELECT prefs, updated_at FROM admin_ai_prefs WHERE discord_id = ?',
    args: [adminId],
  });
  let prefs = {};
  try { prefs = JSON.parse(res.rows?.[0]?.prefs || '{}'); } catch { prefs = {}; }
  const updatedAt = Number(res.rows?.[0]?.updated_at || 0);
  return json({ ok: true, prefs, updatedAt });
}

export async function POST(request) {
  const adminId = await getAdminId();
  if (!adminId) return json({ ok: false, error: 'forbidden' }, 403);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  await schemaReady();
  const db = getDb();

  // Simpan semua field yang dikirim (merge dengan yang lama).
  const lama = await db.execute({
    sql: 'SELECT prefs FROM admin_ai_prefs WHERE discord_id = ?',
    args: [adminId],
  });
  let prefsLama = {};
  try { prefsLama = JSON.parse(lama.rows?.[0]?.prefs || '{}'); } catch { prefsLama = {}; }

  const prefsBaru = {
    ...prefsLama,
    ...(body?.provider !== undefined ? { provider: String(body.provider).slice(0, 80) } : {}),
    ...(body?.model !== undefined ? { model: String(body.model).slice(0, 160) } : {}),
    ...(body?.mode !== undefined ? { mode: String(body.mode).slice(0, 20) } : {}),
    ...(body?.peran !== undefined ? { peran: String(body.peran).slice(0, 30) } : {}),
    ...(body?.maxTokens !== undefined ? { maxTokens: Number(body.maxTokens) || null } : {}),
    // THINKING LEVEL (2026-10-04): 'kecerdasan 1-10' diganti level teks.
    ...(body?.thinking !== undefined ? { thinking: body.thinking ? String(body.thinking).slice(0, 20) : null } : {}),
    // Kompatibilitas: prefs lama yang masih menyimpan angka 'kecerdasan'
    // diabaikan (tidak lagi dipakai).
    ...(body?.kecerdasan !== undefined ? {} : {}),
    ...(body?.agentProvider !== undefined ? { agentProvider: String(body.agentProvider).slice(0, 80) } : {}),
    ...(body?.agentModel !== undefined ? { agentModel: String(body.agentModel).slice(0, 160) } : {}),
    // Chat diskusi aktif (lintas device).
    ...(body?.chat !== undefined
      ? { chat: Array.isArray(body.chat) ? body.chat.slice(-40) : [] }
      : {}),
    // Laporan analisis aktif (lintas device).
    ...(body?.laporan !== undefined
      ? { laporan: Array.isArray(body.laporan) ? body.laporan.slice(-30) : [] }
      : {}),
  };

  const now = Date.now();
  await db.execute({
    sql: 'INSERT INTO admin_ai_prefs (discord_id, prefs, updated_at) VALUES (?, ?, ?) ON CONFLICT(discord_id) DO UPDATE SET prefs = ?, updated_at = ?',
    args: [adminId, JSON.stringify(prefsBaru), now, JSON.stringify(prefsBaru), now],
  });
  // updatedAt dibalas supaya client bisa memakai waktu ini sebagai patokan
  // sinkronisasi (fix 2026-10-04) - mencegah echo menimpa balik.
  return json({ ok: true, updatedAt: now });
}

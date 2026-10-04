import { getSession, getAdminSession } from '../../../../../lib/session';
import { getDb, schemaReady } from '../../../../../lib/db';
import { validasiUsulan } from '../../../../../lib/aiAgen';
import { json, ready } from '../../../../../lib/api-helpers';
import { notifyQueue } from '../../../../../lib/pgNotifyWeb';

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

  // KHUSUS PENGINGAT: tidak dikirim ke bot - disimpan sebagai pengingat
  // (muncul di notif lonceng + panel Pengingat). Permintaan pemilik 2026-10-02:
  // "agen bisa kirim notif pengingat, ada konfirmasi, kalau gw iya masuk notif".
  if (row.aksi === 'buat_pengingat') {
    const { wibKeEpoch, formatWib } = await import('../../../../../lib/waktuWib');
    const [th, bl, tg] = String(payload.tanggal).split('-').map(Number);
    const [jj, mm] = String(payload.jam || '09:00').split(':').map(Number);
    const waktuIngat = wibKeEpoch(th, bl - 1, tg, jj || 9, mm || 0);
    if (!Number.isFinite(waktuIngat)) return json({ ok: false, error: 'Tanggal pengingat tidak valid.' }, 400);
    const insR = await db.execute({
      sql: 'INSERT INTO ai_reminders (teks, waktu_ingat, selesai, dibuat_at) VALUES (?, ?, 0, ?) RETURNING id',
      args: [String(payload.teks).slice(0, 300), waktuIngat, Date.now()],
    });
    const rid = Number(insR.rows?.[0]?.id ?? insR.lastInsertRowid ?? 0);
    await db.execute({
      sql: "UPDATE ai_agen_usulan SET status = 'disetujui', hasil = ?, diputus_at = ? WHERE id = ?",
      args: [`Pengingat #${rid} dibuat untuk ${formatWib(waktuIngat)}.`, Date.now(), id],
    });
    return json({ ok: true, status: 'disetujui', pengingatId: rid, waktuTeks: formatWib(waktuIngat) });
  }

  // Antrekan ke bot (bot mengeksekusi lewat whitelist-nya sendiri).
  // JALUR LANGSUNG DULU (permintaan pemilik 2026-10-04): aksi yang bisa
  // dieksekusi langsung ke DB dijalankan DI SINI - tidak bergantung bot
  // (dulu gagal "shopItems is not defined" karena bug di sisi bot).
  // Aksi yang butuh Discord (mis. dm_admin) tetap lewat antrean bot.
  const { AKSI_LANGSUNG, jalankanAksiLangsung } = await import('../../../../../lib/aksiAdminLangsung');
  if (AKSI_LANGSUNG.has(row.aksi)) {
    try {
      const hasil = await jalankanAksiLangsung(row.aksi, payload, actorId);
      await db.execute({ sql: "UPDATE ai_agen_usulan SET status = 'disetujui', hasil = ?, diputus_at = ? WHERE id = ?", args: [String(hasil).slice(0, 400), Date.now(), id] });
      return json({ ok: true, status: 'disetujui', langsung: true, hasil });
    } catch (e) {
      const pesan = e?.message || 'Gagal eksekusi langsung.';
      await db.execute({ sql: "UPDATE ai_agen_usulan SET status = 'gagal', hasil = ?, diputus_at = ? WHERE id = ?", args: [pesan.slice(0, 400), Date.now(), id] });
      return json({ ok: false, error: pesan }, e?.status || 400);
    }
  }

  await ready();
  const ins = await db.execute({
    sql: 'INSERT INTO bot_commands (action, payload, actor_id, status, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
    args: [row.aksi, JSON.stringify(payload), actorId, 'pending', Date.now()],
  });
  // Ping instan ke bot (LISTEN/NOTIFY).
  notifyQueue([row.aksi]).catch(() => {});
  const cmdId = Number(ins.rows?.[0]?.id ?? ins.lastInsertRowid ?? 0);
  await db.execute({ sql: "UPDATE ai_agen_usulan SET status = 'disetujui', hasil = ?, diputus_at = ? WHERE id = ?", args: [`Perintah #${cmdId} dikirim ke bot.`, Date.now(), id] });

  return json({ ok: true, status: 'disetujui', commandId: cmdId });
}

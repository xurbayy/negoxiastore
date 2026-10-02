import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/diskusi - sesi diskusi tersimpan
// ==========================================
//
// Permintaan pemilik (2026-10-02): "gw mau diskusi juga bisa gw save, bisa gw
// hapus, jadi bisa lanjutkan diskusi kemarin."
//
// GET    -> daftar diskusi tersimpan (terbaru dulu) + isi pesan
// POST   -> simpan diskusi baru { judul, pesan, model?, provider? }
// PATCH  -> perbarui diskusi ?id=N { judul?, pesan? } (untuk lanjut-simpan)
// DELETE -> hapus ?id=N
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

export async function GET() {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();
  const res = await db.execute('SELECT id, judul, pesan, model, provider, created_at, updated_at FROM ai_diskusi ORDER BY COALESCE(updated_at, created_at) DESC LIMIT 100');
  return json({
    ok: true,
    diskusi: (res.rows || []).map((r) => {
      let pesan = [];
      try { pesan = JSON.parse(r.pesan) || []; } catch { pesan = []; }
      return {
        id: Number(r.id),
        judul: r.judul,
        pesan,
        model: r.model || null,
        provider: r.provider || null,
        createdAt: Number(r.created_at),
        updatedAt: r.updated_at ? Number(r.updated_at) : null,
      };
    }),
  });
}

export async function POST(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const judul = String(body?.judul || '').trim().slice(0, 120) || 'Diskusi tanpa judul';
  const pesan = Array.isArray(body?.pesan) ? body.pesan : [];
  if (!pesan.length) return json({ ok: false, error: 'Percakapan kosong.' }, 400);
  const model = String(body?.model || '').trim().slice(0, 120) || null;
  const provider = String(body?.provider || '').trim().slice(0, 60) || null;

  await schemaReady();
  const db = getDb();
  const res = await db.execute({
    sql: 'INSERT INTO ai_diskusi (judul, pesan, model, provider, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [judul, JSON.stringify(pesan), model, provider, Date.now()],
  });
  return json({ ok: true, id: Number(res.lastInsertRowid ?? 0) });
}

export async function PATCH(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'id wajib.' }, 400);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  const judul = String(body?.judul || '').trim().slice(0, 120);
  const pesan = Array.isArray(body?.pesan) ? body.pesan : null;
  if (!judul && !pesan) return json({ ok: false, error: 'Tidak ada yang diubah.' }, 400);

  await schemaReady();
  const db = getDb();
  const fields = ['updated_at = ?'];
  const args = [Date.now()];
  if (judul) { fields.push('judul = ?'); args.push(judul); }
  if (pesan) { fields.push('pesan = ?'); args.push(JSON.stringify(pesan)); }
  args.push(id);
  await db.execute({ sql: `UPDATE ai_diskusi SET ${fields.join(', ')} WHERE id = ?`, args });
  return json({ ok: true });
}

export async function DELETE(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'id wajib.' }, 400);
  await schemaReady();
  const db = getDb();
  await db.execute({ sql: 'DELETE FROM ai_diskusi WHERE id = ?', args: [id] });
  return json({ ok: true });
}

import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { json } from '../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/notes - arsip jawaban AI
// ==========================================
//
// Permintaan pemilik (2026-10-01): "jawaban AI bisa gw simpan bisa gw hapus
// gitu, jadi bisa aja ada masukkan bagus gw simpan jadi jawabannya selalu ada,
// bisa juga dihapus kalo udah ga relevan".
//
// GET    -> daftar arsip (terbaru dulu)
// POST   -> simpan jawaban baru { pertanyaan, jawaban, judul?, sumber?, model? }
// DELETE -> hapus satu arsip ?id=N
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
  const res = await db.execute(
    'SELECT id, judul, pertanyaan, jawaban, sumber, model, created_at FROM ai_notes ORDER BY created_at DESC LIMIT 200'
  );
  return json({
    ok: true,
    notes: res.rows.map((r) => ({
      id: Number(r.id),
      judul: r.judul,
      pertanyaan: r.pertanyaan,
      jawaban: r.jawaban,
      sumber: r.sumber,
      model: r.model,
      createdAt: Number(r.created_at),
    })),
  });
}

export async function POST(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  let body = null;
  try { body = await request.json(); } catch { body = null; }

  const jawaban = String(body?.jawaban || '').trim();
  if (!jawaban) return json({ ok: false, error: 'Jawaban kosong.' }, 400);
  if (jawaban.length > 60000) return json({ ok: false, error: 'Jawaban terlalu panjang.' }, 400);

  const pertanyaan = String(body?.pertanyaan || '').trim().slice(0, 2000);
  const sumber = String(body?.sumber || 'chat').trim().slice(0, 40);
  const model = String(body?.model || '').trim().slice(0, 80);
  // Judul: pakai yang dikirim; kalau kosong, ambil potongan pertanyaan supaya
  // daftar arsip tetap bisa dibaca (bukan deretan "tanpa judul").
  const judul = (String(body?.judul || '').trim() || pertanyaan || 'Catatan AI')
    .replace(/\s+/g, ' ').slice(0, 120);

  await schemaReady();
  const db = getDb();
  const res = await db.execute({
    sql: 'INSERT INTO ai_notes (judul, pertanyaan, jawaban, sumber, model, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    args: [judul, pertanyaan || null, jawaban, sumber, model || null, Date.now()],
  });
  return json({ ok: true, id: Number(res.rows?.[0]?.id ?? res.lastInsertRowid ?? 0) });
}

export async function DELETE(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const id = Number(new URL(request.url).searchParams.get('id') || 0);
  if (!id) return json({ ok: false, error: 'id wajib diisi.' }, 400);

  await schemaReady();
  const db = getDb();
  const res = await db.execute({ sql: 'DELETE FROM ai_notes WHERE id = ?', args: [id] });
  // Laporkan apa yang sebenarnya terjadi - jangan bilang "berhasil" kalau
  // id-nya tidak ada (admin jadi bingung kenapa catatannya masih tampak).
  const terhapus = Number(res.rowsAffected ?? 0);
  return json({ ok: terhapus > 0, terhapus });
}

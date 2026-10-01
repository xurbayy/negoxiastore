import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { json } from '../../../../lib/api-helpers';
import { wibKeEpoch, cariMomen, formatWib } from '../../../../lib/waktuWib';
import { cariHariLibur } from '../../../../lib/hariLibur';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/reminders - pengingat dari AI
// ==========================================
//
// Permintaan pemilik (2026-10-01): "gw mau ni AI juga pintar bisa jadi
// pengingat buat gw... kalo gw suruh ingetin gw nanti pas Halloween soalnya
// gw mau masang promo, nah dia bisa ingat".
//
// GET    -> daftar pengingat (belum selesai dulu, lalu yang sudah)
// POST   -> simpan pengingat { teks, waktu_ingat? , momen? }
// PATCH  -> tandai selesai ?id=N  (atau batalkan selesai ?id=N&selesai=0)
// DELETE -> hapus ?id=N
//
// SEMUA waktu memakai WIB (Asia/Jakarta). Server Vercel berjalan di UTC,
// jadi konversinya lewat lib/waktuWib.js.
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
  // Belum selesai dulu (urut waktu terdekat), baru yang sudah selesai.
  const res = await db.execute(
    `SELECT id, teks, waktu_ingat, selesai, dibuat_at, selesai_at
     FROM ai_reminders
     ORDER BY selesai ASC, waktu_ingat ASC
     LIMIT 200`
  );
  return json({
    ok: true,
    reminders: res.rows.map((r) => ({
      id: Number(r.id),
      teks: r.teks,
      waktuIngat: Number(r.waktu_ingat),
      waktuTeks: formatWib(Number(r.waktu_ingat)),
      selesai: Number(r.selesai) === 1,
      dibuatAt: Number(r.dibuat_at),
      selesaiAt: r.selesai_at ? Number(r.selesai_at) : null,
      // Penanda siap dipakai UI: sudah waktunya & belum ditandai selesai.
      jatuhTempo: Number(r.selesai) !== 1 && Number(r.waktu_ingat) <= Date.now(),
    })),
  });
}

export async function POST(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  let body = null;
  try { body = await request.json(); } catch { body = null; }

  const teks = String(body?.teks || '').trim().slice(0, 500);
  if (!teks) return json({ ok: false, error: 'Teks pengingat kosong.' }, 400);

  let waktuIngat = Number(body?.waktuIngat || 0);

  // Kalau tidak ada waktu eksplisit, coba tebak dari nama momen
  // ("pas Halloween", "waktu Natal"). Ini yang membuat AI tidak perlu
  // menghitung tanggal sendiri - sering salah, terutama untuk tahun depan.
  if (!waktuIngat) {
    const momen = cariMomen(teks);
    if (momen) waktuIngat = momen.epoch;
  }

  // Lalu cek hari libur Indonesia dari Google Calendar (permintaan pemilik
  // 2026-10-01) - menangkap libur Hijriah & Imlek, mis. "ingetin gw pas
  // Idul Fitri" atau "waktu Nyepi".
  if (!waktuIngat) {
    try {
      const libur = await cariHariLibur(teks);
      if (libur) {
        const [th, bl, tg] = libur.tanggal.split('-').map(Number);
        waktuIngat = wibKeEpoch(th, bl - 1, tg, 9, 0);
      }
    } catch (_) { /* gagal ambil libur -> lanjut ke default */ }
  }

  // Kalau tetap tidak ada, default H+1 jam dari sekarang supaya pengingatnya
  // tetap tersimpan (pemilik bisa ubah/hapus nanti) - bukan ditolak.
  if (!waktuIngat || !Number.isFinite(waktuIngat)) {
    waktuIngat = Date.now() + 60 * 60 * 1000;
  }

  await schemaReady();
  const db = getDb();
  const res = await db.execute({
    sql: 'INSERT INTO ai_reminders (teks, waktu_ingat, selesai, dibuat_at) VALUES (?, ?, 0, ?)',
    args: [teks, waktuIngat, Date.now()],
  });
  return json({
    ok: true,
    id: Number(res.lastInsertRowid ?? 0),
    waktuIngat,
    waktuTeks: formatWib(waktuIngat),
  });
}

export async function PATCH(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id') || 0);
  if (!id) return json({ ok: false, error: 'id wajib diisi.' }, 400);
  // selesai=0 -> batalkan tanda selesai (salah klik bisa dibatalkan).
  const selesai = url.searchParams.get('selesai') === '0' ? 0 : 1;

  await schemaReady();
  const db = getDb();
  const res = await db.execute({
    sql: 'UPDATE ai_reminders SET selesai = ?, selesai_at = ? WHERE id = ?',
    args: [selesai, selesai ? Date.now() : null, id],
  });
  const diubah = Number(res.rowsAffected ?? 0);
  return json({ ok: diubah > 0, diubah });
}

export async function DELETE(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const id = Number(new URL(request.url).searchParams.get('id') || 0);
  if (!id) return json({ ok: false, error: 'id wajib diisi.' }, 400);

  await schemaReady();
  const db = getDb();
  const res = await db.execute({ sql: 'DELETE FROM ai_reminders WHERE id = ?', args: [id] });
  const terhapus = Number(res.rowsAffected ?? 0);
  return json({ ok: terhapus > 0, terhapus });
}

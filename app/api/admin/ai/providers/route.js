import { getSession, getAdminSession } from '../../../../lib/session';
import { getDb, schemaReady } from '../../../../lib/db';
import { json } from '../../../../lib/api-helpers';
import { NextResponse } from 'next/server';
import { enkripsiKunci, dekripsiKunci, samarkanKunci } from '../../../../lib/aiCrypto';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/providers - kelola provider AI kustom & model tersimpan
// ==========================================
//
// Permintaan pemilik (2026-10-02): "gw mau bisa nambah provider, nanti gw bisa
// masukkin api nama provider dan url basenya, kemudian bisa hapus provider dan
// model juga. Model yang gw masukkin gw mau bisa tersimpan - disimpan, dihapus,
// atau di-edit."
//
// GET    -> daftar provider kustom (key tersamar) + model tersimpan
// POST   -> tambah provider { nama, base_url, api_key?, env_key? }
//           ATAU tambah model { label, model, provider }
// PATCH  -> edit provider ?id=N  { nama?, base_url?, api_key?, env_key? }
//           ATAU edit model    ?id=N  { label?, model?, provider? }
// DELETE -> hapus provider ?id=N  ATAU  hapus model ?id=N&tipe=model
//
// API key TIDAK PERNAH dikembalikan dalam bentuk asli - hanya tersamar.
async function izinkan() {
  const admin = await getAdminSession();
  if (admin) return true;
  const session = await getSession();
  if (!session) return false;
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return adminIds.includes(session.discordId);
}

/** Slug dari nama: huruf kecil, spasi/karakter aneh -> '-'. */
function buatSlug(nama) {
  return String(nama || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'provider';
}

/** Angka opsional dengan batas; kosong/null -> null. */
function angkaOpsional(v, min, max) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function GET(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  await schemaReady();
  const db = getDb();

  // Mode REVEAL: kembalikan kunci ASLI satu provider (permintaan pemilik
  // 2026-10-02: "api key bisa diliat - ada toggle lihat & sembunyikan").
  // Hanya SATU kunci per permintaan, tetap butuh sesi admin, dan tidak
  // di-cache - supaya tidak ada endpoint yang membocorkan semua kunci sekaligus.
  const url = new URL(request.url);
  const revealId = Number(url.searchParams.get('reveal'));
  if (revealId) {
    const res = await db.execute({
      sql: 'SELECT api_key_enc FROM ai_providers WHERE id = ? LIMIT 1',
      args: [revealId],
    });
    const enc = res.rows?.[0]?.api_key_enc;
    const asli = dekripsiKunci(enc);
    return NextResponse.json({ ok: true, apiKey: asli || '' }, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const [prov, mod] = await Promise.all([
    db.execute('SELECT id, nama, slug, base_url, api_key_enc, env_key, created_at, updated_at FROM ai_providers ORDER BY nama ASC'),
    db.execute('SELECT id, label, model, provider, max_tokens, kecerdasan, created_at, updated_at FROM ai_models ORDER BY label ASC'),
  ]);
  return json({
    ok: true,
    providers: (prov.rows || []).map((r) => {
      const dek = dekripsiKunci(r.api_key_enc);
      // Pecah string koma menjadi daftar key terpisah (supaya CRUD per key).
      const daftarKunci = dek ? String(dek).split(',').map((k) => k.trim()).filter(Boolean) : [];
      return {
        id: Number(r.id),
        nama: r.nama,
        slug: r.slug,
        baseUrl: r.base_url,
        envKey: r.env_key || '',
        // Daftar key tersamar (per key, bukan satu string gabungan).
        kunci: daftarKunci.map((k) => ({ id: k.slice(0, 8) + '...' + k.slice(-4), tersamar: samarkanKunci(k) })),
        jumlahKunci: daftarKunci.length,
        adaKunci: daftarKunci.length > 0,
        createdAt: Number(r.created_at),
        updatedAt: r.updated_at ? Number(r.updated_at) : null,
      };
    }),
    models: (mod.rows || []).map((r) => ({
      id: Number(r.id),
      label: r.label,
      model: r.model,
      provider: r.provider,
      maxTokens: r.max_tokens == null ? null : Number(r.max_tokens),
      kecerdasan: r.kecerdasan == null ? null : Number(r.kecerdasan),
      createdAt: Number(r.created_at),
      updatedAt: r.updated_at ? Number(r.updated_at) : null,
    })),
  });
}

export async function POST(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  await schemaReady();
  const db = getDb();
  const tipe = String(body?.tipe || 'provider').trim();

  if (tipe === 'model') {
    const label = String(body?.label || '').trim().slice(0, 60);
    const model = String(body?.model || '').trim().slice(0, 160);
    const provider = String(body?.provider || '').trim().slice(0, 60);
    if (!label || !model || !provider) {
      return json({ ok: false, error: 'Label, model, dan provider wajib diisi.' }, 400);
    }
    const mt = angkaOpsional(body?.max_tokens, 200, 32000);
    const kc = angkaOpsional(body?.kecerdasan, 1, 10);
    const res = await db.execute({
      sql: 'INSERT INTO ai_models (label, model, provider, max_tokens, kecerdasan, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      args: [label, model, provider, mt, kc, Date.now()],
    });
    return json({ ok: true, id: Number(res.rows?.[0]?.id ?? res.lastInsertRowid ?? 0) });
  }

  // Provider baru. API key OPSIONAL (bisa ditambah belakangan via Edit).
  const nama = String(body?.nama || '').trim().slice(0, 60);
  const baseUrl = String(body?.base_url || '').trim().slice(0, 300);
  const apiKey = String(body?.api_key || '').trim().slice(0, 500);
  if (!nama || !baseUrl) return json({ ok: false, error: 'Nama dan URL wajib diisi.' }, 400);

  // Slug unik: kalau bentrok, tambah sufiks angka.
  let slug = buatSlug(nama);
  const adaNama = await db.execute({ sql: 'SELECT slug FROM ai_providers WHERE slug LIKE ?', args: [slug + '%'] });
  const dipakai = new Set((adaNama.rows || []).map((r) => r.slug));
  if (dipakai.has(slug)) {
    let n = 2;
    while (dipakai.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }

  const res = await db.execute({
    sql: 'INSERT INTO ai_providers (nama, slug, base_url, api_key_enc, env_key, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    args: [nama, slug, baseUrl, apiKey ? enkripsiKunci(apiKey) : null, null, Date.now()],
  });
  return json({ ok: true, id: Number(res.rows?.[0]?.id ?? res.lastInsertRowid ?? 0), slug });
}

export async function PATCH(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'id wajib.' }, 400);
  let body = null;
  try { body = await request.json(); } catch { body = null; }
  await schemaReady();
  const db = getDb();
  const tipe = String(body?.tipe || 'provider').trim();

  if (tipe === 'model') {
    const label = String(body?.label || '').trim().slice(0, 60);
    const model = String(body?.model || '').trim().slice(0, 160);
    const provider = String(body?.provider || '').trim().slice(0, 60);
    if (!label || !model || !provider) {
      return json({ ok: false, error: 'Label, model, dan provider wajib diisi.' }, 400);
    }
    await db.execute({
      sql: 'UPDATE ai_models SET label = ?, model = ?, provider = ?, max_tokens = ?, kecerdasan = ?, updated_at = ? WHERE id = ?',
      args: [label, model, provider, angkaOpsional(body?.max_tokens, 200, 32000), angkaOpsional(body?.kecerdasan, 1, 10), Date.now(), id],
    });
    return json({ ok: true });
  }

  // Edit provider. api_key opsional: kosong = jangan ubah kunci lama.
  // Jika diisi: APPEND ke kunci lama (bukan replace) - permintaan pemilik
  // 2026-10-02: "bisa nambah api key lebih dari satu".
  // Kirim replace_keys: true untuk ganti SEMUA kunci (mis. hapus kunci lama).
  const nama = String(body?.nama || '').trim().slice(0, 60);
  const baseUrl = String(body?.base_url || '').trim().slice(0, 300);
  const apiKey = String(body?.api_key || '').trim().slice(0, 500);
  const replaceKeys = body?.replace_keys === true;
  const envKey = body?.env_key === undefined ? undefined : String(body?.env_key || '').trim().slice(0, 60);
  if (!nama || !baseUrl) return json({ ok: false, error: 'Nama dan URL wajib diisi.' }, 400);

  const fields = ['nama = ?', 'base_url = ?', 'updated_at = ?'];
  const args = [nama, baseUrl, Date.now()];
  if (apiKey) {
    if (replaceKeys) {
      // Replace semua kunci (hapus yang lama).
      fields.push('api_key_enc = ?');
      args.push(enkripsiKunci(apiKey));
    } else {
      // Default: APPEND ke kunci lama, hindari duplikat.
      const lama = await db.execute({ sql: 'SELECT api_key_enc FROM ai_providers WHERE id = ?', args: [id] });
      const kunciLama = dekripsiKunci(lama.rows?.[0]?.api_key_enc);
      const semuaKunci = kunciLama ? String(kunciLama).split(',').map((k) => k.trim()).filter(Boolean) : [];
      const kunciBaruList = apiKey.split(',').map((k) => k.trim()).filter(Boolean);
      for (const kb of kunciBaruList) {
        if (!semuaKunci.includes(kb)) semuaKunci.push(kb);
      }
      fields.push('api_key_enc = ?');
      args.push(enkripsiKunci(semuaKunci.join(',')));
    }
  }
  if (envKey !== undefined) { fields.push('env_key = ?'); args.push(envKey || null); }
  args.push(id);
  await db.execute({ sql: `UPDATE ai_providers SET ${fields.join(', ')} WHERE id = ?`, args });
  return json({ ok: true });
}

export async function DELETE(request) {
  if (!(await izinkan())) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const id = Number(url.searchParams.get('id'));
  if (!id) return json({ ok: false, error: 'id wajib.' }, 400);
  await schemaReady();
  const db = getDb();
  const tipe = String(url.searchParams.get('tipe') || 'provider').trim();
  if (tipe === 'model') {
    await db.execute({ sql: 'DELETE FROM ai_models WHERE id = ?', args: [id] });
  } else {
    // Hapus provider: ambil slug DULU, lalu hapus model tersimpan yang
    // memakainya (permintaan pemilik 2026-10-02: model ikut terhapus).
    const prov = await db.execute({ sql: 'SELECT slug FROM ai_providers WHERE id = ?', args: [id] });
    const slug = prov.rows?.[0]?.slug;
    await db.execute({ sql: 'DELETE FROM ai_providers WHERE id = ?', args: [id] });
    let modelTerhapus = 0;
    if (slug) {
      const del = await db.execute({ sql: 'DELETE FROM ai_models WHERE provider = ?', args: [slug] });
      modelTerhapus = Number(del.rowsAffected ?? 0);
    }
    return json({ ok: true, modelTerhapus });
  }
  return json({ ok: true });
}

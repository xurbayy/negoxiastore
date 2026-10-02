import { NextResponse } from 'next/server';
import { getDb, schemaReady } from '../../../lib/db';
import { dekripsiKunci } from '../../../lib/aiCrypto';

export const dynamic = 'force-dynamic';

// DIAGNOSTIK SEMENTARA (tanpa auth) - HANYA status, TIDAK membocorkan kunci.
// Untuk melacak kenapa provider tidak terbaca. HAPUS setelah selesai.
export async function GET() {
  const out = { waktu: new Date().toISOString() };
  try {
    out.SESSION_SECRET_ada = Boolean(process.env.SESSION_SECRET);
    out.SESSION_SECRET_panjang = (process.env.SESSION_SECRET || '').length;
    out.TURSO_URL_ada = Boolean(process.env.TURSO_URL);
    await schemaReady();
    const db = getDb();
    const r = await db.execute('SELECT slug, nama, api_key_enc FROM ai_providers');
    out.jumlah_provider = r.rows.length;
    out.provider = r.rows.map((row) => {
      let dek = null, err = null;
      try { dek = dekripsiKunci(row.api_key_enc); } catch (e) { err = e.message; }
      return {
        slug: row.slug,
        ada_enc: Boolean(row.api_key_enc),
        panjang_enc: String(row.api_key_enc || '').length,
        dekripsi_ok: Boolean(dek),
        panjang_kunci: dek ? dek.length : 0,
        err,
      };
    });
  } catch (e) {
    out.error = e?.message || String(e);
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}

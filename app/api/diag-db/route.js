import { json } from '../../lib/api-helpers';

export const dynamic = 'force-dynamic';

// ==========================================
// GET /api/diag-db - DIAGNOSTIK koneksi database web
// ==========================================
// Menampilkan status env + hasil uji query, TANPA menelan error.
// Dipakai untuk memastikan DATABASE_URL di Vercel benar (migrasi Supabase).
// TIDAK menampilkan nilai rahasia (hanya "ada/tidak" + bentuk host).
export async function GET() {
  const url = process.env.DATABASE_URL || process.env.PG_URL || '';
  const out = {
    env: {
      ada_database_url: Boolean(url),
      pg_schema: process.env.PG_SCHEMA || '(default: web)',
      // tampilkan hanya BENTUKNYA, jangan nilainya
      bentuk_url: url
        ? url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@').replace(/\?.*$/, '')
        : null,
      // deteksi masalah umum: password mentah mengandung @ atau #
      password_mentah: /:\/\/[^:]+:[^@/%]*[@#][^@]*@/.test(url),
    },
    langkah: [],
  };

  if (!url) {
    out.error = 'DATABASE_URL belum diset di environment Vercel.';
    return json(out, 500);
  }

  try {
    const { getDb, schemaReady } = await import('../../lib/db');
    out.langkah.push('import db OK');
    await schemaReady();
    out.langkah.push('schemaReady OK');
    const db = getDb();
    out.langkah.push('getDb OK');

    const t = await db.execute('SELECT 1 AS satu');
    out.langkah.push('SELECT 1 OK');
    out.koneksi = t.rows?.[0]?.satu === 1;

    const users = await db.execute('SELECT COUNT(*) AS c FROM public.users');
    out.bot_users = Number(users.rows[0].c);
    out.langkah.push('query public.users OK');

    const webUsers = await db.execute('SELECT COUNT(*) AS c FROM users');
    out.web_users = Number(webUsers.rows[0].c);
    out.langkah.push('query web.users OK');

    out.ok = true;
  } catch (e) {
    out.ok = false;
    out.error = String(e?.message || e);
    out.error_cause = String(e?.cause?.message || '');
    out.error_code = e?.code || null;
  }

  return json(out, out.ok ? 200 : 500);
}

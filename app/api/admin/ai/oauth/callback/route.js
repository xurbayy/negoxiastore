import { getSession, getAdminSession } from '../../../../../lib/session';
import { getDb, schemaReady } from '../../../../../lib/db';
import { tukarCode } from '../../../../../lib/aiOAuth';
import { enkripsiKunci } from '../../../../../lib/aiCrypto';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/oauth/callback - terima code dari provider
// ==========================================
// Provider redirect ke sini dengan ?code=...&state=...
// Tukar code -> API key -> simpan sebagai provider kustom -> balik ke panel.
async function getAdminId() {
  const admin = await getAdminSession();
  if (admin) return admin.id || admin.discordId || 'admin';
  const session = await getSession();
  if (!session) return null;
  const ids = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.includes(session.discordId)) return null;
  return session.discordId;
}

/** Balik ke panel admin dengan pesan (query di-hash #ai). */
function balik(origin, pesan) {
  const u = new URL(origin + '/admin');
  u.searchParams.set('oauth', pesan);
  u.hash = 'ai';
  return NextResponse.redirect(u.toString());
}

export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const adminId = await getAdminId();
  if (!adminId) return balik(origin, 'gagal-login');

  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  if (!code || !state) return balik(origin, 'gagal-param');

  await schemaReady();
  const db = getDb();
  // Ambil state -> { provider, verifier }.
  const r = await db.execute({
    sql: 'SELECT provider, verifier, discord_id, created_at FROM ai_oauth_state WHERE state = ? LIMIT 1',
    args: [state],
  });
  const row = r.rows?.[0];
  if (!row) return balik(origin, 'gagal-state');
  // State milik admin ini + belum kedaluwarsa (10 menit).
  if (String(row.discord_id) !== String(adminId)) return balik(origin, 'gagal-owner');
  if (Date.now() - Number(row.created_at) > 600000) return balik(origin, 'gagal-expired');

  const provider = String(row.provider);
  const hasil = await tukarCode(provider, { code, verifier: String(row.verifier) });
  // Hapus state (sekali pakai).
  await db.execute({ sql: 'DELETE FROM ai_oauth_state WHERE state = ?', args: [state] });
  if (!hasil.ok) return balik(origin, 'gagal-tukar');

  // Simpan token OAuth.
  await db.execute({
    sql: `INSERT INTO ai_oauth (discord_id, provider, access_token, refresh_token, expires_at, extra, label, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(discord_id, provider) DO UPDATE SET access_token = ?, refresh_token = ?, expires_at = ?, extra = ?, updated_at = ?`,
    args: [
      adminId, provider, enkripsiKunci(hasil.apiKey), hasil.refreshToken || null,
      hasil.expiresIn ? Date.now() + Number(hasil.expiresIn) * 1000 : null,
      hasil.extra || null, provider, Date.now(), Date.now(),
      enkripsiKunci(hasil.apiKey), hasil.refreshToken || null,
      hasil.expiresIn ? Date.now() + Number(hasil.expiresIn) * 1000 : null, hasil.extra || null, Date.now(),
    ],
  });

  // Auto-buat provider kustom dari token OAuth (langsung bisa dipakai).
  const baseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1'
    : provider === 'google' ? 'https://generativelanguage.googleapis.com/v1beta/openai'
    : provider === 'github' ? 'https://models.inference.ai.azure.com'
    : '';
  if (baseUrl) {
    const slug = provider;
    const ada = await db.execute({ sql: 'SELECT id FROM ai_providers WHERE slug = ? LIMIT 1', args: [slug] });
    if (ada.rows?.length) {
      await db.execute({
        sql: 'UPDATE ai_providers SET api_key_enc = ?, updated_at = ? WHERE slug = ?',
        args: [enkripsiKunci(hasil.apiKey), Date.now(), slug],
      });
    } else {
      await db.execute({
        sql: 'INSERT INTO ai_providers (nama, slug, base_url, api_key_enc, env_key, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [provider, slug, baseUrl, enkripsiKunci(hasil.apiKey), null, Date.now()],
      });
    }
  }

  return balik(origin, 'sukses-' + provider);
}

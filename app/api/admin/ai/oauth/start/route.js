import { getSession, getAdminSession } from '../../../../../lib/session';
import { getDb, schemaReady } from '../../../../../lib/db';
import { json } from '../../../../../lib/api-helpers';
import { OAUTH_PROVIDERS, buatPKCE, urlAuthorize } from '../../../../../lib/aiOAuth';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

// ==========================================
// /api/admin/ai/oauth/start - mulai login OAuth
// ==========================================
// GET ?provider=openrouter  -> { url: "https://openrouter.ai/auth?..." }
// Simpan state+verifier di DB, redirect user ke URL authorize.
async function getAdminId() {
  const admin = await getAdminSession();
  if (admin) return admin.id || admin.discordId || 'admin';
  const session = await getSession();
  if (!session) return null;
  const ids = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.includes(session.discordId)) return null;
  return session.discordId;
}

export async function GET(request) {
  const adminId = await getAdminId();
  if (!adminId) return json({ ok: false, error: 'forbidden' }, 403);
  const url = new URL(request.url);
  const provider = (url.searchParams.get('provider') || '').trim().toLowerCase();
  if (!OAUTH_PROVIDERS[provider]) return json({ ok: false, error: 'Provider OAuth tidak dikenal.' }, 400);

  await schemaReady();
  const db = getDb();

  // Callback URL = origin aplikasi (dev/prod otomatis).
  const origin = url.origin;
  const callbackUrl = `${origin}/api/admin/ai/oauth/callback`;
  const { verifier, challenge } = buatPKCE();
  const state = crypto.randomBytes(16).toString('hex');

  // Simpan state -> verifier (kedaluwarsa 10 menit).
  await db.execute({
    sql: 'INSERT INTO ai_oauth_state (state, discord_id, provider, verifier, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [state, adminId, provider, verifier, Date.now()],
  });
  // Bersihkan state lama (>10 menit).
  await db.execute({ sql: 'DELETE FROM ai_oauth_state WHERE created_at < ?', args: [Date.now() - 600000] });

  const authorize = urlAuthorize(provider, { callbackUrl, challenge, state });
  return json({ ok: true, url: authorize, provider });
}

import { NextResponse } from 'next/server';
import { getDb, schemaReady } from '../../../lib/session-db';
import { createSession, createAdminSession } from '../../../lib/session';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET /api/auth/callback?code=...&state=nonce|/returnTo - tukar code -> token -> profil.
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  // state = "nonce|/returnTo" (nonce dibuat di /api/auth/login, lihat cookie).
  const stateParam = url.searchParams.get('state') || '';
  const sepIdx = stateParam.indexOf('|');
  const stateNonce = sepIdx >= 0 ? stateParam.slice(0, sepIdx) : '';
  const statePath = sepIdx >= 0 ? stateParam.slice(sepIdx + 1) : '';
  const adminMode = statePath === '@admin'; // panel admin: KHUSUS ADMIN_DISCORD_IDS
  const returnTo = statePath.startsWith('/') && !statePath.startsWith('//') ? statePath : '/me';
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirect = process.env.DISCORD_REDIRECT_URI || `${url.origin}/api/auth/callback`;

  if (!code || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/?auth=gagal', url.origin));
  }

  // Verifikasi nonce CSRF (cookie sekali pakai -> dihapus).
  {
    const store = await cookies();
    const expected = store.get('nexo_oauth_state')?.value;
    store.delete('nexo_oauth_state');
    if (!expected || !stateNonce || expected !== stateNonce) {
      return NextResponse.redirect(new URL('/?auth=gagal', url.origin));
    }
  }

  try {
    // 1. Tukar code -> access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token HTTP ${tokenRes.status}`);
    const { access_token } = await tokenRes.json();

    // 2. Ambil profil Discord
    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!meRes.ok) throw new Error(`me HTTP ${meRes.status}`);
    const me = await meRes.json();

    // MODE ADMIN: cuma Discord ID yang daftar di ADMIN_DISCORD_IDS yang boleh
    // masuk panel - selain itu diarahkan ke halaman /no-access yang lucu.
    if (adminMode) {
      const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!adminIds.includes(me.id)) {
        return NextResponse.redirect(new URL('/no-access', url.origin));
      }
      await schemaReady();
      const dbA = getDb();
      await dbA.execute({
        sql: `INSERT INTO users (discord_id, username, avatar, is_admin, created_at)
              VALUES (?, ?, ?, 1, ?)
              ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar, is_admin = 1`,
        args: [me.id, me.username, me.avatar, Date.now()],
      });
      await createAdminSession(me.username, me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null);
      return NextResponse.redirect(new URL('/admin', url.origin));
    }

    // 3. Simpan/update user di DB
    await schemaReady();
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO users (discord_id, username, avatar, is_admin, created_at)
            VALUES (?, ?, ?, 0, ?)
            ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar`,
      args: [me.id, me.username, me.avatar, Date.now()],
    });

    await createSession({
      discordId: me.id,
      username: me.username,
      avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null,
    });

    return NextResponse.redirect(new URL(returnTo, url.origin));
  } catch {
    return NextResponse.redirect(new URL('/?auth=gagal', url.origin));
  }
}

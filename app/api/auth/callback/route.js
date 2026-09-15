import { NextResponse } from 'next/server';
import { getDb, schemaReady } from '../../../lib/session-db';
import { createSession, createAdminSession } from '../../../lib/session';
import { totpConfigured, hasTrustedDevice, createPending2fa } from '../../../lib/admin-2fa';
import { cookies } from 'next/headers';
import { canonicalOrigin } from '../../../lib/site';

export const dynamic = 'force-dynamic';

// GET /api/auth/callback?code=...&state=nonce|/returnTo - tukar code -> token -> profil.
export async function GET(request) {
  const url = new URL(request.url);
  // Domain kanonik: SEMUA redirect balik ke nexogames.site (bukan host request).
  // Dulu pakai url.origin -> user dari domain lama dibalikin ke domain lama.
  const ORIGIN = canonicalOrigin(request.url);
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
  const redirect = process.env.DISCORD_REDIRECT_URI || `${ORIGIN}/api/auth/callback`;

  if (!code || !clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/?auth=gagal', ORIGIN));
  }

  // Verifikasi nonce CSRF (cookie sekali pakai -> dihapus).
  {
    const store = await cookies();
    const expected = store.get('nexo_oauth_state')?.value;
    store.delete('nexo_oauth_state');
    if (!expected || !stateNonce || expected !== stateNonce) {
      return NextResponse.redirect(new URL('/?auth=gagal', ORIGIN));
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
        // User biasa nyasar ke login admin: OAuth-nya sudah sah, jadi tetep
        // buatin session member + simpan profilnya. Tombol "Buka Profil Gw
        // Aja" di /no-access langsung masuk /me tanpa login ulang.
        await schemaReady();
        const dbN = getDb();
        await dbN.execute({
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
        return NextResponse.redirect(new URL('/no-access', ORIGIN));
      }
      await schemaReady();
      const dbA = getDb();
      await dbA.execute({
        sql: `INSERT INTO users (discord_id, username, avatar, is_admin, created_at)
              VALUES (?, ?, ?, 1, ?)
              ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar, is_admin = 1`,
        args: [me.id, me.username, me.avatar, Date.now()],
      });
      const avatarUrl = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null;
      // 2FA admin: kalau perangkat ini belum tepercaya, minta kode TOTP dulu
      // lewat /admin/verify sebelum sesi admin aktif.
      if (totpConfigured() && !(await hasTrustedDevice())) {
        await createPending2fa(me.username, avatarUrl);
        return NextResponse.redirect(new URL('/admin/verify?from=discord', ORIGIN));
      }
      await createAdminSession(me.username, avatarUrl);
      return NextResponse.redirect(new URL('/admin', ORIGIN));
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

    return NextResponse.redirect(new URL(returnTo, ORIGIN));
  } catch {
    return NextResponse.redirect(new URL('/?auth=gagal', ORIGIN));
  }
}

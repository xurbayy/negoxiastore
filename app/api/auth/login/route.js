import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSession, createAdminSession } from '../../../lib/session';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// GET /api/auth/login?returnTo=/premium - mulai Discord OAuth2 (scope identify).
// state = nonce CSRF + returnTo, dicocokkan lagi di callback.
// returnTo=@admin = mode ADMIN: callback hanya boleh mengaktifkan ID khusus
// di ADMIN_DISCORD_IDS (login panel tanpa username/password).
export async function GET(request) {
  const url = new URL(request.url);
  let returnTo = url.searchParams.get('returnTo') || '/me';
  if (returnTo !== '@admin' && !(returnTo.startsWith('/') && !returnTo.startsWith('//'))) returnTo = '/me';
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirect = process.env.DISCORD_REDIRECT_URI || `${url.origin}/api/auth/callback`;

  if (!clientId) {
    // Dev tanpa OAuth: session demo - HANYA di development. Di production jalur
    // ini selalu mati (meski ALLOW_DEV_LOGIN nyasar diset true), biar bukan backdoor.
    if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEV_LOGIN === 'false') {
      return NextResponse.json({ ok: false, error: 'DISCORD_CLIENT_ID belum diset' }, { status: 500 });
    }
    if (returnTo === '@admin') {
      await createAdminSession('dev-admin');
    } else {
      await createSession({
        discordId: process.env.ADMIN_DISCORD_IDS?.split(',')[0] || '836383639439671366',
        username: 'dev-admin',
        avatar: null,
      });
    }
    return NextResponse.redirect(new URL(returnTo === '@admin' ? '/admin' : returnTo, url.origin));
  }

  // Nonce CSRF: acak, disimpan di cookie httpOnly 10 menit, sekali pakai.
  const nonce = crypto.randomBytes(16).toString('hex');
  const store = await cookies();
  store.set('nexo_oauth_state', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'identify',
    state: nonce + '|' + returnTo,
    prompt: 'consent',
  });
  return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}

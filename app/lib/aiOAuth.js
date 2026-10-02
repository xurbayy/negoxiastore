// ==========================================
// aiOAuth - OAuth PKCE untuk provider AI (OpenRouter dll)
// ==========================================
//
// Permintaan pemilik 2026-10-02: "gw mau pake url auth gitu, nambah modelnya
// auth bisa ga" - login akun (OAuth) bukan paste API key.
//
// OpenRouter mendukung OAuth PKCE: buka /auth, user login, callback dengan
// `code`. Tukar code + verifier -> API key. Simpan. Selesai.
//
// https://openrouter.ai/docs/oauth

import crypto from 'node:crypto';

// Daftar provider OAuth yang sudah didukung.
// callbackUrl diisi dinamis (dari origin request) supaya dev & prod jalan.
export const OAUTH_PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    authorizeUrl: 'https://openrouter.ai/auth',
    tokenUrl: 'https://openrouter.ai/api/v1/auth/keys',
    // OpenRouter: authorize pakai PKCE (code_challenge S256).
    pkce: true,
    scopes: '',
  },
  // Slot untuk provider lain (implementasi menyusul):
  // github: { ... device flow ... },
  // google: { ... },
};

/** Buat code_verifier + code_challenge (PKCE S256). */
export function buatPKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** URL authorize yang dibuka di browser (redirect user login). */
export function urlAuthorize(providerId, { callbackUrl, challenge, state }) {
  const p = OAUTH_PROVIDERS[providerId];
  if (!p) return null;
  const u = new URL(p.authorizeUrl);
  u.searchParams.set('callback_url', callbackUrl);
  if (p.pkce) {
    u.searchParams.set('code_challenge', challenge);
    u.searchParams.set('code_challenge_method', 'S256');
  }
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

/**
 * Tukar authorization code -> token/API key.
 * OpenRouter mengembalikan { key } (API key siap pakai).
 * @returns {Promise<{ok:boolean, apiKey?:string, error?:string}>}
 */
export async function tukarCode(providerId, { code, verifier }) {
  const p = OAUTH_PROVIDERS[providerId];
  if (!p) return { ok: false, error: 'Provider OAuth tidak dikenal.' };
  try {
    const body = { code };
    if (p.pkce) {
      body.code_verifier = verifier;
      body.code_challenge_method = 'S256';
    }
    const res = await fetch(p.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: j?.error?.message || j?.error || `HTTP ${res.status}` };
    }
    // OpenRouter: { key: "sk-or-..." }. Provider lain mungkin { access_token }.
    const apiKey = j?.key || j?.access_token || j?.api_key || '';
    if (!apiKey) return { ok: false, error: 'Provider tidak mengirim token/key.' };
    return {
      ok: true,
      apiKey,
      refreshToken: j?.refresh_token || null,
      expiresIn: j?.expires_in || null,
      extra: j?.user ? JSON.stringify(j.user) : null,
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

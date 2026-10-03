import { json } from '../../../lib/api-helpers';
import { verifyBearer } from '../../../lib/api-helpers';
import { replaceEmojiCatalog } from '../../../lib/emojisServer';

export const dynamic = 'force-dynamic';

// POST /api/bot/emojis
// Bot mengirim katalog emoji resminya -> disimpan ke web.emoji_catalog.
// Auth: Bearer BOT_API_KEY (scope 'write'), sama seperti /api/bot/stats.
//
// Body: { emojis: [{ name, aliases?: string[], id, url, animated?, usage? }] }
export async function POST(request) {
  const denied = verifyBearer(request, 'write');
  if (denied) return denied;

  let body;
  try { body = await request.json(); } catch { body = null; }
  const emojis = body?.emojis;
  if (!Array.isArray(emojis)) {
    return json({ ok: false, error: 'Body harus { emojis: [...] }.' }, 400);
  }

  try {
    const hasil = await replaceEmojiCatalog(emojis);
    return json({ ok: true, ...hasil });
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Gagal menyimpan emoji.' }, 400);
  }
}

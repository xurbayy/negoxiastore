import { NextResponse } from 'next/server';
import { getEmojiCatalog } from '../../lib/emojisServer';

export const dynamic = 'force-dynamic';

// GET /api/emojis - katalog emoji publik (untuk resolver di browser).
// Sumber: database (di-push bot) dengan fallback file JSON. Dikirim ringkas
// (name/aliases/id/url/animated). TANPA cache (permintaan pemilik): begitu bot
// push emoji baru, browser langsung menerima yang terbaru.
export async function GET() {
  const list = await getEmojiCatalog();
  const ringkas = list.map((e) => ({
    n: e.name,
    a: e.aliases || [],
    i: e.id,
    u: e.url,
    an: e.animated ? 1 : 0,
  }));
  return NextResponse.json(
    { ok: true, count: ringkas.length, emojis: ringkas },
    { headers: { 'cache-control': 'no-store' } }
  );
}

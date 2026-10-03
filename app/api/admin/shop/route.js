import { getSession, getAdminSession } from '../../../lib/session';
import { json, ready } from '../../../lib/api-helpers';
import { touchActivity } from '../../../lib/activity';
import { invalidateCatalog } from '../../../lib/liveCatalog';
import {
  listShopAdmin, restockItem, restockAll, setItemPrice,
  setDiscount, removeDiscount, HttpError,
} from '../../../lib/shopAdmin';

export const dynamic = 'force-dynamic';

// GET /api/admin/shop - daftar item + diskon LANGSUNG dari database (Supabase).
// Jalur akses sama dengan endpoint admin lain: session admin (username+password)
// ATAU member di ADMIN_DISCORD_IDS.
async function authorize() {
  const admin = await getAdminSession();
  if (admin) return `admin:${admin.adminUsername}`;
  const session = await getSession();
  if (session) {
    const ids = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.includes(session.discordId)) return session.discordId;
  }
  return null;
}

export async function GET() {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  await ready();
  try {
    const items = await listShopAdmin();
    return json({ ok: true, items, actorId: actor });
  } catch (e) {
    return json({ ok: false, error: e?.message || 'Gagal membaca katalog.' }, 500);
  }
}

// POST /api/admin/shop - aksi tulis LANGSUNG ke database.
// Body: { action, itemKey?, amount?, price?, discountPrice?, durationHours? }
export async function POST(request) {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { body = null; }
  const action = String(body?.action || '');
  const itemKey = body?.itemKey;

  await ready();
  try {
    let hasil;
    switch (action) {
      case 'restock_item':
        hasil = await restockItem(itemKey, body?.amount);
        break;
      case 'restock_all':
        hasil = await restockAll();
        break;
      case 'set_price':
        hasil = await setItemPrice(itemKey, body?.price);
        break;
      case 'set_discount':
        hasil = await setDiscount(itemKey, body?.discountPrice, body?.durationHours);
        break;
      case 'remove_discount':
        hasil = await removeDiscount(itemKey);
        break;
      default:
        return json({ ok: false, error: 'Aksi tidak dikenal.' }, 400);
    }
    // Beri tahu bot (queue) supaya mengebut; tidak wajib berhasil.
    touchActivity().catch(() => {});
    // Buang cache katalog supaya /shop publik langsung menampilkan data baru.
    invalidateCatalog();
    return json({ ok: true, act: action, ...hasil });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ ok: false, error: e?.message || 'Gagal menyimpan.' }, status);
  }
}

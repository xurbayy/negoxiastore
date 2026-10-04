import { getSession, getAdminSession } from '../../../lib/session';
import { json, ready } from '../../../lib/api-helpers';
import { getDb } from '../../../lib/db';
import { touchActivity } from '../../../lib/activity';
import { invalidateCatalog } from '../../../lib/liveCatalog';
import { invalidateLive } from '../../../lib/snapshot';
import { invalidateDataCache } from '../data/route';
import {
  listShopAdmin, restockItem, restockAll, setItemPrice,
  setDiscount, removeDiscount, HttpError,
} from '../../../lib/shopAdmin';

export const dynamic = 'force-dynamic';

// ==========================================
// CACHE GET 8 DETIK (optimasi egress 2026-10-05)
// ==========================================
// ShopManager (panel admin) memanggil endpoint ini tiap 5 detik dan tiap
// panggilan menjalankan 3 query DB (shop_items + shop_discounts + emoji map).
// Padahal katalog jarang berubah (hanya saat admin edit / restock / diskon).
// Cache 8 dtk: poll 5 dtk hanya kena DB tiap 8 dtk -> baca DB berkurang ~40%.
// Invalidasi ON-WRITE (catatDanSegarkan) sudah ada - edit admin langsung
// terlihat tanpa menunggu TTL.
const _cacheGet = { data: null, at: 0 };
const GET_TTL_MS = 8_000;

// Catat aksi ke Activity Log (bot_commands) + bersihkan semua cache.
// Permintaan pemilik 2026-10-04: "kalo gw melakukan apapun seperti ganti
// harga restock dan lainnya itu ada di activity log admin semua kegiatan tak
// terkecuali". Dulu edit shop TIDAK dicatat -> tidak muncul di Activity Log.
async function catatDanSegarkan(actor, action, payload, hasil) {
  try {
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO bot_commands (action, payload, actor_id, status, result, created_at, executed_at)
            VALUES (?, ?, ?, 'done', ?, ?, ?)`,
      args: [action, JSON.stringify(payload || {}), actor, String(hasil || '').slice(0, 400), Date.now(), Date.now()],
    });
  } catch { /* pencatatan tidak boleh menjatuhkan aksi */ }
  // Invalidasi ON-WRITE: semua cache dibersihkan -> perubahan langsung terlihat.
  try { invalidateCatalog(); } catch {}
  try { invalidateLive(); } catch {}
  try { invalidateDataCache(); } catch {}
  // Cache GET endpoint ini sendiri (lihat _cacheGet di bawah).
  try { _cacheGet.data = null; _cacheGet.at = 0; } catch {}
}

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

// ==========================================
// CACHE GET 8 DETIK (optimasi egress 2026-10-05)
// ==========================================
// (Deklarasi _cacheGet/GET_TTL_MS dipindah ke ATAS file supaya juga bisa
//  di-reset dari catatDanSegarkan - lihat di atas.)
export async function GET() {
  const actor = await authorize();
  if (!actor) return json({ ok: false, error: 'forbidden' }, 403);
  await ready();
  try {
    if (_cacheGet.data && Date.now() - _cacheGet.at < GET_TTL_MS) {
      return json({ ok: true, items: _cacheGet.data, actorId: actor, cached: true });
    }
    const items = await listShopAdmin();
    _cacheGet.data = items;
    _cacheGet.at = Date.now();
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
    // CATAT ke Activity Log + invalidasi semua cache (perubahan langsung
    // terlihat di web & masuk riwayat admin - lihat catatDanSegarkan).
    await catatDanSegarkan(actor, action, { itemKey, amount: body?.amount, price: body?.price, discountPrice: body?.discountPrice, durationHours: body?.durationHours }, hasil);
    return json({ ok: true, act: action, ...hasil });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ ok: false, error: e?.message || 'Gagal menyimpan.' }, status);
  }
}

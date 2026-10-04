// ==========================================
// app/lib/liveCatalog.js
// Katalog (shop, titles, misi) dibaca LANGSUNG dari database bot.
// ==========================================
// Sejak migrasi ke SATU database PostgreSQL (Supabase, 2026-10-03), web tidak
// lagi menunggu bot "push" katalog. Fungsi di sini query langsung ke tabel bot
// (public.shop_items, public.shop_discounts) + memakai katalog statis (titles,
// kategori, misi) yang DISALIN dari bot supaya bentuk hasilnya sama persis.
//
// CATATAN: kategori & daftar misi memang statis di bot (bukan tabel DB), jadi
// disalin di sini. Kalau bot mengubahnya, salinan ini perlu disesuaikan.
import { getDb, schemaReady } from './db';

// Kategori shop = PERSIS nxshop (label + emoji + warna + deskripsi).
export const SHOP_CATEGORIES = [
  { value: 'global', label: 'Global Boosters', emoji: '<a:globe:1516390212672946288>', description: 'VIP, Double Points & Daily Boost', color: '#5865F2' },
  { value: 'titles', label: 'Prestigious Titles', emoji: '<a:titles:1516365054134583306>', description: 'Gelar profil eksklusif permanen', color: '#E91E63' },
  { value: 'instant', label: 'Mystery & Instant', emoji: '<a:gift:1469193552256041043>', description: 'Mystery Box & tiket reset harian', color: '#9E9E9E' },
  { value: 'passive', label: 'Passive Buffs', emoji: '🧲', description: 'Item otomatis aktif (Magnet Poin)', color: '#795548' },
  { value: 'chemistry', label: 'Chemistry & Partner', emoji: '<a:chemistry:1517177922459402330>', description: 'Hadiah & item untuk Chemistry', color: '#FF4081' },
  { value: 'bet', label: 'Betting Protection', emoji: '<:shield:1516394055641075783>', description: 'Amulet & asuransi taruhan', color: '#FF9800' },
  { value: 'quiz', label: 'Quiz & Puzzle', emoji: '<a:brain:1516396687159988325>', description: 'Extra Life & Hint Token', color: '#9C27B0' },
  { value: 'arcade', label: 'Arcade & Cheat', emoji: '<:rps:1516405345000357948>', description: 'Item curang RPS, Coinflip, Numwar & Slot', color: '#00BCD4' },
  { value: 'timed', label: 'Racing & Timed', emoji: '<:racing:1516404055692414986>', description: 'Speed Boost & Nitro Racing', color: '#2196F3' },
  { value: 'blackjack', label: 'Blackjack', emoji: '<:blackjack:1519659727318024193>', description: 'Item curang Blackjack', color: '#E91E63' },
  { value: 'russianroulette', label: 'Russian Roulette', emoji: '<:rr:1519568573083811982>', description: 'Item bertahan hidup Russian Roulette', color: '#FF5722' },
  { value: 'musicalchairs', label: 'Musical Chairs', emoji: '<:chair:1519576885418393600>', description: 'Sabotase lawan di Musical Chairs', color: '#FFC107' },
  { value: 'board', label: 'Board Games', emoji: '<:monopoly:1516402431271899287>', description: 'Item Monopoly NEXO & Snakes & Ladders', color: '#009688' },
  { value: 'autochess', label: 'Auto Chess', emoji: '<:autochess:1516402800022786240>', description: 'Refresh Shop & Lucky Roll', color: '#673AB7' },
  { value: 'rpg', label: 'RPG Gear', emoji: '<:swords:1516394026507571280>', description: 'Potion & Elixir Boss Raid', color: '#F44336' },
  { value: 'bombsquad', label: 'Bomb Squad', emoji: '<:bombsquad:1517174856729493665>', description: 'Item & perk Bomb Squad', color: '#E91E63' },
  { value: 'bossraid', label: 'Boss Raid', emoji: '<:bossraid:1517175047477788845>', description: 'Item khusus Boss Raid', color: '#F44336' },
  { value: 'heist', label: 'The Heist', emoji: '<:heist:1517175515914436830>', description: 'Perk untuk Bank Heist', color: '#FFEB3B' },
  { value: 'dungeon', label: 'Dungeon Crawler', emoji: '<:dungeon:1519954384169996451>', description: 'Item & perk Dungeon Crawler', color: '#795548' },
  { value: 'zombiesurvival', label: 'Zombie Survival', emoji: '<:zombie:1517175779207807116>', description: 'Item Zombie Survival', color: '#8BC34A' },
];

// Kategori item = logika SAMA dengan bot (utils/webBridge.js _shopCategory).
function shopCategory(item) {
  if (['vip_bypass', 'multiplier', 'daily_boost'].includes(item.effect_type)) return 'global';
  if (['passive_boost'].includes(item.effect_type)) return 'passive';
  if (['random', 'daily_reset'].includes(item.effect_type)) return 'instant';
  if (['gift_chemistry', 'proposal', 'breakup'].includes(item.effect_type)) return 'chemistry';
  if (item.game_type === 'autochess') return 'autochess';
  if (['snakeladder', 'monopoly'].includes(item.game_type) || item.item_key === 'lucky_dice' || item.game_type === 'dice') return 'board';
  if (item.game_type === 'blackjack') return 'blackjack';
  if (item.game_type === 'russianroulette') return 'russianroulette';
  if (item.game_type === 'musicalchairs') return 'musicalchairs';
  if (item.game_type === 'bet') return 'bet';
  if (item.game_type === 'rpg') return 'rpg';
  if (item.game_type === 'bombsquad') return 'bombsquad';
  if (item.game_type === 'dungeon') return 'dungeon';
  if (item.game_type === 'bossraid') return 'bossraid';
  if (item.game_type === 'heist') return 'heist';
  if (item.game_type === 'zombiesurvival') return 'zombiesurvival';
  if (item.game_type === 'timed' || item.item_key === 'racing_nitro') return 'timed';
  if ((['quiz', 'solo', 'word', 'math', 'riddle'].includes(item.game_type) && !['jackpot'].includes(item.effect_type)) || ['hint', 'extra_life'].includes(item.effect_type)) return 'quiz';
  if (['rps', 'coinflip', 'numwar'].includes(item.game_type) || item.effect_type === 'jackpot') return 'arcade';
  if (item.game_type === 'solo' || ['jackpot'].includes(item.effect_type)) return 'arcade';
  return 'other';
}

// Ambil daftar emoji dari registry web (untuk emojiUrl) - opsional.
async function emojiUrlMap() {
  try {
    const db = getDb();
    const res = await db.execute('SELECT emoji_id, emoji_url FROM emoji_registry');
    const m = {};
    for (const r of res.rows) m[String(r.emoji_id)] = r.emoji_url;
    return m;
  } catch { return {}; }
}

// FALLBACK EMOJI STATIS (fix 2026-10-03): emoji_registry hanya berisi emoji
// admin-title (5 baris), jadi emoji kategori/item shop dari bot
// (<:chair:1519576885418393600> dst.) tidak punya URL dan tampil kosong di web.
// web-emojis.json memuat SEMUA emoji resmi bot by ID - cocokkan dari ID di
// teks emoji, tidak perlu bot push apa pun.
import emojiData from './web-emojis.json';
const staticEmojiById = {};
for (const e of emojiData.emojis) {
  const id = String(e.id || (e.url || '').match(/emojis\/(\d+)/)?.[1] || '');
  if (id && !staticEmojiById[id]) staticEmojiById[id] = e.url;
}

function emojiUrl(emoji, map) {
  const m = String(emoji || '').match(/<a?:[A-Za-z0-9_]+:(\d+)>/);
  if (!m) return null;
  // Registry DB dulu (emoji dinamis admin-title), lalu katalog statis bot.
  return map[m[1]] || staticEmojiById[m[1]] || null;
}


// ==========================================
// SWR CACHE (2026-10-03, permintaan pemilik: "loading gak kelamaan")
// ==========================================
// TANPA CACHE (permintaan pemilik 2026-10-03)
// ==========================================
// Dulu ada cache SWR (sajikan data lama, refresh di latar). Pemilik meminta
// cache DIHAPUS TOTAL untuk semua pembaca (admin & user biasa) supaya yang
// tampil selalu data terkini - tidak ada lagi "kok masih lama berubahnya".
// Setiap pemanggilan sekarang query DB langsung. Query-nya ringan (indexed,
// puluhan baris) dan halaman sudah punya AutoRefresh, jadi aman.
async function swr(_key, _ttlMs, fetcher) {
  try {
    return await fetcher();
  } catch {
    return null;
  }
}

// Dipertahankan sebagai no-op supaya pemanggil lama (endpoint admin) tidak
// perlu diubah; tanpa cache, tidak ada yang perlu di-invalidasi.
export function invalidateCatalog() { /* no-op: cache sudah dihapus */ }

// SHOP ITEMS langsung dari DB bot.
export async function getLiveShop() {
  return swr('shop', 0, async () => {
  try {
    await schemaReady();
    const db = getDb();
    const [items, discounts, emap] = await Promise.all([
      db.execute('SELECT item_key, name, description, price, stock, game_type, effect_type, emoji, is_active FROM public.shop_items ORDER BY price ASC'),
      // KONTRAK BOT (utils/database.js adminSetDiscount): saat flash sale aktif,
      // bot menyimpan HARGA ASLI di shop_discounts.original_price DAN menimpa
      // shop_items.price jadi harga diskon. Karena itu kolom original_price
      // WAJIB ikut di-SELECT - tanpa ini kartu tidak punya harga asli untuk
      // dicoret (dulu inilah sebab badge "Flash Sale" tak pernah muncul saat
      // katalog dibaca langsung dari DB).
      db.execute('SELECT item_key, original_price, discount_price, expires_at FROM public.shop_discounts WHERE expires_at > ?', [Date.now()]).catch(() => ({ rows: [] })),
      emojiUrlMap(),
    ]);
    const disc = {};
    for (const d of discounts.rows) {
      disc[d.item_key] = {
        discountPrice: Number(d.discount_price),
        originalPrice: d.original_price === null || d.original_price === undefined ? null : Number(d.original_price),
        expiresAt: Number(d.expires_at),
      };
    }

    return {
      shopItems: items.rows
        .filter((it) => Number(it.is_active ?? 1) !== 0)
        .map((it) => ({
          itemKey: it.item_key,
          name: it.name,
          description: it.description,
          price: Number(it.price || 0),
          stock: Number(it.stock ?? -1),
          gameType: it.game_type,
          emoji: it.emoji,
          emojiUrl: emojiUrl(it.emoji, emap),
          category: shopCategory(it),
          discountPrice: disc[it.item_key] ? disc[it.item_key].discountPrice : null,
          originalPrice: disc[it.item_key] ? disc[it.item_key].originalPrice : null,
          discountExpiresAt: disc[it.item_key] ? disc[it.item_key].expiresAt : null,
        })),
      // KATEGORI JUGA DAPAT emojiUrl (fix 2026-10-03): dulu SHOP_CATEGORIES
      // dikirim mentah (cuma teks "<a:globe:...>") dan ShopClient PlainEmoji
      // mengabaikan format itu -> ikon kategori kosong di halaman shop.
      shopCategories: SHOP_CATEGORIES.map((c) => ({
        ...c,
        emojiUrl: emojiUrl(c.emoji, emap),
      })),
      discounts: Object.entries(disc).map(([itemKey, d]) => ({
        itemKey,
        discountPrice: d.discountPrice,
        originalPrice: d.originalPrice,
        expiresAt: d.expiresAt,
      })),
    };
  } catch {
    return null;
  }
  });
}

// TITLES langsung dari DB bot (katalog statis bot + dimiliki user via user_titles).
export async function getLiveTitles() {
  return swr('titles', 0, async () => {
  try {
    await schemaReady();
    const db = getDb();
    const [rows, emap] = await Promise.all([
      db.execute('SELECT title_key, COUNT(*) AS owners FROM public.user_titles GROUP BY title_key').catch(() => ({ rows: [] })),
      emojiUrlMap(),
    ]);
    const owners = {};
    for (const r of rows.rows) owners[r.title_key] = Number(r.owners);
    return { owners, emojiMap: emap };
  } catch {
    return { owners: {}, emojiMap: {} };
  }
  });
}

// ==========================================
// PROMO CODES + PENGUMUMAN LANGSUNG DARI DB BOT (2026-10-03)
// ==========================================
// Dulu web menunggu bot mengirim promoCodes/announcements lewat push.
// Sekarang dibaca langsung dari tabel bot: public.promo_codes + public.settings.

export async function getLivePromos() {
  return swr('promos', 0, async () => {
  try {
    await schemaReady();
    const db = getDb();
    const res = await db.execute(
      `SELECT code, reward_type, reward_value, quota, claimed_count
         FROM public.promo_codes
        WHERE claimed_count < quota
        ORDER BY code ASC`
    );
    return res.rows.map((r) => ({
      code: r.code,
      rewardType: r.reward_type,
      rewardValue: r.reward_value,
      quota: Number(r.quota || 0),
      claimed: Number(r.claimed_count || 0),
    }));
  } catch {
    return null;
  }
  });
}

export async function getLiveSettings() {
  return swr('settings', 0, async () => {
  try {
    await schemaReady();
    const db = getDb();
    const res = await db.execute("SELECT key, value FROM public.settings WHERE key IN ('maintenance','maintenance_reason','global_announcement','shop_announcement')");
    const m = {};
    for (const r of res.rows) m[r.key] = r.value;
    return {
      maintenance: {
        active: String(m.maintenance) === '1',
        reason: m.maintenance_reason || '',
      },
      announcements: {
        global: m.global_announcement || '',
        shop: m.shop_announcement || '',
      },
    };
  } catch {
    return null;
  }
  });
}

// DISKON AKTIF (flash sale) langsung dari DB bot.
export async function getLiveDiscounts() {
  return swr('discounts', 0, async () => {
  try {
    await schemaReady();
    const db = getDb();
    const res = await db.execute(
      'SELECT item_key, discount_price, expires_at FROM public.shop_discounts WHERE expires_at > ?',
      [Date.now()]
    );
    return res.rows.map((r) => ({
      item_key: r.item_key,
      discount_price: Number(r.discount_price),
      expires_at: Number(r.expires_at),
    }));
  } catch {
    return null;
  }
  });
}

// ==========================================
// SERVER (Komunitas) LANGSUNG DARI DB BOT (2026-10-03)
// ==========================================
// Dulu web menunggu bot mengirim daftar server (butuh Discord client).
// Sekarang dihitung langsung dari tabel bot:
//   players = pemain unik yang pernah main di server itu (game_scores)
//   games   = jumlah permainan
//   points  = total poin dari server itu
//   invite  = link dari guild_discord_invites (kalau ada)
//   name    = nama asli server dari tabel public.guild_infos (diisi bot tiap push)
//   iconUrl = ikon server dari tabel yang sama
// Fallback ke "Server <id>" kalau bot belum sempat mengisi guild_infos.
export async function getLiveServers() {
  return swr('servers', 0, async () => {
  try {
    await schemaReady();
    const db = getDb();
    const [stats, invites, infos] = await Promise.all([
      db.execute(`
        SELECT guild_id,
               COUNT(DISTINCT user_id) AS players,
               COUNT(*)                AS games,
               COALESCE(SUM(points),0) AS points
          FROM public.game_scores
         WHERE guild_id <> 'GLOBAL'            -- GLOBAL = pseudo-guild (bukan server asli)
           AND guild_id ~ '^[0-9]{17,20}$'     -- hanya snowflake Discord valid (buang data tes korup: g/tg/testguild)
         GROUP BY guild_id
        HAVING COUNT(DISTINCT user_id) > 0
         ORDER BY COUNT(DISTINCT user_id) DESC, COALESCE(SUM(points),0) DESC
         LIMIT 100
      `),
      db.execute('SELECT guild_id, invite_url FROM public.guild_discord_invites').catch(() => ({ rows: [] })),
      db.execute('SELECT guild_id, name, icon_url, member_count FROM public.guild_infos').catch(() => ({ rows: [] })),
    ]);
    const inv = {};
    for (const r of invites.rows) inv[r.guild_id] = r.invite_url;
    const inf = {};
    for (const r of infos.rows) inf[r.guild_id] = r;

    return stats.rows.map((s) => {
      const meta = inf[s.guild_id];
      return {
        guildId: String(s.guild_id),
        // Nama ASLI dari guild_infos; fallback dummy kalau bot belum mengisi.
        name: (meta && meta.name) || `Server ${String(s.guild_id).slice(-4)}`,
        iconUrl: (meta && meta.icon_url) || null,
        players: Number(s.players || 0),
        games: Number(s.games || 0),
        points: Number(s.points || 0),
        members: Number((meta && meta.member_count) || 0),
        invite: inv[s.guild_id] || null,
      };
    })
    // KEBIJAKAN PEMILIK (revisi 2026-10-03): server TANPA link invite tidak
    // ditampilkan sama sekali di halaman komunitas - bukan cuma disembunyikan
    // tombol Gabungnya. Dulu (2026-09-30) masih ditampilkan dengan label
    // "Link belum tersedia"; sekarang dibuang langsung dari sumber data,
    // jadi fallback snapshot (siapkanServer) juga harus menyaring dengan
    // aturan yang sama.
    //
    // SYARAT MINIMAL 20 PEMAIN (permintaan pemilik 2026-10-03): server baru
    // muncul di leaderboard komunitas kalau sudah >= 20 pemain unik main.
    // Server kecil tidak ikut tampil, tapi URUTAN kejar-kejarannya (peringkat)
    // TETAP SAMA: pemain -> game -> poin.
    //
    // BATAS 20 SERVER (permintaan pemilik 2026-10-04): daftar cukup 20
    // teratas - halaman tidak perlu menampung ratusan server.
    .filter((s) => Boolean(s.invite) && Number(s.players) >= 20)
    .slice(0, 20);
  } catch {
    return null;
  }
  });
}

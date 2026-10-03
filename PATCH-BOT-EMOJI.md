# PATCH BOT — Push Katalog Emoji ke Web

**Tanggal:** 2026-10-03 (revisi)
**Untuk:** repo bot NEXO (`E:\NEGOXIA\BOT HOSTING\NEXO`)
**Tujuan:** bot mengirim daftar emoji resminya ke web (`POST /api/bot/emojis`),
supaya web memakai emoji dari DB — bukan file `web-emojis.json` statis yang bisa basi.

Sisi **web sudah selesai & teruji**. Tinggal tambahkan pemicu push di bot.

---

## Konteks penting (dibaca dulu)

Berdasarkan `webBridge.js` yang asli, ada 3 hal yang membuat patch ini berbeda
dari versi draf pertama:

1. **`collectPublicData()` dan `collectMonitorStats()` bersifat SINKRON.**
   Di dalamnya query DB lewat `db.db.prepare(...).all()` (pgSync, sinkron).
   `collectPublicData` mengembalikan objek BIASA (bukan Promise). Jadi **jangan**
   `await` di dalamnya.

2. **`_call()` sudah async** dan sudah mengirim header `Authorization: Bearer`.
   Kita pakai itu untuk POST emoji.

3. **Emoji paling akurat diambil dari objek `client`** (Discord.js) — `client.guilds.cache`
   → `guild.emojis.cache`. Ini tersedia kapan saja (tidak perlu await).

---

## 1. Fungsi pengumpul + pengirim emoji

Tambahkan ke `utils/webBridge.js`, dekat fungsi `_emojiUrl` (sekitar baris 265).

```js
// ==========================================
// PUSH KATALOG EMOJI KE WEB (2026-10-03)
// ==========================================
// Web dulu hanya punya file web-emojis.json statis -> kalau bot/server ganti
// emoji, web tak ikut berubah. Fungsi ini mengirim katalog emoji resmi ke
// POST /api/bot/emojis (web menyimpannya di tabel web.emoji_catalog).
//
// Sumber emoji, digabung & didedupe by ID:
//   1. Semua emoji guild tempat bot berada (paling akurat & terbaru).
//   2. File docs/web-emojis.json (menjaga nama/alias yang sudah dipakai web).
//
// SINKRON: hanya membaca cache Discord.js + file lokal. Pengiriman ke web
// dilakukan SETELAH payload dirakit (async, tidak memblok siklus push).
function _collectEmojis(client) {
    const byId = new Map();

    // 1) Emoji dari guild tempat bot berada.
    try {
        if (client && client.guilds && client.guilds.cache) {
            for (const guild of client.guilds.cache.values()) {
                if (!guild || !guild.emojis || !guild.emojis.cache) continue;
                for (const em of guild.emojis.cache.values()) {
                    if (!em || !em.id || !em.name) continue;
                    const id = String(em.id);
                    if (byId.has(id)) continue;
                    byId.set(id, {
                        name: em.name,
                        id,
                        animated: Boolean(em.animated),
                        url: `https://cdn.discordapp.com/emojis/${id}.${em.animated ? 'gif' : 'png'}?size=64&quality=lossless`,
                        usage: `guild:${guild.name}`,
                        aliases: [],
                    });
                }
            }
        }
    } catch (_) { /* guild cache belum siap -> lanjut ke file */ }

    // 2) File katalog resmi (nama + alias yang dipakai web).
    try {
        const fs = require('fs');
        const path = require('path');
        const p = path.join(__dirname, '..', 'docs', 'web-emojis.json');
        if (fs.existsSync(p)) {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            for (const e of (data.emojis || [])) {
                if (!e || !e.id || !e.name) continue;
                const id = String(e.id);
                const url = (e.url && e.url.includes('cdn.discordapp.com'))
                    ? e.url
                    : `https://cdn.discordapp.com/emojis/${id}.${e.animated ? 'gif' : 'png'}?size=64&quality=lossless`;
                if (!byId.has(id)) {
                    byId.set(id, {
                        name: e.name,
                        id,
                        animated: Boolean(e.animated),
                        url,
                        usage: e.usage || '',
                        aliases: e.aliases || [],
                    });
                }
            }
        }
    } catch (_) { /* file tidak ada -> guild sudah cukup */ }

    return [...byId.values()];
}

// Kirim katalog emoji ke web. Tidak pernah melempar error.
let _lastEmojiPush = 0;
const EMOJI_PUSH_MS = 60 * 60 * 1000; // cukup 1x/jam (emoji jarang berubah)
async function _pushEmojis(client, paksa = false) {
    try {
        const now = Date.now();
        if (!paksa && now - _lastEmojiPush < EMOJI_PUSH_MS) return;
        const emojis = _collectEmojis(client);
        if (!emojis.length) return;
        const res = await _call('/api/bot/emojis', 'POST', { emojis });
        if (res.ok) _lastEmojiPush = now;
    } catch (_) { /* jangan ganggu push snapshot */ }
}
```

---

## 2. Panggil dari siklus push

Di `utils/webBridge.js`, fungsi `pushCycle(client)` (sekitar baris 1753), cari:

```js
        const res = await _call('/api/bot/stats', 'POST', payload);
        if (res.ok) { _lastPushOk = Date.now(); _stats.pushed++; }
        else { _lastError = `push: ${res.error}`; }
    } catch (e) {
```

Ubah menjadi (tambah 1 baris):

```js
        const res = await _call('/api/bot/stats', 'POST', payload);
        if (res.ok) { _lastPushOk = Date.now(); _stats.pushed++; }
        else { _lastError = `push: ${res.error}`; }
        // Push katalog emoji (dibatasi 1x/jam di dalam _pushEmojis). Fire-and-forget.
        _pushEmojis(client).catch(() => {});
    } catch (e) {
```

> `pushCycle` masih `async` (karena `_call`), jadi `_pushEmojis(client).catch(...)`
> aman. Tidak menunggu hasilnya → push snapshot tetap cepat.

### Opsional: paksa push saat admin ubah emoji

Kalau kamu mau emoji langsung tersinkron begitu emoji guild berubah (tanpa
menunggu 1 jam), panggil `_pushEmojis(client, true)` dari event
`emojiCreate`/`emojiDelete` di file event Discord.js. Contoh:

```js
const webBridge = require('../utils/webBridge');
client.on('emojiCreate', () => require('../utils/webBridge')._pushEmojis?.(client, true));
client.on('emojiDelete', () => require('../utils/webBridge')._pushEmojis?.(client, true));
```

(Kalau `_pushEmojis` belum diekspor, tambahkan ke `module.exports` di bawah.)

---

## 3. (Opsional, disarankan) Sinkronkan avatar user

Leaderboard web menampilkan avatar dari `public.users.avatar_url`. Saat ini hanya
±24 dari 232 user punya nilainya — sisanya tampil avatar default Discord (web sudah
punya fallback otomatis dari `user_id`, jadi tidak bolong).

Agar avatar **asli** muncul, bot perlu mengisi `avatar_url`. Bot sudah punya
fungsi `db.setProfileCache(userId, username, avatarUrl)` (lihat
`collectUserProfile` di webBridge) yang menulis ke tabel cache profil, **bukan**
langsung ke `users.avatar_url`. Jadi cara paling aman: di tempat bot menangani
interaksi/skor, tambahkan:

```js
// Simpan avatar fresh supaya web tidak menampilkan avatar default.
try {
    const u = interaction.user;
    const avatarUrl = typeof u.displayAvatarURL === 'function'
        ? u.displayAvatarURL({ extension: 'png', size: 128 }) : null;
    if (avatarUrl) db.setProfileCache(u.id, u.username, avatarUrl);
} catch (_) {}
```

> Catatan: ini **opsional**. Web sudah menampilkan avatar default Discord yang
> benar (dihitung dari `user_id`) kalau `avatar_url` kosong.

---

## Cara uji setelah patch

1. Restart bot.
2. Paksa push sekali (panggil `_pushEmojis(client, true)` dari console bot, atau
   tunggu ≤1 jam).
3. Cek di web: `GET https://<web>/api/emojis` → `count` harus berubah (mensinkron
   emoji guild + file docs). Tidak perlu deploy web.
4. Buka `/shop`, `/leaderboard` — ikon emoji tetap muncul (sekarang dari DB,
   fallback JSON otomatis kalau DB kosong).

Kalau gagal, cek:
- `POST /api/bot/emojis` butuh header `Authorization: Bearer <BOT_API_KEY>` —
  sudah dikirim otomatis oleh `_call()`.
- Web harus bisa diakses (`WEB_URL` di env bot) dan `BOT_API_KEY` bot = yang di Vercel.

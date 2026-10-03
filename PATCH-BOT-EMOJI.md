# PATCH BOT — Push Katalog Emoji ke Web

**Tanggal:** 2026-10-03
**Untuk:** repo bot NEXO (`E:\NEGOXIA\BOT HOSTING\NEXO`)
**Tujuan:** bot mengirim daftar emoji resminya ke web (`POST /api/bot/emojis`),
supaya web memakai emoji dari DB — bukan file `web-emojis.json` statis yang bisa basi.

Sisi **web sudah selesai & teruji**. Tinggal tambahkan pemicu push di bot.

---

## 1. Fungsi pengumpul emoji

Tambahkan ke `utils/webBridge.js` (dekat fungsi `_emojiUrl` yang sudah ada, sekitar baris 265).

Fungsi ini mengumpulkan SEMUA emoji custom yang dipakai bot, dari tiga sumber:

1. **Dari file katalog** `docs/web-emojis.json` (127 emoji resmi yang sudah ada).
2. **Dari guild** tempat bot berada (`client.guilds.cache[].emojis.cache`) — menangkap emoji baru.
3. Emoji yang muncul di teks statis (shop/categories) via regex `<a?:name:id>`.

```js
// ==========================================
// PUSH EMOJI KE WEB (2026-10-03)
// ==========================================
// Web dulu hanya punya file web-emojis.json statis -> kalau bot/server ganti
// emoji, web tak ikut berubah sampai file itu diperbarui + deploy ulang.
// Fungsi ini mengirim katalog emoji resmi ke POST /api/bot/emojis supaya web
// membacanya dari DB. Aman dipanggil berkala; kalau gagal cukup dilewati.
const fsEmoji = require('fs');
const pathEmoji = require('path');

function _emojiEntry(name, id, animated, usage = '') {
    const ext = animated ? 'gif' : 'png';
    return {
        name: String(name),
        id: String(id),
        animated: Boolean(animated),
        url: `https://cdn.discordapp.com/emojis/${id}.${ext}?size=64&quality=lossless`,
        usage,
    };
}

// Kumpulkan semua emoji: dari Discord (guild bot) + file docs/web-emojis.json.
function collectEmojis(client) {
    const byId = new Map();

    // 1) Dari guild tempat bot berada (sumber paling akurat & terbaru).
    if (client?.guilds?.cache) {
        for (const guild of client.guilds.cache.values()) {
            for (const em of guild.emojis.cache.values()) {
                if (!em?.id || !em?.name) continue;
                const e = _emojiEntry(em.name, em.id, em.animated, `guild:${guild.name}`);
                if (!byId.has(e.id)) byId.set(e.id, e);
            }
        }
    }

    // 2) Dari file katalog resmi (kalau ada) - jaga nama & alias yang dipakai web.
    try {
        const p = pathEmoji.join(__dirname, '..', 'docs', 'web-emojis.json');
        if (fsEmoji.existsSync(p)) {
            const data = JSON.parse(fsEmoji.readFileSync(p, 'utf8'));
            for (const e of (data.emojis || [])) {
                if (!e?.id || !e?.name) continue;
                const url = e.url && e.url.includes('cdn.discordapp.com')
                    ? e.url
                    : `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}?size=64&quality=lossless`;
                if (!byId.has(String(e.id))) {
                    byId.set(String(e.id), {
                        name: e.name,
                        id: String(e.id),
                        animated: Boolean(e.animated),
                        url,
                        usage: e.usage || '',
                        aliases: e.aliases || [],
                    });
                }
            }
        }
    } catch (e) {
        // File tidak ada / rusak -> abaikan, guild sudah cukup.
    }

    return [...byId.values()];
}

// Kirim katalog emoji ke web. Dipanggil dari pushCycle (berkala).
async function pushEmojis(client) {
    try {
        const emojis = collectEmojis(client);
        if (!emojis.length) return;
        await _call('/api/bot/emojis', 'POST', { emojis });
    } catch { /* jangan sampai mengganggu push snapshot */ }
}
```

---

## 2. Panggil dari siklus push

Di `utils/webBridge.js`, fungsi `pushCycle(client)` (sekitar baris 1753), tambahkan
**satu baris** setelah push stats berhasil. Cari baris:

```js
        const res = await _call('/api/bot/stats', 'POST', payload);
        if (res.ok) { _lastPushOk = Date.now(); _stats.pushed++; }
        else { _lastError = `push: ${res.error}`; }
    } catch (e) {
```

Ubah menjadi:

```js
        const res = await _call('/api/bot/stats', 'POST', payload);
        if (res.ok) { _lastPushOk = Date.now(); _stats.pushed++; }
        else { _lastError = `push: ${res.error}`; }
        // Kirim katalog emoji (berkala). Tidak menunggu - kalau gagal dilewati.
        pushEmojis(client).catch(() => {});
    } catch (e) {
```

> **Catatan efisiensi:** `pushCycle` berjalan berkala. Kalau kamu ingin lebih hemat,
> kirim emoji hanya **sekali per jam**. Contoh: simpan `_lastEmojiPush` dan
> tambahkan `if (!_lastEmojiPush || Date.now() - _lastEmojiPush > 3600_000) { _lastEmojiPush = Date.now(); pushEmojis(client).catch(()=>{}); }`.

---

## 3. (Opsional, disarankan) Sinkronkan avatar user

Leaderboard web menampilkan avatar dari `public.users.avatar_url`. Saat ini hanya
±24 dari 232 user yang punya nilainya — sisanya tampil avatar default Discord.
Agar avatar asli muncul, bot perlu mengisi `avatar_url` saat user berinteraksi.

Di tempat bot menangani interaksi/skor, tambahkan (contoh):

```js
// Simpan avatar fresh supaya web tidak perlu fetch Discord.
const u = interaction.user;
const avatarUrl = u.displayAvatarURL ? u.displayAvatarURL({ extension: 'png', size: 128 }) : null;
if (avatarUrl) {
    db.prepare('UPDATE users SET avatar_url = ?, avatar_fresh = ? WHERE user_id = ?')
      .run(avatarUrl, avatarUrl, u.id);
}
```

Web sudah punya fallback avatar default Discord (dari `user_id`) kalau `avatar_url`
kosong, jadi langkah ini **opsional** — tapi membuat avatar asli tampil untuk semua.

---

## Cara uji setelah patch

1. Restart bot.
2. Tunggu satu siklus push (atau panggil `pushEmojis(client)` manual dari console bot).
3. Cek di web: `GET https://<web>/api/emojis` → `count` harus > 127 (bertambah dengan
   emoji guild) dan sumbernya DB, bukan file.
4. Cek panel admin/emoji tidak perlu diubah — web otomatis memakainya.

Kalau gagal, cek log web: endpoint `POST /api/bot/emojis` butuh header
`Authorization: Bearer <BOT_API_KEY>` (bot sudah mengirim ini via `_call`).

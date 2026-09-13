# NEXO Games — Website

Website resmi **NEXO Games**, bot Discord gaming dengan 26 mini-game, ekonomi poin,
guild war, bank, shop, dan leaderboard. Dikembangkan oleh **XurbayBase** studio.

Bukan sekadar landing page — ini **dashboard real-time yang di-feed data oleh bot**
via 3 endpoint bridge (`/api/bot/stats`, `/api/bot/queue`, `/api/bot/ack`), dengan
**login Discord OAuth**, **redeem code**, dan **admin panel berfungsi penuh**.
Kontrak API 100% sesuai `utils/webBridge.js` di repo bot — jangan diubah.

Stack: [Next.js](https://nextjs.org) 16 (App Router) + Tailwind CSS v4 + Turso (libsql).
SEO-first: metadata API, sitemap, robots, JSON-LD structured data.

## Halaman

| Route | Auth | Deskripsi |
|---|---|---|
| `/` | publik | Landing + strip statistik live dari snapshot bot |
| `/leaderboard` | publik | Top 10 pemain, guild terkuat, para terkaya (snapshot) |
| `/shop` | publik | Katalog item + harga + badge Flash Sale (read-only) |
| `/bank` | publik | Bank Watch: tunggakan + 50 hutang terberat |
| `/premium` | publik | NEXO Pass Rp 20.000/bulan + 8 perk |
| `/redeem` | login | Klaim kode promo (rate limit 5/menit) |
| `/me` | login | Profil: poin, XP, streak, inventori, misi, riwayat, guild |
| `/admin` | admin | Dashboard, Ekonomi, Shop, Bank, NEXO Pass, Redeem, Log |
| `/privacy-policy` | publik | Kebijakan Privasi |
| `/robots.txt`, `/sitemap.xml` | publik | Generated otomatis |

## Kontrak API (sesuai webBridge.js bot)

- `POST /api/bot/stats` — bot push snapshot tiap 60s (Bearer auth, prune >30 hari)
- `GET /api/bot/queue` — bot tarik antrean tiap 15s (max 50 commands + 20 data_requests)
- `POST /api/bot/ack` — bot lapor hasil eksekusi + isi profil user
- `POST /api/redeem` — user klaim kode (validasi: format → rate limit → sudah klaim → kuota;
  lolos = catat klaim + antrekan `add_points`/`add_item` + refresh profil)
- `POST /api/me/refresh` — minta bot kirim ulang profil (poll `/api/me` tiap 5 dtk)
- `POST /api/admin/command` — antrekan aksi (whitelist persis ALLOWED_ACTIONS bot)
- `GET /api/admin/data` — snapshot + series 7 hari + activity log

Semua `/api/bot/*` wajib header `Authorization: Bearer <BOT_API_KEY>` — salah/kosong = 401.

## Testing tanpa bot asli

```bash
node scripts/fake-bot.js   # push/poll/ack dummy ke http://localhost:3000
WEB_URL=http://localhost:3457 node scripts/fake-bot.js
```

Simulator mem-push snapshot dummy, mengeksekusi antrean (semua `done`), dan mengisi
profil user — semua halaman bisa dites end-to-end sebelum bridge asli dinyalakan.
Tanpa OAuth di dev, `/api/auth/login` membuat session demo admin otomatis
(blokir di production kecuali `ALLOW_DEV_LOGIN=true` — jangan pernah aktifkan di produksi).

## Env (Vercel)

```
BOT_API_KEY=          # sama persis dengan .env bot
TURSO_URL=            # libsql://xxx.turso.io (kosong = fallback file SQLite .data/ untuk dev)
TURSO_AUTH_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=https://domain/api/auth/callback
SESSION_SECRET=       # random 32 char
ADMIN_DISCORD_IDS=    # discord id, pisah koma
NEXT_PUBLIC_BOT_INVITE=https://discord.com/oauth2/authorize?...
NEXT_PUBLIC_SITE_URL=https://domain-kamu.com   # canonical/sitemap/OG
```

## Menjalankan

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start       # serve build produksi
```

## Catatan

- Emoji custom bot dipakai langsung dari CDN Discord via `app/lib/emojis.js`
  (server) / `emojisClient.js` (client) — resolve by `name` lalu `aliases` dari `web-emojis.json`.
- Emoji poin resmi = `goldcoin`; emoji premium resmi = `download3` (konsisten dengan nxhelp).
- Aksi destruktif admin (set_points, giveaway, restock_all, delete_promo, revoke_premium,
  clear_loan) wajib lewat modal konfirmasi.
- Web TIDAK pernah menulis ke SQLite bot — semua tulisan masuk tabel antrean `bot_commands`.

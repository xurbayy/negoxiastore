# GO-LIVE CHECKLIST — NEXO Games Web

Semua kode sudah siap. Yang tersisa hanya **4 nilai env dari kamu** + deploy.
Ikuti urutan ini.

---

## LANGKAH 1 — Turso (database produksi)

Buat DB gratis di [turso.app](https://turso.app) (login pakai GitHub):

```bash
# install CLI sekali: curl -sSfL https://get.tur.so/install.sh | bash
turso db create nexo-web
turso db show nexo-web --url          # -> TURSO_URL
turso db tokens create nexo-web       # -> TURSO_AUTH_TOKEN
```

Tidak perlu bikin tabel manual — web auto-buat skema saat request pertama.

## LANGKAH 2 — Discord OAuth (login member)

1. Buka [Discord Developer Portal](https://discord.com/developers/applications) → aplikasi bot **1497924277301936300**
2. Tab **OAuth2 → Redirects** → tambah:
   `https://nexogamess.vercel.app/api/auth/callback`
3. Copy **Client Secret** → itu `DISCORD_CLIENT_SECRET`

`DISCORD_CLIENT_ID` sudah benar: `1497924277301936300`.

## LANGKAH 3 — Midtrans (pembayaran NEXO Pass)

1. Daftar/login [dashboard.midtrans.com](https://dashboard.midtrans.com)
2. **Settings → Access Keys** → copy:
   - `MIDTRANS_SERVER_KEY` (mulai dari SB-Mid-server... / sandbox)
   - `MIDTRANS_CLIENT_KEY`
3. `MIDTRANS_IS_PRODUCTION=false` dulu (sandbox), test pakai QRIS sandbox,
   baru ganti `true` + key production saat mau live beneran.
4. **Setelah deploy** (langkah 4): Settings → Configuration → Payment Notification URL:
   `https://nexogamess.vercel.app/api/payment/webhook`

## LANGKAH 4 — Deploy ke Vercel

1. Push repo ini ke GitHub → import di [vercel.com](https://vercel.com/new)
   (atau `npx vercel` dari folder project)
2. Set **Environment Variables** (Production) — copy semua nilai di bawah:

```
BOT_API_KEY          = (SAMA dengan .env bot — ambil dari file .env bot lokal, JANGAN commit ke git)
TURSO_URL            = (dari langkah 1)
TURSO_AUTH_TOKEN     = (dari langkah 1)
DISCORD_CLIENT_ID    = 1497924277301936300
DISCORD_CLIENT_SECRET= (dari langkah 2)
DISCORD_REDIRECT_URI = https://nexogamess.vercel.app/api/auth/callback
SESSION_SECRET       = (lihat .env.local lokal, sudah digenerate)
ADMIN_DISCORD_IDS    = 836383639439671366
ADMIN_USERNAME       = xurbaybase
ADMIN_PASSWORD_HASH  = (lihat .env.local lokal, SUDAH di-escape \$ — di Vercel pakai
                        hash ASLI tanpa escape: ganti \$ -> $)
NEXT_PUBLIC_BOT_INVITE = https://discord.com/oauth2/authorize?client_id=1497924277301936300&scope=bot+applications.commands&permissions=277025508352
NEXT_PUBLIC_SITE_URL = https://nexogamess.vercel.app
NEXT_PUBLIC_ADMIN_IDS= 836383639439671366
MIDTRANS_SERVER_KEY  = (dari langkah 3)
MIDTRANS_CLIENT_KEY  = (dari langkah 3)
MIDTRANS_IS_PRODUCTION = false
```

> **CATATAN**: `BOT_API_KEY` TIDAK ditulis di file ini (nilai asli ada di
> `.env bot` dan `.env.local web` — dua-duanya wajib SAMA PERSIS). File ini
> ikut ke-commit ke git, jadi jangan pernah tempel secret di sini.

**PENTING**: `ADMIN_PASSWORD_HASH` di .env.local pakai escape `\$` karena
dotenv-expand lokal. Di Vercel masukkan **hash asli** (karakter `$` polos).
Hash aslinya bisa dilihat dengan: buka `.env.local`, hapus semua `\` di baris
ADMIN_PASSWORD_HASH.

3. Deploy → buka `https://nexogamess.vercel.app`

## LANGKAH 5 — Nyalakan bridge bot

`.env` bot sudah benar (`WEB_URL=https://nexogamess.vercel.app`,
`BOT_API_KEY` sama dengan Vercel). Tinggal **restart bot** → console bot akan
muncul `[WEB-BRIDGE] Hidup -> https://nexogamess.vercel.app (push 60s, poll 15s)`.

Dalam 1 menit: Home web menampilkan angka asli (player, poin beredar, NEXO Pass).
FAIR-TIME premium sudah aktif otomatis (hook shutdown ada di index.js bot).

## LANGKAH 6 — Midtrans webhook URL

Di dashboard Midtrans (langkah 3.4), isi Payment Notification URL:
`https://nexogamess.vercel.app/api/payment/webhook`

Test beli NEXO Pass pakai QRIS sandbox → order jadi `paid` → `grant_premium`
masuk antrean → premium aktif in-game ≤ 30 detik.

---

## YANG AKU BUTUH DARI KAMU (ringkasan)

| # | Butuh | Dari mana | Dipakai untuk |
|---|---|---|---|
| 1 | `TURSO_URL` + `TURSO_AUTH_TOKEN` | turso.app (CLI 2 perintah) | Database web |
| 2 | `DISCORD_CLIENT_SECRET` | Discord Developer Portal → OAuth2 | Login member |
| 3 | Redirect URI ditambah di app Discord | sama dengan #2 | Callback login |
| 4 | `MIDTRANS_SERVER_KEY` + `MIDTRANS_CLIENT_KEY` | dashboard.midtrans.com → Access Keys | Beli NEXO Pass |
| 5 | Deploy ke Vercel + set env di atas | vercel.com | Hosting web |
| 6 | Restart bot setelah web live | hosting bot | Bridge nyala |

Yang TIDAK aku butuhkan: password Discord kamu, token bot, atau akses hosting.
Yang di atas semuanya nilai yang kamu tempel sendiri ke dashboard masing-masing.

## Setelah live — verifikasi cepat

- [ ] Buka home → angka player/poin asli muncul ≤ 1 menit
- [ ] Klik Login → OAuth Discord → /me terisi profil asli
- [ ] Admin: `/admin/login` (username xurbaybase / password yang kamu set) → dashboard jalan
- [ ] Redeem kode test → poin masuk in-game ≤ 30 detik
- [ ] Beli NEXO Pass sandbox → webhook → premium aktif in-game
- [ ] Ganti `MIDTRANS_IS_PRODUCTION=true` + key production saat siap terima uang beneran

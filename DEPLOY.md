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
   `https://nexogames.site/api/auth/callback`
3. Copy **Client Secret** → itu `DISCORD_CLIENT_SECRET`

`DISCORD_CLIENT_ID` sudah benar: `1497924277301936300`.

## LANGKAH 3 — Pembayaran NEXO Pass (QRIS manual)

Pembayaran NEXO Pass TIDAK memakai payment gateway. Alurnya manual QRIS:

1. Gambar QRIS statis ada di `public/images/qris.png` (aset milik user).
2. Pembeli scan QRIS di halaman `/premium`, isi **Nama Pengirim** + upload
   bukti transfer (maks 1MB), lalu submit.
3. Order masuk sebagai `pending` (gateway `manual`). Bot DM admin
   (`ADMIN_DISCORD_IDS`) dengan lampiran bukti transfer.
4. Admin menyetujui dari panel admin → premium aktif + notifikasi ke pembeli.

Tidak ada key apa pun yang perlu diisi untuk langkah ini.

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
DISCORD_REDIRECT_URI = https://nexogames.site/api/auth/callback
SESSION_SECRET       = (lihat .env.local lokal, sudah digenerate)
ADMIN_DISCORD_IDS    = 836383639439671366
ADMIN_USERNAME       = xurbaybase
ADMIN_PASSWORD_HASH  = (lihat .env.local lokal, SUDAH di-escape \$ — di Vercel pakai
                        hash ASLI tanpa escape: ganti \$ -> $)
NEXT_PUBLIC_BOT_INVITE = https://discord.com/oauth2/authorize?client_id=1497924277301936300&scope=bot+applications.commands&permissions=277025508352
NEXT_PUBLIC_SITE_URL = https://nexogames.site
NEXT_PUBLIC_ADMIN_IDS= 836383639439671366
TURNSTILE_SECRET_KEY = (dari dashboard Cloudflare Turnstile)
NEXT_PUBLIC_TURNSTILE_SITE_KEY = (dari dashboard Cloudflare Turnstile)
```

> **CATATAN**: `BOT_API_KEY` TIDAK ditulis di file ini (nilai asli ada di
> `.env bot` dan `.env.local web` — dua-duanya wajib SAMA PERSIS). File ini
> ikut ke-commit ke git, jadi jangan pernah tempel secret di sini.

**PENTING**: `ADMIN_PASSWORD_HASH` di .env.local pakai escape `\$` karena
dotenv-expand lokal. Di Vercel masukkan **hash asli** (karakter `$` polos).
Hash aslinya bisa dilihat dengan: buka `.env.local`, hapus semua `\` di baris
ADMIN_PASSWORD_HASH.

3. Deploy → buka `https://nexogames.site`

## LANGKAH 5 — Nyalakan bridge bot

`.env` bot sudah benar (`WEB_URL=https://nexogames.site`,
`BOT_API_KEY` sama dengan Vercel). Tinggal **restart bot** → console bot akan
muncul `[WEB-BRIDGE] Hidup -> https://nexogames.site (push 60s, poll 15s)`.

Dalam 1 menit: Home web menampilkan angka asli (player, poin beredar, NEXO Pass).
FAIR-TIME premium sudah aktif otomatis (hook shutdown ada di index.js bot).

## LANGKAH 6 — Uji beli NEXO Pass (QRIS manual)

Buka `/premium` → scan QRIS → upload bukti → submit. Cek DM admin menerima
lampiran bukti, lalu setujui dari panel admin → premium aktif in-game ≤ 30 detik.

---

## YANG AKU BUTUH DARI KAMU (ringkasan)

| # | Butuh | Dari mana | Dipakai untuk |
|---|---|---|---|
| 1 | `TURSO_URL` + `TURSO_AUTH_TOKEN` | turso.app (CLI 2 perintah) | Database web |
| 2 | `DISCORD_CLIENT_SECRET` | Discord Developer Portal → OAuth2 | Login member |
| 3 | Redirect URI ditambah di app Discord | sama dengan #2 | Callback login |
| 4 | `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile | Captcha redeem & login admin |
| 5 | Hostname `nexogames.site` (+ `www`) ditambah di widget Turnstile | Cloudflare Turnstile | Captcha dikenali di domain baru |
| 6 | Custom domain `nexogames.site` dipasang di Vercel | Settings → Domains | Domain publik |
| 7 | Deploy ulang Vercel + set env di atas | vercel.com | Hosting web |
| 8 | Restart bot setelah web live | hosting bot | Bridge nyala |

Yang TIDAK aku butuhkan: password Discord kamu, token bot, atau akses hosting.
Yang di atas semuanya nilai yang kamu tempel sendiri ke dashboard masing-masing.

## Setelah live — verifikasi cepat

- [ ] Buka home → angka player/poin asli muncul ≤ 1 menit
- [ ] Klik Login → OAuth Discord → /me terisi profil asli
- [ ] Admin: `/admin/login` (username xurbaybase / password yang kamu set) → dashboard jalan
- [ ] Captcha Turnstile muncul & lolos di halaman Redeem dan login admin
- [ ] Redeem kode test → poin masuk in-game ≤ 30 detik
- [ ] Beli NEXO Pass → bukti masuk DM admin → approve → premium aktif in-game

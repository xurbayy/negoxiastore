# KONTEKS PROYEK NEXO — dari awal sampai sekarang

Dokumen ini merangkum SELURUH konteks proyek NEXO Games (web + bot) dari nol:
apa yang dibangun, aturan yang mengikat, arsitektur, dan semua keputusan yang
sudah final. Tujuannya supaya siapa pun (termasuk sesi baru) bisa langsung
nyambung tanpa menggali history panjang.

Ditulis: 14 September 2026. Sumber: kode aktual di repo (bukan hafalan).

---

## 1. Apa itu NEXO

NEXO Games adalah **bot Discord gaming** berbahasa Indonesia: 25+ mini-game
(solo, multiplayer PvP betting, co-op raid, autochess), ekonomi poin virtual,
bank + pinjaman, guild war, shop, leaderboard, misi harian, dan NEXO Pass.

Yang membangun: **xurbaybase** (studio/tim). Discord ID owner: `<836383639439671366>`.

Ada **dua repo** yang saling terhubung:

| Repo | Path lokal | Peran |
|---|---|---|
| Bot | `E:\NEGOXIA\BOT HOSTING\NEXO` | Sumber kebenaran data pemain, eksekutor game |
| Web | `E:\NEGOXIA\negoxiaweb\negoxiastore` | Wajah publik + dashboard real-time + panel admin |

Repo web sudah di GitHub: `github.com/xurbayy/negoxiastore` (branch `main`).

**Aturan pemisahan yang mengikat:** web TIDAK PERNAH menyentuh database SQLite
bot. Semua komunikasi lewat endpoint HTTP bridge; semua perintah web masuk
tabel antrean `bot_commands`, dieksekusi bot, hasilnya dikembalikan via `ack`.

---

## 2. Stack & cara jalan

**Web:** Next.js 16 (App Router) + Tailwind CSS v4 + Turso (libsql) + Cloudflare
Turnstile + Discord OAuth2 + jose (JWT).

> PENTING: Next.js versi ini punya perubahan breaking vs yang umum. Sebelum
> menulis kode web, baca `node_modules/next/dist/docs/`. Contoh yang sudah
> kejadian: `middleware.js` sudah diganti `proxy.js`; `searchParams` adalah
> Promise (`await searchParams`); `cookies()` async.

**Bot:** discord.js + better-sqlite3-multiple-ciphers (SQLite terenkripsi
SQLCipher, key dari env `DB_ENCRYPTION_KEY`). Node.

Port dev lokal FINAL: **localhost:3000**. User menjalankan web dengan
`npm start` (serve `.next`), jadi **setiap perubahan wajib `npm run build` +
restart** (kalau tidak, chunk CSS/JS basi → error aneh di browser).

---

## 3. Arsitektur jembatan bot ↔ web (paling penting)

Tiga endpoint, semuanya autentikasi `Authorization: Bearer <BOT_API_KEY>`
(nilai SAMA PERSIS di `.env` bot dan `.env.local` web; tanpa/salah = 401):

| Endpoint | Arah | Isi |
|---|---|---|
| `POST /api/bot/stats` | bot → web | Push snapshot (leaderboard, shop, monitor, promoCodes, premiumMembers, dsb) tiap ±60 detik |
| `GET /api/bot/queue` | bot → web | Bot tarik antrean: maks 50 `bot_commands` + 20 `data_requests` |
| `POST /api/bot/ack` | bot → web | Bot lapor hasil eksekusi + isi profil user yang diminta |

Di sisi bot, logika ini ada di `utils/webBridge.js`. Polling **adaptif**:
cepat (2-5 dtk) saat ada aktivitas/antrean mendesak, santai (30 dtk) saat sepi.
Memori proses web menyimpan snapshot terakhir; kalau DB error, dipakai cache
≤5 menit supaya halaman tidak mati.

**Anti-nyangkut:** `nextPollMs` dipaksa 1000ms kalau ada `grant_premium` atau
`redeem_promo_web` (duit user sudah masuk, jangan sampai lama).

---

## 4. Dua arah notifikasi

1. **Web → bot (antrean):** semua aksi admin/user jadi baris di `bot_commands`.
   Bot mengeksekusi lalu menulis hasil ke kolom `status` + `result`.
2. **Bot → user (notifikasi):** bot menulis ke tabel notifikasi profil
   (`nxprofile`). Web juga punya tabel sendiri: `web_notifications` +
   `notif_reads` + `web_notif_dismiss`, tampil sebagai lonceng di navbar.

Aturan notifikasi final: **clear/dismiss bersifat PERMANEN di DB per user**,
key turunan mengandung identitas konten (jadi notif baru tetap muncul).
`localStorage` sudah dibuang dari alur notifikasi.

**Emoji di notifikasi/teks web: DILARANG.** Judul notif, toast panel admin,
label status — semua polos tanpa emoji dekoratif (pakai SVG ikon kalau perlu).

---

## 5. Auth (member, admin, 2FA)

**Member:** Discord OAuth2 → callback membuat JWT `nexo_session`.
Cookie: httpOnly, sameSite=lax, **maxAge 30 hari** (dulu session-cookie yang
hilang saat browser ditutup → user merasa web "lupa premium" tiap buka HP).

**Admin:** dua jalur.
- Jalur utama: Discord, hanya ID di `ADMIN_DISCORD_IDS`.
- Cadangan: username + password (`ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH`
  bcrypt), form di `/admin/login`, kini ber-**captcha Turnstile** (widget sama
  seperti di Redeem) dan punya toggle lihat/sembunyi password.

**2FA admin (TOTP / Google Authenticator):** implementasi murni `node:crypto`
di `app/lib/totp.js` (6 digit, 30 dtk, window ±1; lolos vektor RFC 6238).
Cookie pendukung di `app/lib/admin-2fa.js`:
- `nexo_admin_pending` — JWT 10 menit, artinya sudah lulus langkah 1.
- `nexo_admin_trusted` — JWT 30 hari, dibuat HANYA setelah lulus TOTP, dari
  opsi "ingat perangkat ini" (default aktif).

Halaman langkah 2: `/admin/verify`. **Kedua jalur** (Discord & password)
kena gerbang 2FA ini. Kalau perangkat sudah tepercaya, kode tidak diminta lagi.
"Keluar Panel" mencabut cookie tepercaya.

Env: `ADMIN_TOTP_SECRET` (base32). Ganti/hapus untuk reset 2FA.
Di Vercel WAJIB nilai yang sama supaya QR yang sudah discan tetap valid.

**Guard tepi:** `proxy.js` di root menggiring SEMUA `/admin/**` ke
`/admin/login` tanpa sesi admin valid (verifikasi signature JWT di edge;
cookie rusak = sama seperti tidak punya). `/admin/verify` lebih longgar
(boleh sesi admin ATAU cookie pending). Cek per-route tetap ada = defense in depth.

**Satu orang, satu akun.** Non-admin yang nyasar ke login admin diarahkan ke
`/no-access` (halaman 403 lucu) — tapi OAuth-nya yang sudah sah tetap dibuatkan
session member, jadi tombol "Buka Profil Gw Aja" langsung masuk `/me` tanpa
login ulang.

**`.env.local` = TURSO PRODUCTION.** Tadi ini lokal, tapi DB-nya DB asli.
Data tes/junk WAJIB dibersihkan setelah uji.

**Login admin = otomatis dapat akses `/admin`** untuk ID yang terdaftar.

---

## 6. NEXO Pass (harga, aturan, pembayaran)

Produk: **NEXO Pass Rp 20.000 / bulan**, satu paket tanpa tingkatan (tier `pro`).
Tidak ada pay-to-win — perk-nya kenyamanan: inventori unlimited, kuota harian
tambahan, akses beta, prioritas render.

**ATURAN BISNIS FINAL — JANGAN DIUBAH TANPA PERINTAH BARU:**
- **Tidak ada perpanjangan.** Sekali beli = sebulan. User yang masih premium
  melihat banner polos "Kamu sudah Premium" TANPA tombol apa pun (server juga
  menolak order baru dengan `409 premium_active`).
- Beli lagi hanya boleh setelah pass **dilepas admin** atau **jatuh tempo**.
- Pass hanya untuk akun Discord milik sendiri.

**Pembayaran = MANUAL QRIS, tanpa payment gateway** (Midtrans/Duitku sudah
ditinggalkan; dependency `midtrans-client`, env MIDTRANS_*, skrip tes lama, dan
endpoint webhook lama sudah dihapus dari repo). Alurnya:
1. `/premium` → `PremiumClient` menampilkan QRIS (`public/images/qris.png`,
   asset asli user, di-resize ~130KB), blok Discord ID pembeli, form Nama
   Pengirim + upload bukti (maks 1MB base64).
2. `POST /api/payment/manual` menyimpan order `gateway='manual'` (JSON
   `senderName/receiptBase64/receiptName` di `gateway_ref`) + mengantre
   `bot_commands` aksi **`dm_admin`** ke `<836383639439671366>`.
3. Bot DM admin dengan **lampiran gambar bukti** (validasi base64, cap 4MB,
   nama file disanitasi).
4. Panel admin tab «Pembayaran QRIS» → Terima/Tolak.
   - Approve: order `paid` + `grant_premium` (pro/30h) + `data_request` +
     notif `event` "Pembayaran Order #N Diterima" ke user.
   - Reject: order `expired` + notif "Pesanan Order #N Ditolak".
5. Order pending auto-expire setelah 24 jam saat user polling status.

**Panel QRIS v2 (aturan UI):**
- `confirm()`/`alert()` bawaan browser DILARANG di panel. Konfirmasi lewat
  `ConfirmModal` (desain panel sendiri), error tampil inline.
- Ada seksi **Riwayat Pesanan** (order selesai), bisa hapus satu per satu atau
  «Hapus Semua Riwayat». `DELETE /api/admin/manual-order`: `{orderId}` hapus
  satu, `{all:true}` hapus semua riwayat selesai — **pending tidak pernah ikut
  terhapus**.
- Order `paid` yang basi (premium sudah dicabut/expired) TIDAK memblokir form
  beli lagi — status sukses hanya dihitung bila premium aktif atau `paidAt`
  < 3 menit.

**Halaman `/premium`:** punya `AutoRefresh` (router.refresh tiap 20 dtk +
saat tab fokus). Tombol «Bayar via QRIS» SELALU dirender untuk guest; saat guest
klik → `window.location.href = '/login?returnTo=%2Fpremium'`.

**Catatan aman:** bot offline bukan penghalang — user tetap bisa submit order
(bukti tetap terlihat di panel admin), DM-nya mengantre di DB sampai bot nyala.

---

## 7. Redeem / promo

Kode promo punya: `code`, `rewardType`, `rewardValue`, `quota`, `claimed`.

**Jenis reward yang didukung: `points`, `item`, `title`, `premium`.**
- `premium` = nilai = jumlah HARI (1-3650). `redeemPromo` menulis ke tabel
  `premium` (tier `pro`, `expires_at` menumpuk via MAX).
- Di bot: `nxadmin createredeem <kode> <points/item/premium> <value> <kuota>`.
- Di web form Redeem Manager: opsi "NEXO Pass (jumlah hari)".

**Anti-over-claim:** tabel `web_promo_cache` menyimpan stok real-time +
reservasi atomik. `reserveSlot` mengunci satu slot; release kalau gagal.
Klaim `pending` >5 menit tanpa ack bot di-sweep jadi `failed` + slot dilepas.

**Fix penting (2026-09-14):** flag `exhausted` **tidak boleh sticky**. Dulu
sekali `1`, tidak pernah kembali `0` walau bot kirim data kuota masih sisa →
kode hidup tampil "HABIS" dan ditolak `/api/redeem`. Sekarang dihitung ulang
dari angka snapshot tiap push (`claimed >= quota`).

Kode baru muncul di panel admin dalam **≤1 menit** (tabel panel diisi snapshot
bot, bukan query langsung). Ini normal, bukan bug.

Redeem dari web mengantre `redeem_promo_web`; bot validasi ulang penuh lalu
menulis notifikasi ke profil user (jadi user tahu "redeem masuk" di Discord).

**Turnstile AKTIF HANYA di Redeem** (widget + verifikasi `siteverify` di
`POST /api/redeem`) dan sekarang juga di form password admin. Login/beli
tidak pakai captcha.

---

## 8. Peta tabel web (Turso)

`users`, `bot_commands`, `data_requests`, `monitor_snapshots`,
`web_redeem_claims`, `web_promo_cache`, `orders`, `webhook_events`,
`web_notifications`, `emoji_registry`, `notif_reads`, `web_feedback`,
`web_notif_dismiss`. (Dibuat otomatis oleh `schemaReady()`.)

`monitor_snapshots` menyimpan payload JSON snapshot (termasuk `promoCodes`,
`premiumMembers`, `leaderboard`, `guildBoard`, `monitor`). Ada `web_meta`,
`series` sampling per jam untuk grafik admin.

---

## 9. Whitelist aksi web → bot

Aksi yang boleh dikirim web (harus PERSIS sama dengan `ALLOWED_ACTIONS` bot di
`utils/webBridge.js`). Kalau tidak ada di daftar, bot **menolak keras**.

```
web_feedback, add_points, remove_points, set_points, giveaway, set_level,
set_streak, set_winstreak, add_item, remove_item, restock_item, restock_all,
set_price, set_discount, remove_discount, clear_loan, set_chemistry,
create_promo, delete_promo, set_maintenance, grant_premium, dm_admin,
revoke_premium, redeem_promo_web, reset_daily, reset_missions, clear_lock,
add_title, set_admin_title, clear_admin_title, set_announcement, timeout,
ban, unban, wipe
```

Catatan: `web_feedback` pakai whitelist bot; pernah tercatat ditolak sekali lalu
sekarang jalan. `set_admin_title` adalah teks bebas (emoji dicatat web via
`emoji_registry`).

---

## 10. Panel admin (web)

`/admin` = `AdminShell` (sidebar + konten). Data snapshot/log di-poll tiap 5 dtk
dengan change-detection (tanpa tombol refresh manual; ada indikator
"Live · diperbarui"). Sticky footer di dasar viewport.

Tab (grup): Pantau (Dashboard, Player Lookup, Activity Log), Ekonomi & Toko
(Ekonomi, Shop, Bank, Redeem, Pembayaran QRIS), Member (NEXO Pass, Titles),
Komunitas (Broadcast, Sanksi & Moderasi, Feedback).

- Sidebar **compact rata kiri**: logo + nama + sublabel ADMIN PANEL + divider +
  avatar + nama. Bar mobile: logo+☰ dan avatar saja (tanpa nama).
- Drawer mobile `w-64` + backdrop; area menu **scroll sendiri**, tombol
  «Keluar Panel» terkunci di dasar (fixed earlier — dulu nyangkut).
- Halaman panjang pakai paging 10/halaman + next.
- Grafik interaktif (tooltip, delta 24j, sparkline, range 24j/7h).
- TOP GAME pakai nama resmi dari `app/lib/game-meta.js` + beta dinamis
  (badge "Beta").
- TAB «BROADCAST» (info/event) terpisah dari Redeem ("Kabari Kode Baru" = token).
- Footer panel = `AdminFooter` (strip fungsional, BUKAN footer marketing publik).

Panel admin **hanya menampilkan tier pro** pada halaman NEXO Pass.

`/admin` TANPA navbar publik → spacing `pt-6` (bukan warisan `pt-28`).

---

## 11. Halaman web & aturan akses

| Route | Auth | Catatan |
|---|---|---|
| `/` | publik | Landing + statistik live. Guest: 2 kartu game. Member login: maskot melayang |
| `/leaderboard` | publik | Top 10 pemain + guild + badge NEXO Pass |
| `/shop` | publik | Katalog + harga + badge Flash Sale (read-only) |
| `/bank` | publik | Bank Watch: tunggakan + hutang terberat |
| `/premium` | publik | NEXO Pass + QRIS manual |
| `/redeem` | login | Klaim kode promo (Turnstile + rate limit) |
| `/me` | login | Profil lengkap: poin, XP, streak, inventori, misi, riwayat, guild |
| `/admin` | admin | Panel (guard `proxy.js`) |
| `/admin/login`, `/admin/verify` | publik | Login + langkah 2FA |
| `/no-access` | publik | 403 lucu untuk non-admin |
| `/login` | publik | Gerbang checkbox ketentuan sebelum tombol Discord |
| `/privacy-policy`, `/terms-of-service` | publik | Legal |
| `robots.txt`, `sitemap.xml` | publik | Generated |

**Alur login member:** `/login` → checkbox setuju Ketentuan & Privasi dulu →
tombol Discord aktif → OAuth → callback. `returnTo` didukung (validasi awalan
`/` bukan `//`, anti open-redirect).

**Link `/register` TIDAK ADA.** Perintah daftar di bot adalah **`nxd`**
(alias dari `nxdaily`), dan slash command hanya **`/help`**. Web sudah
dibetulkan untuk menyebut `nxd`, begitu juga DM bot saat data di-wipe.

---

## 12. Notifikasi & cookie

**Notifikasi user:** `/api/me/notifications` menggabungkan 2 sumber: personal
(`web_notifications`, termasuk broadcast dengan `discord_id NULL`) + turunan
dari snapshot (flash sale, promo, kode redeem yang belum diklaim).
Clear = permanen di DB per user.

**Cookie (aturan legal yang disepakati):** NEXO hanya memakai cookie
**fungsional** — sesi login, pending/trusted 2FA admin. TIDAK ada analitik,
iklan, atau cookie pihak ketiga.
- Banner cookie consent ada (kartu blur, desain sendiri), keputusan disimpan di
  `localStorage` (bukan cookie), cukup sekali per perangkat.
- Ada entri di FAQ: "Kenapa web ini memakai cookie?"
- Kebijakan Privasi punya seksi "DM dari bot, kapan dan kenapa".

---

## 13. Bahasa visual (Warm Cream Studio) — ATURAN MENGIKAT

Tema: latar krem hangat, kartu gelap ala Discord untuk header, aksen oranye.

Token tema resmi (`@theme` di `app/globals.css`):
`bg #F4EEDF`, `bg-soft #EFE7D3`, `ink #2B2118`, `ink-muted #6E6157`,
`accent #F19A1A`, `accent-hover #D98510`, `success #7BA05B`, `warning #C87F0A`,
`danger #C74B3C`, `primary #D98510`, `card-dark #1E1E26`, `card-dark-2 #2B2B35`,
`card-cream #FBF7EC`, `border-soft #E3D9C2`, `surface/surface-raised/surface-sunken`.

> Pelajaran: kelas Tailwind v4 dengan token yang TIDAK didefinisikan = tidak
> menghasilkan CSS (elemen jadi bening). Ini pernah bikin pill "Menunggu
> Verifikasi Admin" tak terlihat. Jangan pakai `[#hex]` mentah untuk warna
> tema — pakai token. `warning/primary/surface*` dulu hilang, sudah dipasang.

Aturan visual yang final:
- **Shadow hanya untuk tombol** (hover angkat + active amblas). Elemen lain flat.
- **Badge STATUS wajib solid + FLAT** (tanpa wash transparan, tanpa shadow).
  Ini permintaan tegas user: "Kamu sudah Premium", "Pembayaran diterima",
  pill "Menunggu Verifikasi Admin" — semua solid penuh.
- Tidak pakai gradasi, em-dash (—), atau eyebrow/pill hiasan di teks.
- Ikon data UI pakai **custom emoji registry** (`web-emojis.json`, resolve
  `name` → `aliases`, ada `usage`), BUKAN unicode. Tapi **label kategori UI
  polos tanpa emoji**.
- Popover/dropdown mobile lebarnya adaptif `min(20rem, 100vw - margin)`,
  jangan `w-80` fix.
- Tombol «Kembali» ada di halaman mandiri + leaderboard.

**Pill Premium di navbar:** guest/belum premium = «✦ Premium» **monochrome
(putih, seperti glyph Discord)** — user menolak emoji mahkota; sudah aktif =
«✓ Premium Aktif». Pill ini OUTLINE `bg-white`, hover terisi solid (bukan blok
solid diam).

**Pill Premium NAVBAR** live-poll `/api/me` tiap 15 dtk (pola notif) supaya
status berubah sendiri setelah grant, tanpa refresh manual.

**Status premium dibaca dari OBJEK, bukan boolean.** Bot mengirim
`profile.premium` sebagai `{tier, expiresAt, lifetime, ...}`. SEMUA pembacaan
wajib normalisasi: `p === true || (objek && (lifetime || expiresAt > now))`.
Bug lama: `=== true` membuat user premium kebaca NON-premium saat cache segar →
tombol bayar muncul untuk orang yang sudah premium. Sudah dibetulkan di
`snapshot.js`, poll Navbar, dan `PremiumClient`.

**Header `/me`:** label "profil pemain" + tombol Logout (pill Auto-sync sudah
DIHAPUS atas permintaan user).

**Hero (halaman depan):**
- Belum login → 2 screenshot kartu game (roulette + blackjack) ditumpuk.
- Sudah login → **maskot** `public/mascot.png` dengan animasi naik-turun
  (desktop: `mascotBob` 3.2s; mobile: `mascotWiggle` lebih lincah), plus
  bayangan oval yang menyusut, plus 2 bubble «np slot? Gas!» dan «Streak aman»
  yang **tampil juga di mobile** dengan animasi melayang sendiri (bergantian).
- Reduced-motion mematikan semua animasi ini.

---

## 14. Leaderboard & share

- Baris pemain bisa diklik → `PlayerProfileCard` (kartu profil mini, avatar
  fresh dari snapshot).
- **Badge NEXO Pass:** pemain dengan pass aktif menampilkan custom emoji
  `<:NEXOPASS:1548184905018507306>` (server xurbaybase) di ujung nama —
  di web (`LeaderboardClient`) DAN di bot (`nxlb`, termasuk pasangan chemistry).
  Sumber: `premiumMembers` snapshot (web) / query `premium` aktif (bot).
- **Share (wajib login):** tombol share per baris. Guest diklik → arahkan ke
  `/login?returnTo=%2Fleaderboard`. Member → render kartu peringkat 1080×1350
  (4:5) ke canvas dengan palet tema resmi, logo NEXO, emoji goldcoin/crown
  custom, lalu Web Share API (HP) atau unduh PNG + copy link (desktop).
  Komponen: `app/components/ShareCardButton.jsx`.

---

## 15. Emoji custom

Registry: `app/lib/web-emojis.json` (dedupe by ID, punya `aliases` + `usage`).
Resolve lewat `app/lib/emojis.js` (server) / `emojisClient.js` (client).
Fungsi `emojiSrc(name)` → URL CDN Discord.

Emoji penting: `goldcoin` (poin), `download3` (premium resmi), `trophy`,
`crown`, `medal`, `NEXOPASS` (pass, id `1548184905018507306`).

Aturan: token emoji mentah TANPA `emojiUrl` tidak boleh sampai ke DOM
(ShopManager admin pernah print mentah → "nyeleneh", sudah dibetulkan).

Trik: untuk mencari ID emoji custom, query Discord API pakai token bot
(`GET /guilds/{id}/emojis`) — registry web tidak selalu punya.

---

## 16. Legal (privasi & ketentuan)

Gaya penulisan yang diminta user: **profesional, santai, to the point.
TANPA tanda kurung, TANPA titik dua, TANPA huruf kapital seluruh kalimat**
(penegasan lewat pilihan kata, bukan teriakan).

Isi penting Kebijakan Privasi: hanya simpan ID Discord, username, progres
game, aktivitas ekonomi, ID server. Web login menerima ID/username/avatar.
Seksi DM bot: bot boleh kirim DM = notifikasi sistem searah saja (status
pembelian, hasil klaim promo, sanksi), tidak baca/simpan balasan, tidak ada
riwayat percakapan.

Isi penting Ketentuan: poin virtual bukan uang; sanksi timeout / ban / reset
data; **penipuan pembayaran** (bukti transfer palsu/editan, klaim palsu, bukti
milik orang lain, nominal tidak sesuai, spam pesanan) = penipuan → timeout,
dan untuk pelaku berulang/modus terencana → **ban permanen** dari bot dan web,
pass dicabut, tanpa refund.

Bot juga menegaskan ini: kartu onboarding bot punya tombol **Privasi** +
**Ketentuan** di samping «Daftar & Main» (menekan daftar = setuju), dan DM
wipe mengarahkan user mengetik `nxd` untuk daftar ulang.

---

## 17. Keamanan (yang sudah dipasang)

- CSRF nonce pada OAuth (`nexo_oauth_state`, sekali pakai).
- `SESSION_SECRET` fail-fast di production.
- Dev-login gate (mati di production meski env nyasar).
- Guard `proxy.js` di `/admin/**`.
- Rate limit + lockout pada login admin; rate limit pada redeem.
- Turnstile pada redeem + form password admin.
- Webhook signature payment.
- JWT admin & member cookie terpisah.
- Audit akhir pre-deploy pernah lolos 13/13 uji serangan live (SQLi, XSS, IDOR,
  JWT forgery, alg-none, CSRF, open-redirect, webhook-sig, rate-limit,
  prototype-injection) + load test 100 paralel API p95=103ms.

Catatan sadar: `sitemap.xml` minimal, `X-Powered-By` masih on, CSP sengaja
nonaktif.

---

## 18. Env referensi

**Web (`.env.local`, jangan commit — sudah di gitignore):**
```
BOT_API_KEY, TURSO_URL, TURSO_AUTH_TOKEN,
DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI,
SESSION_SECRET, ADMIN_DISCORD_IDS,
ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_TOTP_SECRET,
NEXT_PUBLIC_ADMIN_IDS, NEXT_PUBLIC_BOT_INVITE, NEXT_PUBLIC_SITE_URL,
NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
```
(`DUITKU_*` sudah tidak dipakai — payment manual QRIS. Boleh dibiarkan.)

**Bot (`.env`):** `DISCORD_TOKEN`, `CLIENT_ID`, `BOT_API_KEY`,
`DB_ENCRYPTION_KEY`, `OWNER_ID`, `WEB_URL`, `WEB_BRIDGE_ENABLED`,
`WEB_PUSH_INTERVAL_MS`, `WEB_POLL_INTERVAL_MS`, `WEB_POLL_IDLE_MS`,
bandwidth render (`RENDER_*`, `GIF_*`), dan `DRIVE_*` + `BACKUP_ZIP_PASSWORD`
untuk backup terenkripsi.

Hook khusus: `dotenv-expand` lokal memakan `$` di hash bcrypt → di `.env.local`
`$` harus di-escape `\$`. Di Vercel pakai hash ASLI (tanpa escape).

---

## 19. Alur deploy (ringkas)

1. **Turso** → bikin DB, ambil `TURSO_URL` + `TURSO_AUTH_TOKEN`.
2. **Discord OAuth** → tambah redirect `https://<domain>/api/auth/callback`,
   ambil `DISCORD_CLIENT_SECRET`.
3. **Vercel** → import repo, set semua env (termasuk `ADMIN_TOTP_SECRET` yang
   SAMA dengan lokal, dan `BOT_API_KEY` SAMA dengan bot).
4. **Restart bot** → console muncul `[WEB-BRIDGE] Hidup -> ...`.
5. Verifikasi: home angka muncul ≤1 menit; login OAuth; `/admin/login` +
   kode 2FA; redeem test; beli pass manual sampai DM admin masuk.

---

## 20. Status terkini & catatan penting

- **Semua masih LOKAL.** Repository web sudah ter-push ke GitHub, tapi
  belum di-deploy ke Vercel. Bot tidak pernah di-push (atas perintah user).
- Bot perlu **restart** untuk mengaktifkan perubahan lokal terakhir:
  perbaikan `wipeUser` (tabel `chemistry` pakai `user1_id`/`user2_id`, bukan
  `user_id` — dulu seluruh transaksi wipe GAGAL dengan
  `no such column: user_id`), `dm_admin` di whitelist, reward `premium`,
  badge NEXOPASS di `nxlb`, tombol Privasi/Ketentuan onboarding, DM wipe `nxd`.
- Selalu `npm run build` + restart setelah ubah web (chunk basi = bug palsu).
- Server lokal dijalankan sebagai background task `npm start` di port 3000.

---

## 21. Pelajaran dari bug nyata (biar tidak terulang)

1. **Kontrak data bot ≠ asumsi.** `profile.premium` itu objek, bukan boolean.
   Jangan pernah `=== true` pada field yang dikirim bot — cek bentuk payload
   nyata (`/api/me` + `data_requests` mentah) sebelum membandingkan.
2. **Kelas Tailwind tanpa token = tidak ada CSS.** Gejala "tak terlihat" bisa
   berarti elemennya bening, bukan kontrak warnanya jelek.
3. **Flag DB jangan sticky** kalau sumber kebenaran ada di pihak lain. Hitung
   ulang tiap sinkronisasi (`exhausted` case).
4. **Chunk basi Next.js** menyerupai bug logika (klik tidak bereaksi). Kalau
   user melaporkan "ga muncul apa-apa", curigai versi build lama dulu.
5. **Uji end-to-end membuktikan**, bukan klaim. Kalau user bertanya "ini
   beneran jalan?", buktikan dengan cek DB + browser.
6. **Tab spesifik/edge case** (`wipe` yang menyentuh tabel tanpa kolom sama)
   hanya ketemu kalau membaca skema, bukan menebak.
7. **Jangan tambah dependency** untuk hal kecil yang bisa ditulis sendiri
   (TOTP pakai `node:crypto`, share card pakai canvas murni).

---

## 22. Yang TIDAK boleh dilakukan

- Menyentuh DB SQLite bot langsung dari web.
- Menambah aksi ke web tanpa menambahkannya ke `ALLOWED_ACTIONS` bot
  (bot akan menolak senyap → user bingung).
- Memakai emoji dekoratif di notifikasi/label UI.
- Memakai `confirm()` / `alert()` bawaan di panel admin.
- Membangun ulang fitur "perpanjangan pass" (sudah dibatalkan user).
- Memakai warna `[#hex]` untuk tema alih-alih token.
- Mengaktifkan `ALLOW_DEV_LOGIN` di production.
- Menaruh secret di file yang ikut commit (`DEPLOY.md`, README).

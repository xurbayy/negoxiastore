# Deploy Web ke Vercel (setelah migrasi PostgreSQL)

## Kenapa auth gagal?

Auth web (`/api/auth/callback`) menyimpan user ke tabel `users`. Setelah pindah
ke Supabase, kegagalan terjadi karena **deploy Vercel masih memakai kode/env lama
(Turso)**. Query-nya sendiri sudah terbukti bekerja dengan kode + env baru
(diuji langsung ke Supabase: INSERT + SELECT sukses).

Penyebab lain yang mungkin:
1. `DATABASE_URL` belum diset di Vercel → web tidak bisa konek DB.
2. `TURSO_URL` masih ada di Vercel → kode lama masih dipakai.
3. `SESSION_SECRET` belum diset → `session.js` melempar error (fail-fast).
4. Tabel `web.users` belum ada di Supabase (sudah dibuat, tapi pastikan).

---

## Langkah Deploy di Vercel

### 1. Buka project Vercel
https://vercel.com/dashboard → pilih project `negoxiastore`.

### 2. Set Environment Variables
**Settings → Environment Variables**. HAPUS yang lama, ISI yang ini:

#### WAJIB (baru)
| Key | Value |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:3QJKR%408.NPytwe%23@db.uvolstwxikzxjazigfle.supabase.co:5432/postgres` |
| `PG_SCHEMA` | `web` |

> **PENTING**: password di-encode (`@` → `%40`, `#` → `%23`). Jangan pakai password mentah.

#### WAJIB (sudah ada, pastikan tetap)
| Key | Keterangan |
|---|---|
| `SESSION_SECRET` | string acak panjang (min 32 char) |
| `DISCORD_CLIENT_ID` | dari Discord Developer Portal |
| `DISCORD_CLIENT_SECRET` | idem |
| `DISCORD_REDIRECT_URI` | `https://nexogames.site/api/auth/callback` |
| `BOT_API_KEY` | sama persis dengan bot |
| `ADMIN_DISCORD_IDS` | id Discord admin (koma) |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET` | login admin |
| `GROQ_API_KEY` / `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | AI |
| `DUITKU_*`, `TURNSTILE_*`, `NEXT_PUBLIC_*` | sesuai yang sudah ada |

#### HARUS DIHAPUS (sudah tidak dipakai)
- `TURSO_URL`
- `TURSO_AUTH_TOKEN`
- `TURSO_TOKEN`

### 3. Redeploy
Deployments → **⋯ → Redeploy** (centang "Use existing Build Cache" boleh,
tapi lebih aman **uncheck** untuk build bersih).

### 4. Verifikasi
1. Buka `https://nexogames.site` → login Discord → harus berhasil masuk.
2. Buka `/admin` → login admin → dashboard harus tampil.
3. Cek status bot: hijau kalau heartbeat Supabase < 3 menit.

---

## Cara cek kalau masih gagal

**1. Lihat log Vercel**
Deployments → klik deployment → **Functions** → cari `/api/auth/callback`.

**2. Cek pesan error di URL**
Kalau gagal, web redirect ke `/?auth=gagal`. Cek log untuk detail.

**3. Cek tabel web di Supabase**
```bash
psql "postgresql://postgres:3QJKR%408.NPytwe%23@db.uvolstwxikzxjazigfle.supabase.co:5432/postgres?sslmode=require" \
  -c "SELECT COUNT(*) FROM web.users;"
```
Harus jalan (bukan error). Kalau error "relation web.users does not exist",
jalankan skema web:
```bash
psql "$DATABASE_URL" -c "CREATE SCHEMA IF NOT EXISTS web;"
psql "$DATABASE_URL" -c "SET search_path=web;" -f scripts/migrasi-pg/web_schema.pg.sql
```

**4. Cek DATABASE_URL valid**
```bash
psql "postgresql://postgres:3QJKR%408.NPytwe%23@db.uvolstwxikzxjazigfle.supabase.co:5432/postgres?sslmode=require" -c "SELECT 1;"
```

**5. Supabase: pastikan koneksi diizinkan**
Supabase → Settings → Database → Connection pooling. Kalau Vercel (serverless)
sering konek-putus, pakai **port 6543 (pooler)** alih-alih 5432:
```
postgresql://postgres.uvolstwxikzxjazigfle:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
```

---

## Catatan arsitektur

- **Bot** → schema `public` (tabel `users` = `user_id`, `points`, …)
- **Web** → schema `web` (tabel `users` = `discord_id`, `is_admin`, …)
- Adapter web otomatis set `search_path=web,public`, jadi query web mengarah ke
  tabel web. Bot tidak terpengaruh.
- Web sekarang **tidak butuh bot push** untuk statistik: baca langsung dari DB.

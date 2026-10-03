// ==========================================
// app/lib/textUtil.js
// Fungsi teks MURNI (client-safe): TIDAK mengimpor DB/Node apa pun.
// Dipisah dari snapshot.js supaya Client Component (MeClient, WelcomeBack)
// bisa memakai stripEmojiToken TANPA ikut menarik modul DB (pg) ke bundle
// browser - yang bikin build Next.js gagal setelah migrasi Postgres.
// ==========================================

// Buang token emoji Discord (<:name:id> / <a:name:id>) dari string (nama guild dll).
export function stripEmojiToken(str) {
  return String(str || '').replace(/<a?:[A-Za-z0-9_]+:\d+>/g, '').trim();
}

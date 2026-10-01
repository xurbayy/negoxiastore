// ==========================================
// app/lib/aiKonteks.js
// Rangkum snapshot bot jadi konteks untuk AI.
// ==========================================
//
// PRINSIP: AI hanya boleh menyimpulkan dari angka yang benar-benar ada.
// Jadi konteks ini disusun dari SNAPSHOT ASLI, dan tiap bagian diberi label
// satuan yang jelas. Angka yang tidak tersedia ditulis "tidak tersedia" -
// bukan dikosongkan - supaya AI tidak menebak.
//
// Yang TIDAK dikirim: data pribadi pemain (userId, avatar, dsb). AI hanya
// butuh AGREGAT. Ini juga menghemat token.
//
// Import waktu WIB di level modul (BUKAN require() di dalam fungsi - modul ini
// ESM, dan require() gagal senyap di sana sehingga bagian "WAKTU SEKARANG"
// tidak pernah terkirim; itu bug nyata yang ditemukan saat uji 2026-10-01).
import { formatWib, hariIniWib, wibKeEpoch, MOMEN } from './waktuWib';

const rupiah = (n) => Number(n || 0).toLocaleString('id-ID');
/** Rakit konteks teks dari snapshot. Dipakai baik oleh chat maupun analisis cepat. */
export function susunKonteks(snap, panel = {}) {
  if (!snap) return 'TIDAK ADA DATA. Bot belum pernah mengirim snapshot.';

  const m = snap.monitor || {};
  const L = [];

  // ---------- WAKTU (WIB) ----------
  // AI perlu tahu TANGGAL HARI INI dan tanggal momen besar supaya bisa
  // membuat pengingat yang tepat (permintaan pemilik: "ingat pake waktu WIB
  // di Indonesia Jakarta"). Tanpa ini, AI harus menghitung sendiri - dan
  // sering salah, terutama untuk tahun depan.
  try {
    const ini = hariIniWib();
    L.push('### WAKTU SEKARANG');
    L.push(`Sekarang: ${formatWib(Date.now())}`);
    // Tanggal momen yang akan datang (momen tahun ini kalau belum lewat).
    const daftarMomen = [];
    for (const [, mm] of Object.entries(MOMEN)) {
      if (!mm) continue;
      let tahun = ini.tahun;
      const lewat = ini.bulan > mm.bulan || (ini.bulan === mm.bulan && ini.tanggal > mm.tanggal);
      if (lewat) tahun += 1;
      daftarMomen.push(`${mm.nama}=${formatWib(wibKeEpoch(tahun, mm.bulan, mm.tanggal, 9, 0), false)}`);
    }
    if (daftarMomen.length) L.push('Momen mendatang: ' + [...new Set(daftarMomen)].join(', '));
    L.push('');
  } catch (_) { /* kalau modul waktu gagal, AI tetap jalan tanpa bagian ini */ }

  // ---------- Ringkasan umum ----------
  L.push('### RINGKASAN');
  // KESEGARAN DATA (fix 2026-10-01). AI perlu tahu UMUR data supaya tidak
  // menganalisis angka kemarin seolah-olah kondisi sekarang. Kalau bot mati
  // 2 jam, snapshot terakhir tetap ada - dan AI harus menyebut itu, bukan
  // berpura-pura datanya realtime.
  const umurMenit = Math.max(0, Math.round((Date.now() - Number(snap.ts)) / 60000));
  const umurTeks = umurMenit < 1 ? 'baru saja'
    : umurMenit < 60 ? umurMenit + ' menit lalu'
    : Math.round(umurMenit / 60) + ' jam lalu';
  L.push(`Snapshot dibuat: ${new Date(Number(snap.ts)).toISOString()} (${umurTeks})`);
  if (umurMenit > 3) {
    L.push(`PERINGATAN: data ini sudah berumur ${umurTeks}. Kalau pertanyaan menyangkut kondisi SEKARANG, sebutkan bahwa angkanya bisa sudah berubah.`);
  }
  L.push(`Versi bot: ${m.botVersion || '-'}`);
  L.push(`Pemain terdaftar (aktif): ${m.totalUsers ?? '-'}`);
  L.push(`Pemain terdaftar (semua, termasuk tidak aktif): ${m.totalUsersAll ?? '-'}`);
  L.push(`Total poin beredar: ${rupiah(m.totalMoney)}`);
  L.push(`Member NEXO Pass aktif: ${m.premiumCount ?? '-'}`);
  L.push(`Game dimainkan hari ini: ${m.gamesToday ?? '-'}`);
  L.push(`Game dimainkan 7 hari: ${m.gamesWeek ?? '-'}`);
  L.push(`Sesi sedang berjalan: ${Object.entries(m.live || {}).map(([k, v]) => k + "=" + v).join(", ") || "-"}`);
  L.push(`Pinjaman bank: ${Object.entries(m.loans || {}).map(([k, v]) => k + "=" + v).join(", ") || "-"}`);
  L.push(`Pemain terbanned: ${(m.bannedUsers || []).length}`);
  L.push('');

  // ---------- Server ----------
  const servers = m.servers || [];
  const invites = m.invites || {};
  const adaPemain = servers.filter((s) => (Number(s.players) || 0) > 0);
  const nolPemain = servers.filter((s) => (Number(s.players) || 0) === 0);

  L.push('### SERVER (komunitas)');
  L.push(`Total server bot: ${servers.length}`);
  L.push(`Server ADA pemainnya: ${adaPemain.length}`);
  L.push(`Server 0 pemain: ${nolPemain.length}`);
  L.push(`Server punya link invite: ${Object.keys(invites).length}`);
  L.push('10 server teramai (nama | pemain | member | game | poin):');
  for (const s of servers.slice(0, 10)) {
    L.push(`- ${s.name} | ${s.players} | ${s.members} | ${s.games} | ${rupiah(s.points)}`);
  }

  // TOP SERVER (angka murni, tanpa nama) - dikirim bot terpisah dari `servers`.
  // Berguna saat AI perlu membandingkan peringkat tanpa terpengaruh panjang
  // daftar nama server.
  const topSrv = m.topServers;
  if (Array.isArray(topSrv) && topSrv.length) {
    L.push('Peringkat server (pemain unik, angka murni): ' +
      topSrv.map((s, i) => `#${i + 1}=${s.players}`).join(', '));
  }

  // DIAGNOSA INVITE - kenapa tombol Gabung tidak muncul di sebagian server.
  // Tanpa ini, AI hanya bisa menduga ("mungkin izin kurang") padahal bot
  // sudah mencatat penyebab PASTINYA.
  const diag = m.inviteDiag;
  if (diag) {
    L.push('Diagnosa invite: gagal=' + (diag.gagal ?? 0) + ', berhasil=' + (diag.sukses ?? 0));
    if (Array.isArray(diag.alasan) && diag.alasan.length) {
      L.push('Alasan kegagalan invite: ' + diag.alasan.slice(0, 5).join('; '));
    }
  }
  L.push('');

  // ---------- Game ----------
  L.push('### GAME');
  L.push(`Top game HARI INI: ${(m.topGamesToday || []).map((g) => g.game_type + "(" + g.plays + "x)").join(", ") || "-"}`);
  L.push(`Game beta aktif: ${(snap.betaGames || []).map((b) => `${b.name} (${b.mode})`).join(', ') || '-'}`);

  // DAFTAR LENGKAP GAME YANG SUDAH ADA (fix 2026-10-01).
  //
  // KENAPA PENTING: pemilik meminta AI memberi ide game BARU yang inovatif.
  // Tanpa daftar ini, AI tidak tahu apa yang sudah dibuat - dan bisa
  // menyarankan hal yang sudah ada (mis. "bikin game tebak-tebakan" padahal
  // Fun Riddle sudah ada). Daftar ini juga jadi bahan AI untuk MENCARI CELAH:
  // genre apa yang belum ada, mekanik apa yang belum dipakai.
  //
  // Sumber: kategori toko (yang mencerminkan game yang punya item) + katalog
  // misi (game yang dipakai di misi harian). Digabung supaya lengkap.
  const gameDariKategori = (snap.shopCategories || []).map((c) => c.label || c.value);
  const gameDariMisi = [...new Set((snap.missionCatalog || []).map((x) => x.game).filter(Boolean))];
  const gameDariTop = [...new Set((m.topGamesToday || []).map((g) => g.game_type).filter(Boolean))];
  const semuaGame = [...new Set([...gameDariKategori, ...gameDariMisi, ...gameDariTop])];
  if (semuaGame.length) {
    L.push(`GAME YANG SUDAH ADA (${semuaGame.length} - JANGAN sarankan yang sudah ada): ${semuaGame.join(', ')}`);
  }

  // PREFERENSI PEMAIN: game mana yang benar-benar dimainkan, dari dua sudut:
  //   1. game_scores (berapa kali dimainkan) - minat bermain
  //   2. item terjual per game - kesediaan membelanjakan poin
  // Gabungan keduanya menunjukkan game mana yang "hidup" dan layak
  // dikembangkan/ditiru mekaniknya untuk ide baru.
  const gameDimainkan = [...(m.topGamesToday || [])]
    .sort((a, b) => (b.plays || 0) - (a.plays || 0));
  if (gameDimainkan.length) {
    L.push('Game paling sering dimainkan (hari ini): ' +
      gameDimainkan.map((g) => `${g.game_type}(${g.plays}x)`).join(', '));
  }
  // Item terjual dikelompokkan per game_type - minat BERBELANJA per game.
  const itemPerGame = {};
  for (const it of (m.itemTerjualAll || [])) {
    const kat = (snap.shopItems || []).find((s) => s.itemKey === it.itemKey);
    const g = kat?.gameType || '(tanpa game)';
    itemPerGame[g] = (itemPerGame[g] || 0) + (it.kali || 0);
  }
  const gameLaku = Object.entries(itemPerGame).sort((a, b) => b[1] - a[1]);
  if (gameLaku.length) {
    L.push('Item terjual per game (minat berbelanja): ' +
      gameLaku.slice(0, 12).map(([g, n]) => `${g}=${n}x`).join(', '));
  }
  L.push('');

  // ---------- Toko ----------
  const items = snap.shopItems || [];
  const kategori = snap.shopCategories || [];
  L.push('### TOKO');
  L.push(`Jumlah item: ${items.length} | kategori: ${kategori.length}`);
  L.push(`Kategori: ${kategori.map((c) => c.value).join(', ')}`);

  // Stok menipis = sinyal penting untuk keputusan restock/promo.
  const stokNol = items.filter((i) => Number(i.stock) === 0);
  const stokTipis = items.filter((i) => Number(i.stock) > 0 && Number(i.stock) <= 5);
  L.push(`Item stok HABIS (${stokNol.length}): ${stokNol.map((i) => i.name).join(', ') || '-'}`);
  L.push(`Item stok TIPIS <=5 (${stokTipis.length}): ${stokTipis.map((i) => `${i.name}(${i.stock})`).join(', ') || '-'}`);

  // Sebaran item per game_type -> dasar saran "promo item game X".
  const perGame = {};
  for (const i of items) {
    const g = i.gameType || '(tanpa game)';
    perGame[g] = (perGame[g] || 0) + 1;
  }
  L.push('Sebaran item per game_type: ' +
    Object.entries(perGame).map(([g, n]) => `${g}=${n}`).join(', '));
  L.push('Daftar item (nama | harga | stok | game | kategori) - 30 termurah:');
  for (const i of [...items].sort((a, b) => a.price - b.price).slice(0, 30)) {
    L.push(`- ${i.name} | ${rupiah(i.price)} | ${i.stock} | ${i.gameType || '-'} | ${i.category || '-'}`);
  }
  L.push('');

  // ---------- PENJUALAN TOKO (NYATA dari transaksi) ----------
  //
  // KENAPA INI KRUSIAL (fix 2026-10-01): sebelumnya bot MENGIRIM data ini
  // (itemTerjualAll/itemTerjualToday/totalItemTerjual/totalPoinBelanja) tapi
  // AI tidak pernah melihatnya. Akibatnya saat ditanya "item mana yang laris"
  // atau "apa yang sebaiknya dipromo", AI hanya bisa menebak dari HARGA dan
  // STOK - bukan dari penjualan nyata. Itu sumber jawaban yang terdengar
  // masuk akal tapi tidak berdasar.
  //
  // Sekarang AI melihat angka penjualan asli: berapa kali terjual, berapa
  // poin yang dibelanjakan, dan mana yang belum pernah laku sama sekali.
  L.push('### PENJUALAN TOKO (dari transaksi nyata)');
  const terjualAll = m.itemTerjualAll;
  if (terjualAll === undefined) {
    // BEDAKAN dua keadaan berbeda - jangan biarkan AI mengira "tidak ada
    // penjualan" padahal botnya cuma belum memuat kode ini.
    L.push('Bot belum mengirim data penjualan (versi lama). TIDAK BISA dinilai.');
  } else if (!terjualAll.length) {
    L.push('Belum ada penjualan item tercatat sejak fitur ini aktif (rekap mulai dari nol saat bot diperbarui).');
  } else {
    L.push('Total item terjual (sepanjang rekap): ' + (m.totalItemTerjual ?? 0));
    L.push('Total poin dibelanjakan untuk item: ' + rupiah(m.totalPoinBelanja));
    L.push('Item terlaris (nama | berapa kali | total poin):');
    for (const t of terjualAll.slice(0, 20)) {
      L.push(`- ${t.nama || t.itemKey} | ${t.kali}x | ${rupiah(t.totalPoin)} poin`);
    }

    // Item yang BELUM PERNAH laku - ini yang sering jadi target promo.
    const laku = new Set(terjualAll.map((t) => t.itemKey));
    const belumLaku = items.filter((i) => !laku.has(i.itemKey));
    if (belumLaku.length) {
      L.push(`Item BELUM PERNAH terjual (${belumLaku.length}): ` +
        belumLaku.slice(0, 25).map((i) => i.name).join(', '));
    } else {
      L.push('Semua item sudah pernah terjual minimal sekali.');
    }
  }

  // Penjualan HARI INI - untuk melihat tren, bukan cuma total.
  const terjualHariIni = m.itemTerjualToday;
  if (Array.isArray(terjualHariIni) && terjualHariIni.length) {
    const petaNama = new Map(items.map((i) => [i.itemKey, i.name]));
    L.push('Terjual HARI INI: ' + terjualHariIni.slice(0, 15)
      .map((t) => `${petaNama.get(t.itemKey) || t.itemKey}(${t.kali}x)`).join(', '));
  } else if (Array.isArray(terjualHariIni)) {
    L.push('Terjual HARI INI: belum ada penjualan.');
  }
  L.push('');

  // ---------- Promo & diskon ----------
  L.push('### PROMO');
  L.push(`Kode promo aktif: ${(snap.promoCodes || []).map((p) => p.code + "(" + (p.claimed || 0) + "/" + (p.quota || 0) + ")").join(", ") || "-"}`);
  L.push(`Flash sale aktif: ${(snap.flashSales || []).length}`);
  L.push(`Diskon aktif: ${(snap.discounts || []).length}`);
  L.push('');

  // ---------- Misi & title ----------
  L.push('### MISI & TITLE');
  L.push(`Jumlah misi: ${(snap.missionCatalog || []).length}`);
  const misiCat = {};
  for (const mi of snap.missionCatalog || []) misiCat[mi.cat] = (misiCat[mi.cat] || 0) + 1;
  L.push(`Misi per kategori: ${Object.entries(misiCat).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  L.push(`Jumlah title: ${(snap.titleCatalog || []).length} | harga: ` +
    (snap.titleCatalog || []).map((t) => `${t.key}=${rupiah(t.price)}`).join(', '));
  L.push('');

  // ---------- Ekonomi ----------
  //
  // FORMAT RINGKAS (fix 2026-10-01). Sebelumnya bagian ini memakai
  // JSON.stringify mentah. Untuk daftar 10 guild, JSON menghasilkan
  // {"name":"...","points":...,"warWins":...} - puluhan karakter teknis yang
  // tidak menambah informasi bagi AI, tapi ikut memakan jatah token. Groq
  // menolak permintaan kalau melebihi batas TPM (kejadian nyata: 8564 dari
  // 8000 token), sehingga panel AI menampilkan error.
  //
  // Sekarang ditulis sebagai daftar ringkas "nama(nilai)" - informasi yang
  // sama, jauh lebih pendek.
  L.push('### EKONOMI');
  const fmtDaftar = (arr, ambil, maks = 5) =>
    (arr || []).slice(0, maks).map(ambil).join(', ') || '-';
  L.push('Pemain terkaya: ' + fmtDaftar(snap.richest, (x) => `${x.username}(${rupiah(x.points)})`));
  L.push('Leaderboard: ' + fmtDaftar(snap.leaderboard, (x) => `${x.username}(${rupiah(x.points)})`));
  // GuildBoard: dibatasi 8 (dulu TANPA batas - sumber pembengkakan terbesar).
  L.push('Guild terkuat: ' + fmtDaftar(snap.guildBoard, (x) => `${x.name}(${rupiah(x.points)}${x.warWins ? ', ' + x.warWins + ' war' : ''})`, 8));
  L.push(`Member premium (tier): ` +
    ((snap.premiumMembers || []).length + ' orang'));
  L.push(`Judul admin dipegang: ${(m.adminTitleHolders || []).length}`);

  // ---------- DAFTAR PEMAIN ----------
  // Dikirim bot sebagai daftar RINGAN (id + nama + level) sampai 2000 pemain.
  // Tanpa ini, AI tidak bisa menjawab "pemain bernama X itu level berapa" -
  // ia hanya melihat 5 profil teratas.
  //
  // Ditulis HANYA jumlah + sampel kecil supaya konteks tidak meledak: profil
  // LENGKAP pemain teratas sudah ada di bagian PROFIL MENDALAM di bawah.
  const daftar = m.daftarPemain;
  if (Array.isArray(daftar) && daftar.length) {
    L.push(`Total pemain terdaftar di daftar: ${daftar.length}`);
    // Sampel 30 nama teratas supaya AI bisa mengaitkan nama yang disebut
    // pemilik dengan level/keberadaannya. Profil LENGKAP ada di bagian
    // PROFIL MENDALAM (5 teratas) - di sini cukup daftar ringan.
    L.push('Sampel pemain teratas (nama | level): ' +
      daftar.slice(0, 30).map((p) => `${p.username}(${p.level})`).join(', '));
  }

  // ==========================================
  // DATA OPERASIONAL (2026-09-30)
  // ==========================================
  // Permintaan pemilik: "AI harus bisa baca data realtime semuanya".
  // Sebelumnya snapshot hanya memuat angka besar, sehingga AI menjawab dengan
  // saran umum - bukan karena AI-nya kurang pintar, tapi karena bagian yang
  // menjelaskan KENAPA angka itu begitu tidak pernah dikirim.

  // ---------- Promo: mana yang gagal menarik pemain ----------
  L.push('');
  L.push('### PROMO - KLAIM PER KODE');
  const klaim = m.promoClaimStat || [];
  if (!klaim.length) {
    L.push('(belum ada klaim tercatat)');
  } else {
    // Kuota ikut ditulis supaya AI bisa menilai rasio tanpa diberi tahu.
    const petaPromo = new Map((snap.promoCodes || []).map((x) => [x.code, x]));
    for (const k of klaim) {
      const p = petaPromo.get(k.code);
      const rasio = p && p.quota ? ' (' + Math.round((k.dipakai / p.quota) * 100) + '% dari kuota)' : '';
      L.push('- ' + k.code + ': ' + k.dipakai + ' klaim' + rasio +
        (p ? ' | hadiah ' + p.rewardType + ' ' + p.rewardValue : ''));
    }
  }

  // ---------- Misi harian: metrik retensi paling langsung ----------
  L.push('');
  L.push('### MISI HARIAN');
  const ms = m.misiStat || {};
  L.push('Peserta hari ini: ' + (ms.peserta ?? '-') + ' | selesai semua: ' + (ms.selesaiSemua ?? '-'));

  // ---------- Transaksi: dari mana poin masuk, ke mana perginya ----------
  L.push('');
  L.push('### TRANSAKSI');
  const tt = m.transaksiPerTipe || [];
  if (!tt.length) {
    L.push('(belum ada transaksi)');
  } else {
    for (const t of tt) L.push('- ' + t.type + ': ' + t.jumlah + ' kali, total ' + rupiah(t.total) + ' poin');
  }
  L.push('24 jam terakhir: ' + (m.transaksi24jam?.jumlah ?? 0) + ' transaksi oleh ' +
    (m.transaksi24jam?.pemain ?? 0) + ' pemain unik');

  // ---------- Retensi & pertumbuhan ----------
  L.push('');
  L.push('### RETENSI & PERTUMBUHAN');
  L.push('Pemain aktif 24 jam: ' + (m.aktif24jam ?? 0) + ' dari ' + (m.totalUsers ?? 0) + ' terdaftar');
  L.push('Pemain baru 24 jam: ' + (m.pemainBaru24jam ?? 0));

  // ---------- Stok & item yang benar-benar dipakai ----------
  L.push('');
  L.push('### STOK & KEPEMILIKAN ITEM');
  const restok = m.restockTerakhir || [];
  L.push('Item pernah di-restock: ' + restok.length + ' jenis');
  if (restok.length) {
    L.push('Restock terakhir: ' + restok.slice(0, 8)
      .map((r) => r.itemKey + '=' + new Date(Number(r.terakhir)).toISOString().slice(0, 10)).join(', '));
  }
  const dipegang = m.itemDipegang || [];
  if (dipegang.length) {
    L.push('Item paling banyak dipegang pemain: ' + dipegang.slice(0, 10)
      .map((x) => x.itemKey + '(' + x.pemilik + ' pemilik/' + x.total + ' unit)').join(', '));
  }

  // ---------- Bank & guild ----------
  L.push('');
  L.push('### BANK & GUILD');
  L.push('Pinjaman TELAT: ' + (m.pinjamanTelat?.jumlah ?? 0) + ' (nilai ' + rupiah(m.pinjamanTelat?.nilai) + ')');
  const gs = m.guildStat || {};
  L.push('Guild: ' + (gs.total ?? 0) + ' dibuat, ' + (gs.adaAnggota ?? 0) +
    ' punya anggota, ' + (gs.warSelesai ?? 0) + ' war selesai');

  // ---------- PROFIL MENDALAM PEMAIN TERATAS ----------
  // Permintaan pemilik 2026-09-30: "data sweetsucidial kurang lengkap, gw mau
  // selengkap mungkin". Sebelumnya hanya rank + poin + level; sekarang bot
  // mengirim profil utuh 5 pemain teratas (inventory, transaksi, premium,
  // misi, guild, pinjaman, title).
  L.push('');
  L.push('### PROFIL MENDALAM PEMAIN TERATAS');
  const profil = m.profilTeratas || [];
  if (!profil.length) {
    L.push('Bot belum mengirim profil mendalam (kode lama).');
  } else {
    for (const orang of profil) {
      const p = orang?.profile;
      if (!p) continue;
      L.push('');
      L.push(`-- ${p.username} (rank global ${p.globalRank ?? '-'}) --`);
      L.push(`  Level ${p.level} | XP ${p.xp}/${p.xpNext} | poin ${rupiah(p.points)}`);
      L.push(`  Registered: ${p.registered ? 'ya' : 'belum'} | premium: ${p.premiumStatus}`);
      if (p.premium?.tier) L.push(`  Premium tier ${p.premium.tier}, berakhir ${new Date(p.premium.expiresAt).toISOString().slice(0, 10)}`);
      L.push(`  Streak harian: ${p.dailyStreak} hari | winstreak: ${p.winstreak}`);
      L.push(`  Total menang: ${rupiah(p.totalWon)} | total taruhan: ${rupiah(p.totalBet)}`);
      if (p.titleInfo?.label) L.push(`  Title: ${String(p.titleInfo.label).replace(/<[^>]+>/g, '')}`);
      if (p.adminTitle) L.push(`  Judul admin: ${String(p.adminTitle).replace(/<[^>]+>/g, '')}`);
      if (Array.isArray(p.ownedTitles)) L.push(`  Title dimiliki: ${p.ownedTitles.length}`);

      // Isi tas: apa yang benar-benar dipegang vs hanya dibeli.
      const tas = Array.isArray(p.inventory) ? p.inventory : [];
      if (tas.length) {
        L.push(`  Tas (${tas.length} jenis): ` + tas.slice(0, 10)
          .map((x) => `${x.name || x.itemKey} x${x.quantity}`).join(', '));
      } else {
        L.push('  Tas: kosong');
      }

      // Misi: apakah pemain ini benar-benar mengerjakan misi harian.
      const mis = p.missions;
      if (mis && typeof mis === 'object') {
        const selesai = Array.isArray(mis.missions)
          ? mis.missions.filter((x) => x?.done || x?.selesai || x?.claimed).length
          : (mis.selesai ?? null);
        L.push(`  Misi: ${selesai ?? '?'}/${Array.isArray(mis.missions) ? mis.missions.length : '?'} selesai` +
          (mis.claimedAll ? ' (semua diklaim)' : ''));
      }

      // Aktivitas: berapa sering main dan game apa.
      const hist = Array.isArray(p.history) ? p.history : [];
      if (hist.length) {
        L.push(`  Riwayat main (${hist.length} terakhir): ` + hist.slice(0, 6)
          .map((x) => `${x.gameType || x.game_type}(${x.points})`).join(', '));
      }

      // Riwayat transaksi: pola belanja & pemasukan.
      const tx = Array.isArray(p.transactions) ? p.transactions : [];
      if (tx.length) {
        const belanja = tx.filter((x) => x.type === 'spend');
        const masuk = tx.filter((x) => x.type !== 'spend');
        L.push(`  Transaksi terakhir: ${tx.length} tercatat (${belanja.length} keluar, ${masuk.length} masuk)`);
      }

      if (p.guild?.name) L.push(`  Guild: ${p.guild.name} (${p.guild.role || 'member'})`);
      else L.push('  Guild: tidak ikut guild');
      if (p.loan) L.push(`  Pinjaman bank: ${rupiah(p.loan.totalDue)} jatuh tempo ${new Date(p.loan.dueDate).toISOString().slice(0, 10)}`);
    }
  }

  // ---------- REFERRAL ----------
  // Bagian ini menjelaskan apakah program undang-undang BERJALAN: berapa
  // pendaftaran yang datang dari kode orang lain, dan siapa yang paling
  // banyak mengundang. Tanpa ini, AI tidak bisa menilai efektivitasnya.
  L.push('');
  L.push('### REFERRAL (undang teman)');
  const ref = m.referral;
  if (!ref) {
    L.push('Bot belum mengirim data referral (kode lama).');
  } else {
    L.push('Hadiah: pengundang 20.000 poin, yang memakai kode 5.000 poin');
    L.push('Total pemakaian kode: ' + (ref.total ?? 0) + ' kali');
    L.push('24 jam terakhir: ' + (ref.hariIni ?? 0) + ' kali');
    L.push('Total poin dibagikan: ' + rupiah(ref.totalPoin));
    const top = ref.teratas || [];
    if (top.length) {
      L.push('Pengundang terbanyak: ' + top.slice(0, 10)
        .map((x) => (x.username || x.userId) + '=' + x.jumlah + ' orang/' + rupiah(x.poin)).join(', '));
    }
  }

  // ---------- LOG ERROR ----------
  // Bagian yang sebelumnya TIDAK PERNAH bisa dibaca AI. Isinya POLA error
  // (jenis + jumlah + waktu), bukan stack trace - lihat utils/logReader.js.
  L.push('');
  L.push('### LOG ERROR (pola, bukan stack trace)');
  const lg = m.logError;
  if (!lg) {
    L.push('Bot belum mengirim rekap log (kode lama).');
  } else {
    L.push('Total error tercatat: ' + lg.totalSemua);
    for (const f of (lg.file || []).slice(0, 5)) {
      L.push(f.file + ': ' + f.total + ' baris, ' + f.jenisUnik + ' jenis');
      for (const d of (f.daftar || []).slice(0, 6)) {
        L.push('  - ' + d.jumlah + 'x ' + d.pesan +
          (d.terakhir ? ' (terakhir ' + String(d.terakhir).slice(0, 19) + ')' : ''));
      }
    }
  }


  // ==========================================
  // DATA PANEL ADMIN (2026-10-01)
  // ==========================================
  //
  // KENAPA DITAMBAHKAN: audit menemukan AI hanya membaca `snapshot`, padahal
  // panel admin menampilkan JAUH lebih banyak - pendapatan (orders), perintah
  // admin (log), keluhan pemain (feedback), dan tren 7 hari (series). Akibatnya
  // pertanyaan seperti "berapa pendapatan bulan ini" atau "keluhan apa yang
  // paling sering" TIDAK BISA dijawab AI walaupun datanya ada di panel.
  //
  // Semua bagian di bawah OPTIONAL: kalau pemanggil tidak mengirim `panel`,
  // bagian ini dilewati dengan sopan (bukan error).

  // ---------- PENDAPATAN (orders pembayaran) ----------
  const orders = panel.orders;
  if (Array.isArray(orders) && orders.length) {
    L.push('');
    L.push('### PENDAPATAN (order pembayaran)');
    const sukses = orders.filter((o) => o.status === 'paid');
    const pending = orders.filter((o) => o.status === 'pending');
    const gagal = orders.filter((o) => ['expired', 'canceled', 'failed'].includes(o.status));
    const totalSukses = sukses.reduce((s, o) => s + (Number(o.amount) || 0), 0);
    L.push(`Total order tercatat: ${orders.length}`);
    L.push(`Berhasil (paid): ${sukses.length} order, nilai ${rupiah(totalSukses)}`);
    L.push(`Menunggu (pending): ${pending.length}`);
    L.push(`Batal/kedaluwarsa: ${gagal.length}`);

    // Sebaran per gateway - berguna melihat kanal mana yang jalan.
    const perGateway = {};
    for (const o of orders) perGateway[o.gateway || '-'] = (perGateway[o.gateway || '-'] || 0) + 1;
    L.push('Per gateway: ' + Object.entries(perGateway).map(([g, n]) => `${g}=${n}`).join(', '));

    // 10 order terakhir supaya AI bisa melihat pola terbaru (bukan cuma total).
    L.push('10 order terakhir (tanggal | plan | nilai | gateway | status):');
    for (const o of orders.slice(0, 10)) {
      const tgl = o.createdAt ? new Date(Number(o.createdAt)).toISOString().slice(0, 10) : '-';
      L.push(`- ${tgl} | ${o.plan || '-'} | ${rupiah(o.amount)} | ${o.gateway || '-'} | ${o.status}`);
    }
  }

  // ---------- LOG PERINTAH ADMIN ----------
  // Isi Activity Log di panel: aksi apa yang dijalankan admin/otomatisasi,
  // berhasil atau gagal. Tanpa ini AI tidak tahu apa yang sudah/pernah dicoba.
  const log = panel.log;
  if (Array.isArray(log) && log.length) {
    L.push('');
    L.push('### LOG PERINTAH ADMIN');
    const perStatus = {};
    for (const r of log) perStatus[r.status || '-'] = (perStatus[r.status || '-'] || 0) + 1;
    L.push(`Total catatan: ${log.length} | status: ` +
      Object.entries(perStatus).map(([s, n]) => `${s}=${n}`).join(', '));

    // Aksi yang GAGAL - paling penting untuk perbaikan.
    const gagal = log.filter((r) => ['failed', 'rejected'].includes(r.status));
    if (gagal.length) {
      const perAksi = {};
      for (const r of gagal) perAksi[r.action || '-'] = (perAksi[r.action || '-'] || 0) + 1;
      L.push('Aksi GAGAL (aksi = berapa kali): ' +
        Object.entries(perAksi).map(([a, n]) => `${a}=${n}`).join(', '));
      L.push('Contoh kegagalan terakhir:');
      for (const r of gagal.slice(0, 5)) {
        const tgl = r.createdAt ? new Date(Number(r.createdAt)).toISOString().slice(0, 16).replace('T', ' ') : '-';
        L.push(`- ${tgl} ${r.action}: ${String(r.result || '').slice(0, 120)}`);
      }
    }

    // Aksi yang masih MENUNGGU - bisa menandakan bot offline.
    const pending = log.filter((r) => r.status === 'pending');
    if (pending.length) L.push(`Aksi masih MENUNGGU dieksekusi bot: ${pending.length}`);
  }

  // ---------- FEEDBACK PEMAIN ----------
  // Keluhan/masukan langsung dari pemain - sumber masalah yang tidak terlihat
  // dari angka statistik.
  const fb = panel.feedback;
  if (Array.isArray(fb) && fb.length) {
    L.push('');
    L.push('### FEEDBACK PEMAIN');
    const perKind = {};
    for (const f of fb) perKind[f.kind || '-'] = (perKind[f.kind || '-'] || 0) + 1;
    L.push(`Total feedback: ${fb.length} | jenis: ` +
      Object.entries(perKind).map(([k, n]) => `${k}=${n}`).join(', '));
    L.push('10 feedback terbaru (jenis | halaman | isi ringkas):');
    for (const f of fb.slice(0, 10)) {
      const tgl = f.createdAt ? new Date(Number(f.createdAt)).toISOString().slice(0, 10) : '-';
      L.push(`- ${tgl} | ${f.kind || '-'} | ${f.page || '-'} | ${String(f.message || '').replace(/\s+/g, ' ').slice(0, 150)}`);
    }
  }

  // ---------- TREN 7 HARI ----------
  // Angka snapshot hanya kondisi SEKARANG. Tanpa seri waktu, AI tidak bisa
  // membedakan "sedang naik" vs "sedang turun".
  const seri = panel.series;
  if (Array.isArray(seri) && seri.length >= 2) {
    L.push('');
    L.push('### TREN 7 HARI (snapshot berkala)');
    const awal = seri[0], akhir = seri[seri.length - 1];
    const delta = (k) => {
      const a = Number(awal[k]) || 0, b = Number(akhir[k]) || 0;
      const d = b - a;
      return `${a} -> ${b} (${d >= 0 ? '+' : ''}${d})`;
    };
    L.push('Poin beredar: ' + delta('totalMoney'));
    L.push('Pemain terdaftar: ' + delta('totalUsers'));
    L.push('Game dimainkan: ' + delta('gamesToday'));
    // Sampel titik supaya AI bisa melihat bentuk trennya, bukan cuma ujung.
    const titik = seri.length <= 12 ? seri : seri.filter((_, i) => i % Math.ceil(seri.length / 12) === 0);
    L.push('Titik data (waktu | poin | pemain | game):');
    for (const s of titik.slice(0, 12)) {
      const tgl = s.ts ? new Date(Number(s.ts)).toISOString().slice(5, 16).replace('T', ' ') : '-';
      L.push(`- ${tgl} | ${rupiah(s.totalMoney)} | ${s.totalUsers} | ${s.gamesToday}`);
    }
  }

  // ==========================================
  // PENGAMAN UKURAN KONTEKS (fix 2026-10-01)
  // ==========================================
  //
  // KENAPA PERLU: Groq menolak permintaan yang melebihi batas token per menit
  // (kejadian nyata: "Limit 8000, Requested 8564"). Saat itu terjadi, panel AI
  // menampilkan error dan pemilik tidak bisa memakai AI sama sekali.
  //
  // Semua bagian di atas sudah dibatasi satu per satu, tapi TOTAL-nya tetap
  // bisa membengkak kalau data pemain bertambah banyak. Pengaman ini memastikan
  // konteks SELALU di bawah batas, apa pun isi datanya.
  //
  // Cara kerja: kalau kepanjangan, bagian-bagian dipangkas dari yang PALING
  // BELAKANG (paling tidak penting: tren titik data, log error, dsb), sambil
  // mempertahankan bagian depan (ringkasan, server, game, toko, penjualan) yang
  // paling sering dipakai untuk analisis.
  //
  // Batas 12000 karakter ~ 3000 token (perkiraan 4 char/token untuk bahasa
  // Indonesia). Diturunkan dari 20000 (fix 2026-10-01) karena Groq menghitung
  // TOTAL token per menit: konteks 5000 token + max_tokens 4000 = 9000, sudah
  // MELEBIHI batas 8000 TPM akun gratis. Dengan 12000 karakter + output 2000,
  // total ~5000-6000 token - masih ada sisa untuk percakapan lanjutan.
  const BATAS_KONTEKS = 12000;
  let teks = L.join('\n');
  if (teks.length > BATAS_KONTEKS) {
    // Buang bagian belakang sampai muat. Setiap bagian dipisah '### '.
    const potong = teks.slice(0, BATAS_KONTEKS);
    const akhirBagian = potong.lastIndexOf('\n### ');
    teks = (akhirBagian > BATAS_KONTEKS * 0.5 ? potong.slice(0, akhirBagian) : potong)
      + '\n\n(Catatan: sebagian data dipangkas karena terlalu panjang. Kalau perlu detail bagian yang tidak terlihat, tanya bagian spesifiknya.)';
  }
  return teks;
}

// Instruksi format TERPISAH dari instruksi tugas, supaya bisa dipakai semua
// jalur (chat maupun tombol pintas) tanpa duplikasi.
//
// KENAPA LARANGAN TABEL & EMOJI PENTING:
//   Jawaban ditampilkan di panel sebagai TEKS BIASA (bukan HTML), jadi tabel
//   markdown muncul sebagai pipa-pipa berantakan dan emoji menambah bising
//   tanpa informasi. Diuji: tanpa larangan ini AI menulis tabel penuh dan
//   hasilnya sulit dibaca di layar.
export const ATURAN_FORMAT = [
  'ATURAN FORMAT (wajib):',
  '- Jangan memakai TABEL markdown. Kalau perlu membandingkan, pakai daftar bernomor atau "A: x | B: y" dalam satu baris.',
  '- Jangan memakai emoji sama sekali.',
  '- Jangan memakai em dash. Pakai tanda hubung biasa.',
  // Judul bagian huruf kecil biasa (permintaan pemilik 2026-10-01): capslock
  // terasa berteriak dan tidak nyaman dibaca. Cukup "Temuan:", "Saran:",
  // "Risiko:" dengan huruf kapital di awal kata saja.
  '- Judul bagian ditulis biasa saja, huruf kapital di awal kata: "Temuan:", "Saran:", "Risiko:".',
  '- Bahasa Indonesia santai tapi rapi. Langsung ke isi, jangan mengulang data mentah.',
].join('\n');

// ==========================================
// PERINTAH PENGINGAT (permintaan pemilik 2026-10-01)
// ==========================================
//
// Pemilik bisa menyuruh AI: "ingetin gw pas Halloween mau masang promo".
// AI tidak punya akses ke database, jadi caranya: AI menuliskan baris khusus
// di akhir jawabannya, dan SERVER yang menyimpannya. Formatnya sederhana
// supaya tidak salah baca, dan TIDAK ditampilkan ke pemilik (dipangkas server).
//
// Kenapa pakai baris teks, bukan function calling: setup function calling
// menambah kerumitan pada penyedia (Groq) dan rawan gagal senyap. Baris teks
// mudah diperiksa dan tetap jalan walau AI memakai varian format.
export const ATURAN_PENGINGAT = [
  'MEMBUAT PENGINGAT:',
  'Kalau pemilik meminta DIINGATKAN sesuatu ("ingetin gw...", "remind me...",',
  '"jangan lupa nanti..."), tulis baris ini PALING AKHIR jawabanmu:',
  '[[INGATKAN]] tanggal=YYYY-MM-DD | teks=isi pengingat',
  '',
  'Aturan:',
  '- tanggal WAJIB format YYYY-MM-DD (pakai daftar "Momen mendatang" di DATA).',
  '- Jangan menghitung tanggal sendiri kalau momennya ada di daftar itu.',
  '- Isi pengingat singkat dan jelas (maksimal 200 huruf).',
  '- Tulis SATU baris saja per permintaan. Kalau tidak diminta mengingatkan,',
  '  JANGAN tulis baris ini sama sekali.',
  '- Selain baris itu, tetap jawab pertanyaannya seperti biasa.',
].join('\n');

// ==========================================
// TOMBOL PINTAS
// ==========================================
// Tiap pintasan punya instruksi sendiri supaya jawabannya fokus dan tidak
// bertele-tele. Semua WAJIB memakai angka dari data, dan menyebut kalau
// datanya belum cukup.

export const PINTASAN = [
  {
    id: 'promo',
    label: 'Saran Promo',
    tanya: 'Susun rencana promo mingguan. Pilih item/game mana yang dipromo dan jelaskan ALASANNYA pakai angka (stok, harga, game_type, jumlah item sejenis). Sebutkan juga promo apa yang sebaiknya DIHENTIKAN karena tidak efektif, kalau ada datanya.',
  },
  {
    id: 'sepi',
    label: 'Item & Game Sepi',
    tanya: 'Cari bagian yang paling sepi: item dengan stok menumpuk, game yang tidak muncul di top game hari ini, kategori yang isinya sedikit, wilayah lain yang angkanya menonjol sebagai masalah. Urutkan dari yang paling mendesak.',
  },
  {
    id: 'retensi',
    label: 'Retensi Pemain',
    tanya: 'Analisis retensi dari data yang ada: pemain terdaftar vs yang bermain, sebaran server (berapa yang 0 pemain), pinjaman bank, member premium. Apa yang paling mungkin membuat pemain berhenti, dan langkah konkret apa yang bisa diambil.',
  },
  {
    id: 'ekonomi',
    label: 'Kesehatan Ekonomi',
    tanya: 'Nilai kesehatan ekonomi: total poin beredar vs jumlah pemain, siapa yang menimbun poin paling banyak (pemain terkaya), pinjaman bank yang beredar, harga barang di toko. Apakah inflasi/penumpukan poin mengkhawatirkan? Jelaskan dengan angka.',
  },
  {
    id: 'komunitas',
    label: 'Pertumbuhan Komunitas',
    tanya: 'Analisis sisi komunitas: berapa server yang benar-benar aktif vs 0 pemain (pakai angka di bagian SERVER), sebaran pemain antar server, guild yang cuma sedikit, link invite yang belum jadi (lihat Diagnosa invite). Apa langkah paling berdampak untuk menumbuhkan komunitas.',
  },
  {
    id: 'error',
    label: 'Log Error',
    tanya: 'Baca bagian LOG ERROR. Sebutkan error mana yang paling sering muncul, sejak kapan, dan bagian mana yang terdampak (game, invite, izin, dsb). Pisahkan error yang berbahaya dari yang tidak berbahaya, lalu beri urutan perbaikan dari yang paling mendesak. Kalau log-nya kosong atau bot belum mengirimnya, katakan apa adanya.',
  },
  {
    id: 'idegame',
    label: 'Ide Game Baru',
    tanya: [
      'Usulkan 3 ide GAME BARU yang INOVATIF dan out of the box untuk NEXO Games.',
      '',
      'ATURAN WAJIB:',
      '1. JANGAN menyarankan game yang sudah ada di daftar "GAME YANG SUDAH ADA".',
      '   Cek daftar itu dulu - kalau idemu mirip salah satunya, buang dan cari lain.',
      '2. Ide harus NYAMBUNG dengan data: jelaskan kenapa ide ini cocok dengan',
      '   minat pemain (sebut game yang paling sering dimainkan dan game yang',
      '   itemnya paling laku sebagai bukti).',
      '3. Setiap ide harus punya MEKANIK INTI yang belum dipakai game NEXO saat',
      '   ini - sebutkan mekaniknya secara spesifik, bukan cuma tema.',
      '4. Sebutkan: nama game, cara main singkat (2-3 baris), mekanik pembeda,',
      '   dan alasan berbasis angka kenapa ini cocok.',
      '5. Kalau ide mirip game yang sudah ada, jelaskan APA YANG BERBEDA -',
      '   jangan menyamarkan game lama dengan nama baru.',
    ].join('\n'),
  },
  {
    id: 'guild',
    label: 'Masalah Guild & War',
    tanya: 'Fokus ke fitur guild: jumlah guild, jumlah anggota, hasil war, poin guild. Kenapa fitur ini mungkin kurang hidup dibanding fitur lain? Beri langkah perbaikan yang bisa diukur.',
  },
  {
    id: 'semua',
    label: 'Gambaran Menyeluruh',
    tanya: 'Beri gambaran menyeluruh isi snapshot ini. Sebutkan 5 hal paling penting yang perlu diperhatikan pemilik, urut dari yang paling berdampak, masing-masing dengan angka pendukung dan saran tindakan konkret.',
  },
];

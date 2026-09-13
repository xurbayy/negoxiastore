import Reveal from './Reveal';
import { emojiSrc } from '../lib/emojis';

const PERKS = [
  { emoji: 'PE_PandaBackPack', text: 'Inventori Unlimited: simpan item tanpa batas 5 per jenis' },
  { emoji: 'sun58', text: 'Kuota Harian +5.000 pts: limit main harianmu naik di atas streak bonus' },
  { emoji: '267042fire', text: 'Klaim Harian +10%: reward nxdaily selalu 10% lebih besar' },
  { emoji: 'goldcoin', text: 'Bunga Pinjaman -10%: pinjam di bank lebih murah' },
  { emoji: 'tasks', text: '+1 Slot Misi Harian: 4 misi per hari, lebih banyak poin dicairkan' },
  { emoji: 'UC_Checkmark', text: 'Prioritas Render: papan game muncul lebih cepat + cooldown render setengah' },
  { emoji: 'controller', text: 'Akses Game Beta: coba game baru sebelum rilis publik' },
  { emoji: 'download3', text: 'Profil Web Premium: grafik riwayat & badge khusus di website' },
];

export default function Premium() {
  return (
    <section id="premium" className="relative scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-accent/40 bg-bg px-6 py-12 md:px-14 md:py-16">

            <div className="relative grid items-center gap-12 lg:grid-cols-2">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-extrabold uppercase tracking-widest text-ink">
                  {emojiSrc('download3') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emojiSrc('download3')} alt="" width={16} height={16} className="h-4 w-4" />
                  )}
                  NEXO Pass
                </div>
                <h2 className="mt-5 font-display text-3xl leading-snug text-ink md:text-4xl">
                  Level Up dengan Premium.
                </h2>
                <div className="mt-5 flex items-end gap-2">
                  <span className="font-display text-4xl text-ink md:text-5xl">Rp 20.000</span>
                  <span className="pb-1.5 text-ink-muted">/bulan</span>
                </div>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-muted">
                  Satu Pass, semua perk. Bayar via QRIS atau e-wallet, aktif otomatis
                  dalam hitungan detik setelah pembayaran terkonfirmasi.
                </p>
                <div className="mt-7 flex flex-wrap gap-4">
                  <a
                    href="https://discord.com/oauth2/authorize?client_id=1497924277301936300&scope=bot+applications.commands&permissions=277025508352"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                  >
                    Dapatkan NEXO Pass
                  </a>
                  <code className="inline-flex items-center rounded-lg border border-border-soft bg-bg-soft px-4 py-2.5 font-mono text-sm text-ink">
                    nxpremium
                  </code>
                </div>
              </div>

              <ul className="grid gap-3 sm:grid-cols-2">
                {PERKS.map((p) => (
                  <li
                    key={p.text}
                    className="flex items-start gap-3 rounded-xl border border-border-soft bg-bg-soft/70 px-4 py-3.5"
                  >
                    {emojiSrc(p.emoji) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={emojiSrc(p.emoji)} alt="" width={22} height={22} loading="lazy" className="mt-0.5 h-[22px] w-[22px] shrink-0" />
                    )}
                    <span className="text-sm leading-snug text-ink">{p.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

import Link from 'next/link';
import { InviteButton, GamepadIcon } from './ui';
import { emojiSrc } from '../lib/emojis';

// Split hero sesuai design system: kiri (badge + judul 2 baris bertitik +
// underline oranye + paragraf), kanan (kartu dark ala Discord berisi
// contoh embed game). Copy menyesuaikan status login:
// - belum login: ajakan invite bot (onboarding)
// - sudah login: ajakan kembali main + tombol ke profil
export default function Hero({ loggedIn = false }) {
  return (
    <section className="relative overflow-hidden pb-16 pt-32 md:pb-24 md:pt-40">
      <div className="bg-grid absolute inset-0" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
        {/* Kiri: copy */}
        <div className="text-center lg:text-left">
          <h1 className="anim-in delay-2 mt-6 font-display text-4xl leading-[1.15] text-ink sm:text-5xl">
            {loggedIn ? 'Selamat Main Lagi.' : '25+ Game Seru.'}
          </h1>
          <h2 className="anim-in delay-2 font-display text-4xl leading-[1.15] text-ink sm:text-5xl">
            {loggedIn ? 'Progresmu Menanti.' : 'Satu Bot Discord.'}
          </h2>

          {/* accent underline */}
          <div className="accent-bar anim-in delay-2 mt-5 mx-auto lg:mx-0" aria-hidden="true" />

          <p className="anim-in delay-3 mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-muted md:text-lg lg:mx-0">
            {loggedIn ? (
              <>
                Akun kamu sudah tertaut. Cek <strong className="text-ink">poin</strong>,{' '}
                <strong className="text-ink">misi harian</strong>, dan{' '}
                <strong className="text-ink">riwayat game</strong> di halaman profil,
                atau lanjut main di Discord dengan perintah np, nb, dan nc.
              </>
            ) : (
              <>
                <strong className="text-ink">NEXO Games</strong> menghadirkan 25+ mini-game:
                solo, PvP betting, co-op raid, sampai autochess, plus ekonomi poin, bank,
                guild war, shop, dan leaderboard. Semuanya gratis, langsung di Discord.
              </>
            )}
          </p>

          <div className="anim-in delay-4 mt-8 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
            {loggedIn ? (
              <>
                <Link href="/me" className="btn-primary cursor-pointer">Buka Profil</Link>
                <Link href="/leaderboard" className="btn-ghost cursor-pointer">
                  {emojiSrc('trophy') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emojiSrc('trophy')} alt="" width={18} height={18} className="h-[18px] w-[18px]" />
                  ) : null}
                  Cek Peringkat
                </Link>
              </>
            ) : (
              <>
                <InviteButton />
                <Link href="/#games" className="btn-primary !bg-card-dark !px-[1.6rem] !py-[0.7rem] !text-[16px] text-card-cream transition hover:bg-card-dark-2 cursor-pointer">
                  <GamepadIcon className="h-5 w-5" />
                  Lihat Semua Game
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Kanan: 2 screenshot asli embed game (Blackjack + Russian Roulette),
            ditumpuk rapi dengan sedikit kemiringan berlawanan */}
        <div className="anim-in delay-3 relative mx-auto h-[420px] w-full max-w-md select-none sm:h-[460px]">
          {/* kartu belakang: Russian Roulette */}
          <div className="nx-dark absolute right-0 top-0 w-[74%] rotate-[3deg] overflow-hidden shadow-[0_18px_44px_rgba(43,33,24,0.28)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/preview-roulette.png"
              alt="Contoh game Russian Roulette di NEXO Games: ronde, total hadiah, dan papan pelatuk"
              width={777}
              height={783}
              className="h-auto w-full"
              loading="eager"
            />
          </div>

          {/* kartu depan: Blackjack */}
          <div className="nx-dark absolute bottom-0 left-0 w-[72%] -rotate-[2deg] overflow-hidden shadow-[0_24px_54px_rgba(43,33,24,0.35)] ring-4 ring-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/preview-blackjack.png"
              alt="Contoh game Blackjack di NEXO Games: pot taruhan, papan kartu, dan tombol aksi Hit/Stand"
              width={660}
              height={626}
              className="h-auto w-full"
              loading="eager"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

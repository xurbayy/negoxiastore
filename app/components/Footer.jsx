import Image from 'next/image';
import Roblox from "../../public/roblox.svg";

const SOCIAL = [
  { href: 'https://discord.gg/nbHfMmcTch',                                              icon: '/discord.svg', label: 'Discord' },
  { href: 'https://www.tiktok.com/@negoxia?_r=1&_t=ZS-94NnSLUwuPf',                    icon: '/tiktok.svg',          label: 'TikTok' },
  { href: 'https://www.instagram.com/negoxiastore?igsh=MTVhc2xqaWZpcmNnbA==',           icon: '/instagram.svg',       label: 'Instagram' },
  { href: 'https://www.roblox.com/share/g/272882894',                                    icon: 'roblox.svg',   label: 'Roblox' },
];

const COL_LAYANAN = [
  { label: 'Discord Server Setup',  href: '/discord-server-setup' },
  { label: 'Custom Discord Bot',    href: '/custom-discord-bot' },
  { label: 'Visual Design',         href: '/visual-design' },
  { label: 'Roblox Development',    href: '/roblox-development' },
];

const COL_TOKO = [
  { label: 'Beranda',     href: '#hero' },
  { label: 'Produk',      href: '#services' },
  { label: 'Tentang Kami', href: '#whyus' },
];

const COL_KONTAK = [
  { label: 'Discord',   href: 'https://discord.gg/nbHfMmcTch' },
  { label: 'Instagram', href: 'https://www.instagram.com/negoxiastore?igsh=MTVhc2xqaWZpcmNnbA==' },
  { label: 'TikTok',    href: 'https://www.tiktok.com/@negoxia?_r=1&_t=ZS-94NnSLUwuPf' },
  { label: 'Roblox',    href: 'https://www.roblox.com/share/g/272882894' },
];

export default function Footer() {
  return (
    <footer className="bg-transparent pt-20 relative z-[1]">
      <div className="max-w-[1280px] mx-auto px-16 max-md:px-5">
        {/* Grid */}
        <div className="grid grid-cols-[2fr_1.2fr_1.2fr_1.2fr] gap-12 pb-14
          max-md:grid-cols-1 max-md:gap-8">

          {/* Brand */}
          <div className="footer-brand">
            <div className="footer-logo flex items-center gap-2.5 font-bold text-[17px] mb-0 group">
              <Image
                src="/negoxia.png"
                alt="logo"
                width={26}
                height={26}
                className="transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]
                  group-hover:rotate-[-10deg] group-hover:scale-[1.15]"
              />
              <span><span className="text-accent2">NEGO</span>XIA STORE</span>
            </div>
            <p className="text-[13px] font-inter leading-[1.8] mt-4 mb-6">
              Toko layanan digital terpercaya Anda.<br />Harga bisa nego, kualitas gak bisa kompromi.
            </p>
            <div className="flex gap-3">
              {SOCIAL.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.label}
                  className="icon-wobble-trigger w-[60px] h-[60px] bg-card border border-stroke rounded-xl
                    flex items-center justify-center shadow-[0_2px_8px_rgba(44,19,22,0.07)]
                    no-underline
                    transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]
                    hover:-translate-y-1 hover:scale-110 hover:shadow-[0_8px_20px_rgba(247,193,81,0.3)]"
                >
                  <Image
                    src={s.icon}
                    alt={s.label}
                    width={32}
                    height={32}
                    className="icon-wobble w-8 h-8 object-contain"
                  />
                </a>
              ))}
            </div>
          </div>

          {/* Columns */}
          {[
            { title: 'Melayani', links: COL_LAYANAN },
            { title: 'Toko',     links: COL_TOKO },
            { title: 'Kontak',   links: COL_KONTAK },
          ].map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-bold mb-5">{col.title}</h4>
              <ul className="list-none flex flex-col gap-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="no-underline text-[13px] text-brand font-inter
                        hover:text-accent2 transition-colors duration-200"
                      {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t-[1.5px] border-brand/10 py-[22px] text-center text-[13px] font-inter text-brand/55">
          © 2021 NEGOXIA STORE – All Rights Reserved
        </div>
      </div>
    </footer>
  );
}

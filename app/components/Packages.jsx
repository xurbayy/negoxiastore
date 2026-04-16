'use client';

import Image from 'next/image';
import { useEffect } from 'react';
import Badge from "./Badge";

const PACKAGES = [
  {
    icon:  '/give.svg',
    title: 'Paket Starter Brand',
    desc:  'Discord Server + Logo. Cocok buat server baru yang mau langsung keliatan profesional.',
    items: [
      'Setup Discord Server (Basic)',
      'Channel & role dasar',
      'Struktur rapi dan siap dipakai',
      'Desain Logo',
      '2 konsep logo',
      '2x revisi',
      'Konsultasi konsep server & branding',
    ],
    priceNode: <><strong>Rp100.000 – Rp150.000</strong></>,
    tags: ['Lebih hemat', 'Proses lebih cepat'],
    delay: 0,
  },
  {
    icon:  '/give.svg',
    title: 'Paket Community Ready',
    desc:  'Discord Server + Custom Bot. Buat komunitas yang pengen sistem rapi dan otomatis.',
    items: [
      'Setup Discord Server (Standard)',
      'Struktur lengkap',
      'Sistem verifikasi',
      'Ticket support',
      'Custom Bot (Core + 3 Basic Add-on)',
      'Moderasi dasar',
      'Command custom sesuai kebutuhan',
      'Penyesuaian bot dengan struktur server',
    ],
    priceNode: (
      <>
        <strong>Rp150.000 – Rp250.000</strong><br />
        <span className="font-normal">(Belum termasuk hosting bot)</span>
      </>
    ),
    tags: ['Server auto-grow', 'Cocok untuk komunitas serius'],
    delay: 0.12,
  },
  {
    icon:  '/give.svg',
    title: 'Paket Brand Automation',
    desc:  'Discord Server + Logo + Bot. Paket paling lengkap buat brand, komunitas, atau bisnis.',
    items: [
      'Setup Discord Server (Advanced)',
      'Automasi penuh',
      'Security & permission rapi',
      'Custom Bot (2 Custom Fitur)',
      'Custom Bot (Core + 5 Basic Add-on)',
      'Moderasi',
      'Ticket system',
      'Verifikasi / leveling (opsional)',
      'Desain Logo',
      '2-3 konsep',
      '3x revisi',
      'Konsultasi sistem & alur server',
    ],
    priceNode: (
      <>
        <strong>Rp300.000 – Rp500.000+</strong><br />
        <strong>Termasuk Hosting</strong><br />
        <span className="text-[12px] font-medium">BOT-1G | 0.3CORE | 1GB RAM | 2GB NVMe 1 Bulan</span>
      </>
    ),
    tags: ['Paket Lengkap', 'Branding profesional'],
    delay: 0.24,
  },
];

export default function Packages() {
  /* Tilt */
  useEffect(() => {
    if (window.innerWidth <= 768) return;
    const cards = document.querySelectorAll('.pkg-card');
    const cleanups = [];
    const deg = 6;

    cards.forEach((el) => {
      let raf = null, tx = 0, ty = 0, cx = 0, cy = 0, on = false;
      function lerp(a, b, t) { return a + (b - a) * t; }
      function tick() {
        if (!on && Math.abs(cx) < 0.005 && Math.abs(cy) < 0.005) {
          cx = 0; cy = 0;
          el.style.transform = '';
          el.style.boxShadow = '';
          raf = null; return;
        }
        cx = lerp(cx, on ? tx : 0, 0.09);
        cy = lerp(cy, on ? ty : 0, 0.09);
        el.style.transform = `perspective(900px) rotateY(${cx}deg) rotateX(${-cy}deg) translateY(${on ? -6 : 0}px) scale(${on ? 1.013 : 1})`;
        el.style.boxShadow = `${-cx * 1.5}px ${cy * 1.2 + (on ? 16 : 0)}px ${on ? 44 : 12}px rgba(44,19,22,${on ? 0.15 : 0.06})`;
        raf = requestAnimationFrame(tick);
      }
      const onMove = (e) => {
        const r = el.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * deg;
        ty = ((e.clientY - r.top) / r.height - 0.5) * deg;
        on = true; if (!raf) raf = requestAnimationFrame(tick);
      };
      const onLeave = () => { on = false; tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); };
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseleave', onLeave);
      cleanups.push(() => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); });
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <section id="packages" className="min-h-screen flex flex-col justify-center">
      <div className="px-16 py-[100px] max-w-[1280px] mx-auto w-full relative z-[1]
        max-md:px-5 max-md:py-16">

        <p className="text-xs font-bold uppercase tracking-[2px] text-accent2 mb-3 font-inter">
          Paket Bundling
        </p>
        <h2 className="text-[34px] font-extrabold mb-14 leading-[1.2] max-md:text-[26px] max-md:mb-9">
          Pilih Paket yang Cocok
        </h2>

        <div className="grid grid-cols-3 gap-7 max-[1100px]:grid-cols-2 max-md:grid-cols-1">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.title}
              className="pkg-card card-shine tilt-card fade-up
                bg-card rounded-[22px] p-[34px_28px_28px] border-[1.5px] border-stroke
                shadow-[0_2px_14px_rgba(44,19,22,0.06)] flex flex-col"
              data-delay={pkg.delay}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4 justify-center">
                <div className="w-9 h-9 flex-shrink-0">
                  <Image src={pkg.icon} alt={pkg.title} width={36} height={36} className="icon-wobble w-full h-full object-contain" />
                </div>
                <span className="text-[13px] font-bold uppercase tracking-[0.5px]">{pkg.title}</span>
              </div>

              <hr className="border-t-[1.5px] border-brand/[0.09] mb-[18px]" />

              <p className="text-[13px] font-inter leading-[1.65] mb-[18px] text-center">{pkg.desc}</p>

              <p className="text-[13px] font-semibold mb-2.5 font-inter">Isi layanan:</p>

              <ul className="list-disc pl-[18px] text-[13px] font-inter leading-[1.9] mb-[18px] flex-1">
                {pkg.items.map((item) => <li key={item}>{item}</li>)}
              </ul>

              <p className="text-[13px] font-bold font-inter mb-[18px] leading-[1.7]">
                Harga paket: {pkg.priceNode}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {pkg.tags.map((t) => (
                  <Badge key={t} text={t} size={"sm"}/>
                ))}
              </div>

              <button
                className="btn-ripple bg-accent2 bg-[var(--orange)] text-soft text-white border-none rounded-[10px] py-[15px]
                  font-inter text-[13px] font-semibold cursor-pointer w-full mt-auto
                  flex items-center justify-center gap-2
                  transition-all duration-[250ms]
                  hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_18px_rgba(247,193,81,0.45)]
                  active:scale-[0.97]"
                onClick={() => window.open('https://discord.gg/7t9qxvqXyV', '_blank')}
              >
                <Image
                  src='discord-white.svg'
                  alt='discord'
                  width={32}
                  height={32}
                  className="icon-wobble w-8 h-8 object-contain"
                />
                Order Sekarang
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

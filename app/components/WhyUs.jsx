'use client';

import Image from 'next/image';
import { useEffect } from 'react';

const WHY_CARDS = [
  {
    icon:  '/promo.svg',
    title: 'PROMO JALAN TERUS',
    texts: [
      'Di NEGOXIA, promo bukan cuma setahun sekali, kita suka tiba-tiba diskon, flash sale, atau harga spesial buat pelanggan setia.',
      'Follow terus biar nggak ketinggalan. Siapa cepat dia dapat.',
    ],
    delay: 0,
  },
  {
    icon:  '/give.svg',
    title: 'GIVEAWAY RUTIN',
    texts: [
      'Beneran gratis, beneran fair. NEGOXIA rutin ngadain giveaway, bisa jasa gratis, voucher diskon, atau hadiah spesial lainnya.',
      'Ikutin terus, siapa tau rezeki kamu yang keluar nama.',
    ],
    delay: 0.12,
  },
];

export default function WhyUs() {
  /* Tilt on desktop */
  useEffect(() => {
    if (window.innerWidth <= 768) return;
    const targets = [
      { sel: '.why-card',   deg: 5 },
      { sel: '.whyus-top',  deg: 3 },
    ];
    const cleanups = [];

    targets.forEach(({ sel, deg }) => {
      document.querySelectorAll(sel).forEach((el) => {
        let raf = null, tx = 0, ty = 0, cx = 0, cy = 0, on = false;
        const lerp = (a, b, t) => a + (b - a) * t;
        function tick() {
          if (!on && Math.abs(cx) < 0.005 && Math.abs(cy) < 0.005) {
            cx = 0; cy = 0;
            el.style.transform = ''; el.style.boxShadow = '';
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
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return (
    <section id="whyus" className="min-h-screen flex flex-col justify-center">
      <div className="px-16 py-[100px] max-w-[1280px] mx-auto w-full relative z-[1]
        max-md:px-5 max-md:py-16">

        {/* Top banner */}
        <div
          className="whyus-top whyus-top-shimmer tilt-card fade-up
            bg-card rounded-[22px] p-[56px_60px] text-center
            border-[1.5px] border-stroke shadow-[0_2px_14px_rgba(44,19,22,0.06)] mb-7
            max-md:p-[32px_24px]"
        >
          <h2 className="text-[36px] font-extrabold mb-[22px]">
            Kenapa <span className="text-accent2">NEGO</span>XIA?
          </h2>
          <hr className="border-t-[1.5px] border-brand/[0.09] mb-[22px]" />
          <p className="text-[17px] font-inter leading-[2.2] max-md:text-[15px] max-md:leading-8">
            Nama bukan sekadar identitas NEGO itu cara kita kerja.<br />
            Budget terbatas? Kita cari solusi.<br />
            Butuh request khusus? Bisa dibahas.<br />
            Yang penting komunikasi jelas, pasti ketemu titik tengah.
          </p>
        </div>

        {/* Bottom cards */}
        <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
          {WHY_CARDS.map((card) => (
            <div
              key={card.title}
              className="why-card card-shine tilt-card fade-up
                bg-card rounded-[22px] p-[36px_38px]
                border-[1.5px] border-stroke shadow-[0_2px_14px_rgba(44,19,22,0.06)]"
              data-delay={card.delay}
            >
              <div className="flex items-center gap-3.5 text-[13px] font-bold uppercase tracking-[0.5px] mb-4">
                <div className="w-14 h-14 flex-shrink-0">
                  <Image src={card.icon} alt={card.title} width={56} height={56} className="icon-wobble w-full h-full object-contain" />
                </div>
                {card.title}
              </div>

              <hr className="border-t-[1.5px] border-brand/[0.09] mb-[18px]" />

              {card.texts.map((txt, i) => (
                <p key={i} className="text-sm font-inter leading-[1.8] mb-3">{txt}</p>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

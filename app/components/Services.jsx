'use client';

import { useEffect, useRef } from 'react';
import Badge from "./Badge";
import Image from "next/image";

const SERVICES = [
  {
    icon:  'discord.svg',
    title: 'Discord Server Setup',
    desc:  'Kami bantu bikin atau merapikan server Discord biar rapi, jelas, dan siap dipakai.',
    list: [
      'Server Setup & Rework',
      'Channel Structure & Organization',
      'Role & Permission Setup',
      'Server Systems (Welcome, Rules, Verification)',
      'Free Bot Setup & Configuration',
    ],
    note: 'Menggunakan bot publik (bukan custom)\nGaransi revisi 3 hari',
    tags: ['Server Setup', 'Bot Config', 'Role Management', 'Clean Layout'],
    href: '/discord-server-setup',
    delay: 0,
  },
  {
    icon:  "discord.svg",
    title: 'Custom Discord Bot',
    desc:  'Bot Discord custom sesuai kebutuhan server kamu, dibuat dari nol.',
    list: [
      'Custom Bot Development',
      'Feature Request (sesuai kebutuhan)',
      'Command & System Setup',
      'Bot Deployment & Setup',
      'Initial Adjustment',
    ],
    note: 'Hosting tidak termasuk (opsional)\nMaintenance di luar garansi\nGaransi bug fix 3 hari',
    tags: ['Custom Bot', 'Automation', 'Scalable'],
    href: '/custom-discord-bot',
    delay: 0.1,
  },
  {
    icon:  "visual.svg",
    title: 'Visual Design',
    desc:  'Pembuatan kebutuhan visual untuk server, komunitas, atau brand kamu.',
    list: [
      'Logo Design',
      'Discord Banner',
      'Poster & Visual Assets',
      'Custom Concept',
    ],
    note: 'Revisi sesuai kesepakatan',
    tags: ['Visual Design', 'Clean Design', 'Modern'],
    href: '/visual-design',
    delay: 0.2,
  },
  {
    icon:  'roblox.svg',
    title: 'Roblox Development',
    desc:  'Jasa pembuatan game atau map Roblox sesuai kebutuhan kamu.',
    list: [
      'Game / Map Development',
      'Scripting & Gameplay',
      'Visual Style Customization',
      'Basic Optimization',
    ],
    note: 'Siap publish ke Roblox Studio\nGaransi revisi 7 hari',
    tags: ['Roblox Dev', 'Map Design', 'Scripting'],
    href: '/roblox-development',
    delay: 0.3,
  },
];

function useTilt(selector, deg) {
  useEffect(() => {
    if (window.innerWidth <= 768) return;

    const cards = document.querySelectorAll(selector);
    const cleanups = [];

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
}

function useFadeUp() {
  useEffect(() => {
    // Reset all fade-up elements immediately so animation re-plays on back navigation
    const els = document.querySelectorAll('.fade-up');
    els.forEach((el) => el.classList.remove('visible'));

    // Small delay to ensure DOM is ready and CSS transition reset is painted
    const initTimer = setTimeout(() => {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const delay = parseFloat(entry.target.dataset.delay || 0);
              setTimeout(() => entry.target.classList.add('visible'), delay * 1000);
              obs.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.07, rootMargin: '0px 0px -40px 0px' }
      );

      // Observe all fade-up elements; if already in viewport, trigger immediately
      document.querySelectorAll('.fade-up').forEach((el) => {
        const rect = el.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (inView) {
          const delay = parseFloat(el.dataset.delay || 0);
          setTimeout(() => el.classList.add('visible'), delay * 1000);
        } else {
          obs.observe(el);
        }
      });

      return () => obs.disconnect();
    }, 50);

    return () => clearTimeout(initTimer);
  }, []);
}

export default function Services() {
  useTilt('.service-card', 7);
  useFadeUp();

  return (
    <section id="services" className="min-h-screen flex flex-col justify-center">
      <div className="px-16 py-[100px] max-w-[1280px] mx-auto w-full relative z-[1]
        max-md:px-5 max-md:py-16">

        <p className="text-xs font-bold uppercase tracking-[2px] text-accent2 mb-3 font-inter">
          Layanan Kami
        </p>
        <h2 className="text-[34px] font-extrabold mb-14 leading-[1.2] max-md:text-[26px] max-md:mb-9">
          Apa yang Kami Tawarkan
        </h2>

        <div className="grid grid-cols-4 gap-6 max-[1100px]:grid-cols-2 max-md:grid-cols-1">
          {SERVICES.map((svc) => (
            <div
              key={svc.title}
              className="service-card card-shine tilt-card fade-up
                bg-card rounded-[22px] p-[30px_24px_26px] border-[1.5px] border-stroke
                shadow-[0_2px_14px_rgba(44,19,22,0.06)] flex flex-col"
              data-delay={svc.delay}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-9 h-9 flex-shrink-0">
                  <Image
                    src={svc.icon}
                    alt={svc.icon}
                    width={32}
                    height={32}
                    className="icon-wobble w-8 h-8 object-contain"
                  />
                </div>
                <span className="text-[12.5px] font-bold uppercase tracking-[0.5px]">{svc.title}</span>
              </div>

              <hr className="border-t-[1.5px] border-brand/[0.09] mb-4" />

              <p className="text-[13px] leading-[1.65] mb-3.5 font-inter text-center">{svc.desc}</p>

              <ul className="list-disc pl-[18px] text-[13px] font-inter leading-[1.9] mb-3.5 flex-1">
                {svc.list.map((item) => <li key={item}>{item}</li>)}
              </ul>

              <p className="text-[12px] text-brand/60 font-inter mb-3.5 leading-[1.65] whitespace-pre-line">
                {svc.note}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-[18px]">
                {svc.tags.map((t) => (
                  <Badge key={t} text={t} size={"sm"}/>
                ))}
              </div>

              <button
                className="btn-ripple bg-accent2 bg-[var(--orange)] text-soft text-white border-none rounded-[10px] py-[13px]
                  font-inter text-[13px] font-semibold cursor-pointer w-full mt-auto
                  transition-all duration-[250ms]
                  hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_6px_18px_rgba(247,193,81,0.45)]
                  active:scale-[0.97]"
                onClick={() => window.location.href = svc.href}
              >
                Lihat Selengkapnya
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

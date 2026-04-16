'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import Badge from "./Badge";

function useRipple() {
  function createRipple(btn, cx, cy) {
    const r    = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.8;
    const el   = document.createElement('span');
    el.classList.add('ripple');
    el.style.cssText = `width:${size}px;height:${size}px;left:${cx - r.left - size / 2}px;top:${cy - r.top - size / 2}px`;
    btn.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
  return createRipple;
}

export default function Hero() {
  const createRipple = useRipple();
  const primaryRef   = useRef(null);
  const outlineRef   = useRef(null);
  // animKey forces React to re-mount animated elements on every navigation (including browser back)
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    // Re-trigger animations every time this component mounts (including browser back/forward)
    setAnimKey(k => k + 1);
  }, []);

  useEffect(() => {
    [primaryRef, outlineRef].forEach((ref) => {
      const btn = ref.current;
      if (!btn) return;
      const onClick  = (e) => createRipple(btn, e.clientX, e.clientY);
      const onTouch  = (e) => { const t = e.touches[0]; createRipple(btn, t.clientX, t.clientY); };
      btn.addEventListener('click',      onClick);
      btn.addEventListener('touchstart', onTouch, { passive: true });
      return () => {
        btn.removeEventListener('click',      onClick);
        btn.removeEventListener('touchstart', onTouch);
      };
    });
  }, []);

  return (
    <section id="hero" className="relative overflow-hidden min-h-screen flex flex-col justify-center">
      <div key={animKey} className="flex items-center gap-[60px] px-16 pt-[120px] pb-20 max-w-[1280px] mx-auto w-full relative z-[1]
        max-md:flex-col max-md:px-6 max-md:pt-[100px] max-md:pb-[60px] max-md:gap-6">

        {/* ── Left ── */}
        <div className="flex-[1.4] max-md:order-2 max-md:w-full">
          {/* Chips */}
          <div className="flex gap-2.5 flex-wrap mb-8">
            {['Discord Services', 'Visual Design', 'Roblox Development'].map((chip, i) => (
              <Badge key={chip} text={chip} />
            ))}
          </div>

          {/* Title */}
          <h1
            className="hero-title-anim text-[40px] font-extrabold leading-[1.3] mb-10
              max-md:text-2xl max-[480px]:text-xl"
            style={{ animationDelay: '0.3s' }}
          >
            Jasa Digital Terpercaya<br />
            harga fleksibel, kualitas maksimal<br />
            Discord • Design • Roblox<br />
            semua dalam satu tempat.
          </h1>

          {/* Buttons */}
          <div
            className="hero-btn-anim flex gap-4 flex-wrap max-md:flex-col max-md:gap-3"
            style={{ animationDelay: '0.5s' }}
          >
            {/* Primary */}
            <button
              ref={primaryRef}
              onClick={() => document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })}
              className="btn-ripple bg-[var(--orange)] text-soft border-none rounded-xl px-8 py-[15px]
                font-inter text-sm text-white font-semibold cursor-pointer flex items-center gap-[9px]
                transition-all duration-[250ms] cubic-bezier-smooth
                hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-[0_8px_28px_rgba(247,193,81,0.5)]
                active:scale-[0.97]
                max-md:w-full max-md:justify-center"
            >
              Lihat Produk
            </button>

            {/* Outline */}
            <a
              ref={outlineRef}
              href="https://discord.gg/7t9qxvqXyV"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ripple bg-transparent text-accent2 text-[var(--orange)] border-2 border-accent2 border-[var(--orange)] rounded-xl px-8 py-[13px]
                font-inter text-sm font-semibold cursor-pointer flex items-center gap-[9px]
                transition-all duration-[250ms]
                hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[rgba(247,193,81,0.08)]
                active:scale-[0.97]
                max-md:w-full max-md:justify-center"
            >
              <Image
                src='/discord-orange.svg'
                alt='discord'
                width={32}
                height={32}
                className="icon-wobble w-8 h-8 object-contain "
              />
              Pesan Sekarang
            </a>
          </div>
        </div>

        {/* ── Right (Mascot) ── */}
        <div className="mascot-anim flex-[0_0_360px] flex justify-center items-center
          relative min-h-[360px]
          max-md:order-1 max-md:flex-none max-md:w-full max-md:min-h-[200px]
          max-[480px]:min-h-[170px]"
          style={{ animationDelay: '0.2s' }}
        >
          <Image
            src="/maskot-nobg.png"
            alt="Maskot NEGOXIA"
            width={300}
            height={300}
            className="mascot-float relative z-[1] object-contain
              [filter:drop-shadow(0_12px_28px_rgba(44,19,22,0.12))]
              max-md:w-[200px] max-[480px]:w-[160px]"
            onError={(e) => { e.currentTarget.src = '/maskot.png'; }}
          />
        </div>
      </div>
    </section>
  );
}

'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';

/**
 * Custom hook for ripple effect on buttons
 */
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

export default function PricingCard({
  title,
  price,
  targetAudience = [],
  features = [],
  guarantee,
  delay = 0,
  icon = "/discord.svg"
}) {
  const cardRef = useRef(null);
  const btnRef = useRef(null);
  const createRipple = useRipple();

  // Button Ripple Effect
  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const onClick  = (e) => createRipple(btn, e.clientX, e.clientY);
    const onTouch  = (e) => { const t = e.touches[0]; createRipple(btn, t.clientX, t.clientY); };
    btn.addEventListener('click',      onClick);
    btn.addEventListener('touchstart', onTouch, { passive: true });
    return () => {
      btn.removeEventListener('click',      onClick);
      btn.removeEventListener('touchstart', onTouch);
    };
  }, [createRipple]);

  // Card Tilt Effect
  useEffect(() => {
    if (window.innerWidth <= 768) return;
    const el = cardRef.current;
    if (!el) return;

    let raf = null, tx = 0, ty = 0, cx = 0, cy = 0, on = false;
    const deg = 6;
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
      el.style.transform = `perspective(1000px) rotateY(${cx}deg) rotateX(${-cy}deg) translateY(${on ? -8 : 0}px) scale(${on ? 1.012 : 1})`;
      el.style.boxShadow = `${-cx * 2}px ${cy * 1.5 + (on ? 20 : 4)}px ${on ? 48 : 14}px rgba(44,19,22,${on ? 0.18 : 0.08})`;
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
    
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  // Fade up intersection observer — reset on every mount so browser back works
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    // Reset visibility so animation replays on every mount (browser back fix)
    el.classList.remove('visible');

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              if (cardRef.current) cardRef.current.classList.add('visible');
            }, delay * 1000);
            obs.disconnect();
          }
        });
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);

  return (
    <div
      ref={cardRef}
      className="pricing-card card-shine fade-up bg-card rounded-[22px] border-[1.5px] border-stroke 
                 shadow-[0_2px_14px_rgba(44,19,22,0.06)] flex flex-col overflow-hidden"
    >
      <div className="card-top p-[30px_28px_0] text-center">
        <div className="card-icon-wrap flex items-center justify-center gap-3 mb-3.5 group">
          <Image
            src={icon}
            alt={title}
            width={32}
            height={32}
            className="icon-wobble w-8 h-8 object-contain"
          />
          <span className="card-plan-name text-[13px] font-bold uppercase tracking-[0.6px]">{title}</span>
        </div>
      </div>

      <hr className="card-divider border-none border-t-[1.5px] border-brand/[0.09] m-[14px_28px]" />

      <div className="card-price text-center text-sm font-semibold font-inter p-[0_28px_20px] text-brand/75">
        {price}
      </div>

      <div className="card-body p-[0_28px_24px] flex-1 flex flex-col">
        <p className="body-section-title text-[13px] font-semibold mb-2.5 font-inter">Cocok Untuk:</p>
        <ul className="body-list list-disc pl-[18px] text-[13px] font-inter leading-[1.95] mb-4">
          {targetAudience.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>

        <p className="body-section-title text-[13px] font-semibold mb-2.5 font-inter mt-1">Contoh Fitur:</p>
        <ul className="body-list list-disc pl-[18px] text-[13px] font-inter leading-[1.95] mb-4">
          {features.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>

        <div className="card-guarantee mt-auto pt-3.5 text-[12.5px] font-bold font-inter leading-[1.6]">
          {guarantee}
        </div>
      </div>

      <hr className="card-divider border-none border-t-[1.5px] border-brand/[0.09] m-[14px_28px]" />

      <div className="card-footer p-[0_28px_28px]">
        <button
          ref={btnRef}
          className="btn-ripple bg-accent2 bg-[var(--orange)] text-soft text-white border-none rounded-xl p-[15px]
                     font-inter text-sm font-semibold cursor-pointer w-full flex items-center justify-center gap-2
                     transition-all duration-[250ms] hover:-translate-y-0.5 hover:scale-[1.02] 
                     hover:shadow-[0_8px_28px_rgba(247,193,81,0.5)] active:scale-[0.97]"
          onClick={() => window.open('https://discord.gg/7t9qxvqXyV', '_blank')}
        >
          <Image
            src="/discord-white.svg"
            alt="Discord"
            width={16}
            height={16}
            className="w-4 h-4 object-contain"
          />
          Order Sekarang
        </button>
      </div>
    </div>
  );
}

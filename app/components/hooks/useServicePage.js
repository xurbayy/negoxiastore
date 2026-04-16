'use client';

import { useEffect, useRef } from 'react';

/**
 * Ripple effect hook for buttons
 */
export function useRipple() {
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

/**
 * Attach ripple listeners to an array of button refs.
 * Returns a cleanup function.
 */
export function useRippleEffect(btnRefs, createRipple, deps = []) {
  useEffect(() => {
    const cleanups = [];
    btnRefs.current.forEach((btn) => {
      if (!btn) return;
      const onClick = (e) => createRipple(btn, e.clientX, e.clientY);
      const onTouch = (e) => { const t = e.touches[0]; createRipple(btn, t.clientX, t.clientY); };
      btn.addEventListener('click',      onClick);
      btn.addEventListener('touchstart', onTouch, { passive: true });
      cleanups.push(() => {
        btn.removeEventListener('click',      onClick);
        btn.removeEventListener('touchstart', onTouch);
      });
    });
    return () => cleanups.forEach(fn => fn());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRipple, ...deps]);
}

/**
 * 3-D tilt effect on a card element ref.
 * Only active on desktop (width > 768px).
 */
export function useCardTilt(cardRef) {
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth <= 768) return;
    const el = cardRef.current;
    if (!el) return;

    let raf = null, tx = 0, ty = 0, cx = 0, cy = 0, on = false;
    const deg = 5;
    function lerp(a, b, t) { return a + (b - a) * t; }

    function tick() {
      if (!on && Math.abs(cx) < 0.005 && Math.abs(cy) < 0.005) {
        cx = 0; cy = 0;
        el.style.transform = '';
        el.style.boxShadow = '';
        raf = null;
        return;
      }
      cx = lerp(cx, on ? tx : 0, 0.09);
      cy = lerp(cy, on ? ty : 0, 0.09);
      el.style.transform = `perspective(1000px) rotateY(${cx}deg) rotateX(${-cy}deg) translateY(${on ? -6 : 0}px) scale(${on ? 1.013 : 1})`;
      el.style.boxShadow = `${-cx * 1.5}px ${cy * 1.2 + (on ? 16 : 0)}px ${on ? 44 : 12}px rgba(44,19,22,${on ? 0.15 : 0.06})`;
      raf = requestAnimationFrame(tick);
    }

    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width  - 0.5) * deg;
      ty = ((e.clientY - r.top)  / r.height - 0.5) * deg;
      on = true;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => { on = false; tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); };

    el.addEventListener('mousemove',  onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mousemove',  onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [cardRef]);
}

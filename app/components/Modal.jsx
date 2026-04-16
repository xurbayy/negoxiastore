'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';

export default function Modal({ isOpen, onClose, title, subtitle, icon, children, footer }) {
  const modalRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  // Only render portal after client mount
  useEffect(() => { setMounted(true); }, []);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Handle tilt effect for modal box (Desktop only)
  useEffect(() => {
    if (!isOpen || window.innerWidth <= 768) return;
    const el = modalRef.current;
    if (!el) return;

    let raf = null, tx = 0, ty = 0, cx = 0, cy = 0, on = false;
    const deg = 4;
    function lerp(a, b, t) { return a + (b - a) * t; }
    
    function tick() {
      if (!on && Math.abs(cx) < 0.003 && Math.abs(cy) < 0.003) {
        cx = 0; cy = 0;
        el.style.transform = '';
        el.style.boxShadow = '';
        raf = null; return;
      }
      cx = lerp(cx, on ? tx : 0, 0.08);
      cy = lerp(cy, on ? ty : 0, 0.08);
      el.style.transform = `perspective(1000px) rotateX(${-cy}deg) rotateY(${cx}deg) translateY(${on ? -8 : 0}px)`;
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
  }, [isOpen]);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div 
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(44,19,22,0.55)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        ref={modalRef}
        className="bg-card rounded-[22px] border-[1.5px] border-stroke shadow-[0_24px_64px_rgba(44,19,22,0.22)] w-full max-w-[560px] max-h-[90vh] overflow-y-auto relative transform transition-transform duration-350"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          className="absolute top-[18px] right-5 bg-transparent border-none cursor-pointer w-8 h-8 rounded-lg flex items-center justify-center text-brand/50 text-xl hover:bg-brand/10 hover:text-brand transition-colors z-10"
          onClick={onClose}
        >
          ✕
        </button>
        
        <div className="text-center p-[28px_40px_16px] border-b-[1.5px] border-stroke">
          <div className="flex items-center justify-center gap-2.5 mb-1 group">
            {icon && <Image src={icon} alt="icon" width={26} height={26} className="icon-wobble w-[26px] h-[26px] object-contain" />}
            <span className="text-[13px] font-bold uppercase tracking-[0.5px]">{title}</span>
          </div>
          {subtitle && <p className="text-[13px] font-inter text-brand/70 leading-[1.7] mt-2.5">{subtitle}</p>}
        </div>

        <div className="p-[24px_36px_28px]">
          {children}
        </div>

        {footer && (
          <div className="p-[0_36px_28px] flex justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

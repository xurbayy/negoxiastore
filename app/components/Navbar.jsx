'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';

export default function Navbar() {
  const [scrolled, setScrolled]     = useState(false);
  const [menuOpen, setMenuOpen]      = useState(false);
  const [activeSection, setActive]   = useState('hero');
  const menuRef  = useRef(null);
  const btnRef   = useRef(null);
  const pathname = usePathname();
  const router   = useRouter();
  const isHome   = pathname === '/';

  /* ── Scroll: progress bar + nav style + active link ── */
  useEffect(() => {
    const bar      = document.getElementById('scroll-bar');
    const sections = document.querySelectorAll('section[id]');

    function onScroll() {
      const max = document.body.scrollHeight - window.innerHeight;
      if (bar) bar.style.width = max > 0 ? `${(window.scrollY / max) * 100}%` : '0%';

      setScrolled(window.scrollY > 40);

      let cur = 'hero';
      sections.forEach((s) => {
        if (window.scrollY >= s.offsetTop - 140) cur = s.id;
      });
      setActive(cur);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── Close menu on outside click ── */
  useEffect(() => {
    function handleClick(e) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  function smoothTo(id) {
    setMenuOpen(false);
    if (isHome) {
      // Sudah di halaman utama, langsung scroll
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } else {
      // Di halaman lain, navigate ke home dulu lalu scroll ke section
      router.push(`/#${id}`);
    }
  }

  const links = [
    { label: 'Beranda',     id: 'hero' },
    { label: 'Produk',      id: 'services' },
    { label: 'Tentang Kami',id: 'whyus' },
  ];

  return (
    <nav className="fixed top-4 left-0 right-0 z-[100] flex justify-center px-10">
      {/* ── Desktop nav inner ── */}
      <div
        className={`w-4/5 rounded-2xl px-9 py-4 flex items-center justify-between border border-stroke
          shadow-[0_4px_24px_rgba(44,19,22,0.09)]
          transition-all duration-300
          ${scrolled
            ? 'bg-[rgba(255,247,226,0.88)] backdrop-blur-2xl shadow-[0_8px_32px_rgba(44,19,22,0.13)]'
            : 'bg-card'
          }`}
      >
        {/* Logo */}
        <a
          href="/#hero"
          onClick={(e) => { e.preventDefault(); smoothTo('hero'); }}
          className="flex items-center gap-2.5 font-bold text-[17px] no-underline text-brand
            logo-icon-wobble group"
        >
          <Image
            src="/negoxia.png"
            alt="logo"
            width={28}
            height={28}
            className="icon-wobble"
          />
          <span><span className="text-accent2">NEGO</span>XIA STORE</span>
        </a>

        {/* Desktop links */}
        <ul className="hidden md:flex gap-9 list-none">
          {links.map((l) => (
            <li key={l.id}>
              <a
                href={isHome ? `#${l.id}` : `/#${l.id}`}
                onClick={(e) => { e.preventDefault(); smoothTo(l.id); }}
                className={`nav-link-item no-underline text-brand text-sm font-medium
                  hover:text-accent2 transition-colors duration-200
                  ${isHome && activeSection === l.id ? 'active text-accent2' : ''}`}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Hamburger */}
        <button
          ref={btnRef}
          aria-label="Menu"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          className={`hamburger md:hidden flex flex-col justify-center gap-[5px]
            w-9 h-9 cursor-pointer bg-transparent border-none p-1 z-[200]
            ${menuOpen ? 'open' : ''}`}
        >
          <span /><span /><span />
        </button>
      </div>

      {/* ── Mobile popup menu ── */}
      <div
        ref={menuRef}
        className={`mobile-menu fixed top-20 right-6 z-[150]
          bg-[rgba(255,247,226,0.97)] backdrop-blur-2xl
          rounded-[20px] border-[1.5px] border-stroke
          shadow-[0_16px_48px_rgba(44,19,22,0.18),0_4px_16px_rgba(44,19,22,0.10)]
          py-3 px-2 min-w-[200px] flex flex-col gap-1
          ${menuOpen ? 'open' : ''}`}
      >
        {links.map((l) => (
          <a
            key={l.id}
            href={isHome ? `#${l.id}` : `/#${l.id}`}
            onClick={(e) => { e.preventDefault(); smoothTo(l.id); }}
            className="flex items-center text-[15px] font-semibold text-brand no-underline
              px-5 py-3 rounded-xl hover:bg-[rgba(247,193,81,0.15)] hover:text-accent2
              transition-colors duration-200"
          >
            {l.label}
          </a>
        ))}
      </div>

      {/* Backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[140]"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </nav>
  );
}

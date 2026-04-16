'use client';

import Link from 'next/link';
import ScrollProgress from './ScrollProgress';
import Navbar from './Navbar';
import Footer from './Footer';

/**
 * Shared page layout for service detail pages.
 *
 * Props:
 *  - breadcrumb     : string  — label of the current page in the breadcrumb
 *  - label          : string  — small uppercase label above the title
 *  - title          : ReactNode — h1 content (can contain <br />)
 *  - subtitle       : string  — paragraph below the title
 *  - children       : ReactNode — the page-specific card / content
 */
export default function ServicePageLayout({ breadcrumb, label, title, subtitle, children }) {
  return (
    <>
      <ScrollProgress />
      <Navbar />

      <main className="page-wrap max-w-[1280px] mx-auto pt-[120px] pb-20 px-16 max-md:px-5 max-md:pt-[100px] relative z-[1]">
        {/* Breadcrumb */}
        <nav className="breadcrumb flex items-center gap-2 text-[13px] font-inter text-brand/55 mb-12">
          <Link href="/" className="hover:text-accent2 transition-colors">Beranda</Link>
          <span className="sep text-[11px]">›</span>
          <Link href="/#services" className="hover:text-accent2 transition-colors">Produk</Link>
          <span className="sep text-[11px]">›</span>
          <span className="current text-brand font-semibold">{breadcrumb}</span>
        </nav>

        {/* Page Header */}
        <header className="page-header mb-12">
          <p className="page-label text-xs font-bold uppercase tracking-[2px] text-accent2 mb-3 font-inter">
            {label}
          </p>
          <h1 className="page-title text-[36px] font-extrabold leading-[1.25] mb-4 max-md:text-[26px]">
            {title}
          </h1>
          <p className="page-subtitle text-[15px] font-inter leading-[1.75] text-brand/70 max-w-[640px]">
            {subtitle}
          </p>
        </header>

        {children}
      </main>

      <Footer />
    </>
  );
}

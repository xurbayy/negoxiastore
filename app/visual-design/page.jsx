'use client';

import { useRef } from 'react';
import ServicePageLayout from '../components/ServicePageLayout';
import ServiceCard from '../components/ServiceCard';
import { OrderButton } from '../components/ServiceButtons';
import { useRipple, useRippleEffect } from '../components/hooks/useServicePage';

const DESIGN_COLUMNS = [
  {
    sections: [
      {
        title: 'Desain Utama',
        items: [
          {
            name: 'Logo Design',
            price: 'Rp50.000 – Rp200.000',
            list: [
              'Logo custom (simple – detail)',
              'Sesuai konsep brand / komunitas',
              'File PNG / JPG',
            ]
          }
        ]
      },
      {
        title: 'Banner Discord / Social Media',
        priceRange: 'Rp30.000 – Rp100.000',
        list: [
          'Ukuran sesuai platform',
          'Desain clean & readable',
        ]
      }
    ]
  },
  {
    sections: [
      {
        title: 'Poster / Flyer',
        priceRange: 'Rp40.000 – Rp150.000',
        list: [
          'Cocok buat event / promo',
          'Siap upload',
        ]
      },
      {
        title: 'Add-On & Detail Desain',
        addons: [
          { label: 'Revisi tambahan',      price: 'Rp10.000 / revisi' },
          { label: 'Versi ukuran tambahan', price: 'Rp15.000 / ukuran' },
          { label: 'Mockup preview',        price: 'Rp20.000' },
        ]
      }
    ]
  },
  {
    isCustom: true,
    title: 'Custom Design Request',
    desc: 'Desain di luar list, dibuat sesuai kebutuhan khusus.',
    priceBy: 'Harga: By Request',
    priceRange: '(range umum Rp50.000 – Rp300.000+)',
    examples: [
      'Branding komunitas',
      'Visual marketplace',
      'Asset Discord (icon role, badge, dll)',
      'Konsep visual khusus',
    ],
    workflowTitle: 'Alur Pengerjaan:',
    workflow: [
      'Diskusi konsep & kebutuhan',
      'Deal harga & scope',
      'Proses desain',
      'Preview & revisi',
      'Final file dikirim',
    ]
  }
];

export default function VisualDesignPage() {
  const btnRefs      = useRef([]);
  const createRipple = useRipple();

  useRippleEffect(btnRefs, createRipple);

  const cardFooter = (
    <OrderButton btnRef={el => btnRefs.current[0] = el} fullWidth />
  );

  return (
    <ServicePageLayout
      breadcrumb="Visual Design"
      label="Visual Design"
      title={<>Desain Visual untuk<br />Brand &amp; Komunitas Kamu</>}
      subtitle="Logo, banner, poster, hingga aset custom, semua dibuat rapi, clean, dan sesuai konsep kamu."
    >
      <ServiceCard
        icon="/visual.svg"
        iconAlt="Visual"
        title="Visual Design"
        gridClass="grid-cols-3 max-[1024px]:grid-cols-2 max-md:grid-cols-1"
        footer={cardFooter}
      >
        {DESIGN_COLUMNS.map((col, idx) => (
          <div
            key={idx}
            className={[
              'vd-col p-7 border-r-[1.5px] border-stroke last:border-r-0',
              'max-[1024px]:border-b-[1.5px]',
              'max-[1024px]:[&:nth-child(odd)]:border-r-[1.5px]',
              'max-[1024px]:[&:nth-child(even)]:border-r-0',
              'max-[1024px]:last:border-b-0 max-[1024px]:last:border-r-0 max-[1024px]:last:col-span-full',
              'max-md:border-r-0 max-md:border-b-[1.5px] max-md:last:border-b-0 max-md:last:col-span-auto',
            ].join(' ')}
          >
            {col.isCustom ? (
              <>
                <div className="text-[13px] font-bold mb-1.5 font-inter">{col.title}</div>
                <p className="text-[12.5px] font-inter leading-[1.75] text-brand/80 mb-2.5">{col.desc}</p>
                <div className="text-[12.5px] font-inter mb-2.5">
                  Harga: By Request <strong className="text-[13px] font-bold">{col.priceRange}</strong>
                </div>
                <div className="text-[12px] font-semibold font-inter mt-3.5 mb-1.5">Contoh:</div>
                <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1]">
                  {col.examples.map((ex, i) => <li key={i}>{ex}</li>)}
                </ul>
                <div className="text-[12px] font-semibold font-inter mt-3.5 mb-1.5">{col.workflowTitle}</div>
                <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1]">
                  {col.workflow.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </>
            ) : (
              col.sections.map((sec, sIdx) => (
                <div key={sIdx} className={sIdx > 0 ? 'mt-[22px]' : ''}>
                  <div className="text-[13px] font-bold mb-1.5 font-inter">{sec.title}</div>
                  {sec.priceRange && <div className="text-[13px] font-bold font-inter mb-2.5">{sec.priceRange}</div>}
                  {sec.items && sec.items.map((item, iIdx) => (
                    <div key={iIdx}>
                      <div className="text-[12.5px] font-inter leading-[1.7] mb-1">
                        {item.name}<br />
                        <strong className="text-[13px] font-bold">{item.price}</strong>
                      </div>
                      <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1] mb-2.5">
                        {item.list.map((li, lIdx) => <li key={lIdx}>{li}</li>)}
                      </ul>
                    </div>
                  ))}
                  {sec.list && (
                    <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1]">
                      {sec.list.map((li, lIdx) => <li key={lIdx}>{li}</li>)}
                    </ul>
                  )}
                  {sec.addons && sec.addons.map((addon, aIdx) => (
                    <div key={aIdx} className="text-[12.5px] font-inter leading-[1.7] mb-1">
                      <span className="block mb-0">{addon.label}</span>
                      <span className="block font-bold mb-2">{addon.price}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        ))}
      </ServiceCard>
    </ServicePageLayout>
  );
}

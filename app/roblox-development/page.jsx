'use client';

import { useState, useRef } from 'react';
import Modal from '../components/Modal';
import ServicePageLayout from '../components/ServicePageLayout';
import ServiceCard from '../components/ServiceCard';
import { OrderButton, GhostButton } from '../components/ServiceButtons';
import { useRipple, useRippleEffect } from '../components/hooks/useServicePage';

const ROBLOX_COLUMNS = [
  {
    items: [
      {
        title: 'Roleplay Map',
        price: 'Rp10.000.000 – Rp15.000.000',
        list: [
          'Map roleplay skala besar',
          'Area kota / village / custom environment',
          'Interior & eksterior detail',
          'Sistem pendukung (jika dibutuhkan)',
        ]
      },
      {
        title: 'Club / Party Map',
        price: 'Rp3.000.000 – Rp6.000.000',
        list: [
          'Stage DJ / dance floor',
          'Lighting aesthetic',
          'Dekorasi party',
          'Layout optimized untuk player ramai',
        ]
      }
    ]
  },
  {
    items: [
      {
        title: 'Obby / Parkour Map',
        price: 'Rp2.000.000 – Rp3.000.000',
        list: [
          'Track parkour custom',
          'Level progression',
          'Checkpoint system',
          'Design clean & playable',
        ]
      },
      {
        title: 'Hangout Map',
        price: 'Rp4.000.000 – Rp6.000.000',
        list: [
          'Area santai & social space',
          'Spot aesthetic',
          'Optimized untuk komunitas',
          'Detail environment nyaman',
        ]
      }
    ]
  },
  {
    items: [
      {
        title: 'Expedition Mount / Mount Obby',
        price: 'Rp3.000.000 – Rp7.000.000',
        list: [
          'Map pendakian / survival style',
          'Elevation & terrain detail',
          'Challenge area',
          'Atmosphere immersive',
        ]
      },
      {
        title: 'Lobby / Showcase Map',
        price: 'Rp1.000.000 – Rp3.000.000',
        list: [
          'Lobby game utama',
          'Area showcase produk / gamepass',
          'Clean & professional design',
        ]
      }
    ]
  },
  {
    items: [
      {
        title: 'Custom Map (Sesuai Konsep Client)',
        price: 'Rp3.000.000 – Rp15.000.000+',
        list: [
          'Dibuat sesuai ide & konsep',
          'Skala fleksibel',
          'Bisa termasuk sistem tambahan',
          'Full diskusi sebelum produksi',
        ]
      },
      {
        title: 'Garansi',
        list: [
          'Garansi 7 Hari setelah map diserahkan',
          'Bug fixing sesuai fitur & konsep yang disepakati',
          'Perbaikan minor (lighting, positioning, detail kecil)',
        ]
      }
    ]
  },
  {
    items: [
      {
        title: 'Catatan Penting',
        isNote: true,
        text: 'Harga di samping adalah range estimasi. Harga final tergantung:',
        list: [
          'Tingkat kompleksitas',
          'Besar map',
          'Detail asset & environment',
          'Apakah membutuhkan scripting khusus',
          'Deadline pengerjaan',
        ]
      }
    ]
  }
];

export default function RobloxDevelopmentPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const btnRefs      = useRef([]);
  const createRipple = useRipple();

  useRippleEffect(btnRefs, createRipple);

  const cardFooter = (
    <>
      <GhostButton btnRef={el => btnRefs.current[0] = el} onClick={() => setIsModalOpen(true)}>
        Maintenance
      </GhostButton>
      <OrderButton btnRef={el => btnRefs.current[1] = el} fullWidth />
    </>
  );

  return (
    <ServicePageLayout
      breadcrumb="Roblox Development"
      label="Roblox Development"
      title={<>Map Roblox Custom<br />Sesuai Konsep Kamu</>}
      subtitle="Dari roleplay hingga obby, dibuat detail, clean, dan siap publish ke Roblox Studio."
    >
      <ServiceCard
        icon="/roblox.svg"
        iconAlt="Roblox"
        title="Roblox Development"
        gridClass="grid-cols-5 max-[1200px]:grid-cols-3 max-md:grid-cols-1"
        footer={cardFooter}
      >
        {ROBLOX_COLUMNS.map((col, idx) => (
          <div
            key={idx}
            className={[
              'rb-col p-[24px_22px] border-r-[1.5px] border-stroke last:border-r-0',
              'max-[1200px]:border-b-[1.5px]',
              'max-[1200px]:[&:nth-child(3n)]:border-r-0',
              'max-[1200px]:[&:nth-last-child(-n+2)]:border-b-0',
              'max-md:border-r-0 max-md:border-b-[1.5px] max-md:last:border-b-0',
            ].join(' ')}
          >
            {col.items.map((item, iIdx) => (
              <div key={iIdx} className={iIdx > 0 ? 'mt-5' : ''}>
                <div className="text-[13px] font-bold font-inter mb-1">{item.title}</div>
                {item.price && <div className="text-[12.5px] font-bold font-inter mb-2.5">{item.price}</div>}
                {item.isNote && <p className="text-[12px] font-inter leading-[1.75] text-brand/80 mb-2.5">{item.text}</p>}
                <ul className="list-disc pl-4 text-[12px] font-inter leading-[2]">
                  {item.list.map((li, lIdx) => <li key={lIdx}>{li}</li>)}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </ServiceCard>

      {/* Modal – Maintenance */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Maintenance"
        subtitle="Maintenance adalah layanan tambahan setelah project selesai dan di luar garansi."
        icon="/roblox.svg"
        footer={<OrderButton btnRef={el => btnRefs.current[2] = el} />}
      >
        <div className="text-[13px] font-bold font-inter mt-4 mb-2 first:mt-0">Maintenance mencakup:</div>
        <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1]">
          <li>Penambahan fitur baru</li>
          <li>Penambahan area / ekspansi map</li>
          <li>Perubahan konsep atau layout</li>
          <li>Upgrade sistem / scripting tambahan</li>
          <li>Rework sebagian map</li>
          <li>Improvement visual atau optimasi lanjutan</li>
        </ul>
        <div className="text-[13px] font-bold font-inter mt-4 mb-2">Catatan Penting</div>
        <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1]">
          <li>Harga maintenance tidak memiliki patokan tetap</li>
          <li>Biaya menyesuaikan tingkat kompleksitas dan kebutuhan update.</li>
        </ul>
      </Modal>
    </ServicePageLayout>
  );
}

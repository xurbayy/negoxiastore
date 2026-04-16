'use client';

import { useState, useRef } from 'react';
import Modal from '../components/Modal';
import ServicePageLayout from '../components/ServicePageLayout';
import ServiceCard from '../components/ServiceCard';
import { OrderButton, GhostButton } from '../components/ServiceButtons';
import { useRipple, useRippleEffect } from '../components/hooks/useServicePage';

const BOT_COLUMNS = [
  {
    sections: [
      {
        title: 'Fitur Dasar (Wajib)',
        subtitle: 'Core Bot Setup',
        price: 'Rp50.000',
        list: [
          'Pembuatan bot dari nol',
          'Setup token & permission',
          'Invite ke server',
          'Prefix / slash command',
        ]
      },
      {
        title: 'Moderation Features',
        items: [
          { name: 'Kick / Ban / Unban', price: 'Rp20.000' },
          { name: 'Mute / Timeout', price: 'Rp20.000' },
          { name: 'Clear Chat / Purge', price: 'Rp15.000' },
          { name: 'Anti-link / Anti-spam', price: 'Rp25.000' },
          { name: 'Warning System', price: 'Rp25.000' },
        ]
      }
    ]
  },
  {
    sections: [
      {
        title: 'Utility Features',
        items: [
          { name: 'Custom Command (teks)', price: 'Rp10.000 / command' },
          { name: 'Auto Role', price: 'Rp20.000' },
          { name: 'Welcome / Leave Message', price: 'Rp20.000' },
          { name: 'Embed Message System', price: 'Rp15.000' },
          { name: 'Server Info / User Info', price: 'Rp15.000' },
        ]
      },
      {
        title: 'System Features',
        items: [
          { name: 'Ticket System', price: 'Rp40.000' },
          { name: 'Verification System', price: 'Rp40.000' },
          { name: 'Logging System', price: 'Rp30.000' },
          { name: 'Leveling System', price: 'Rp50.000' },
        ]
      }
    ]
  },
  {
    isCustom: true,
    title: 'Custom Feature (Request Khusus)',
    desc: 'Fitur yang tidak ada di daftar, dibuat khusus sesuai ide & kebutuhan client.',
    range: 'By Request',
    rangeSub: '(range umum Rp50.000 – Rp300.000+)',
    examples: [
      'Sistem marketplace custom',
      'Sistem role unik',
      'Sistem point / reward khusus',
      'Integrasi flow server tertentu',
      'Logic bot sesuai konsep komunitas',
    ],
    noteTitle: 'Harga ditentukan dari:',
    notes: [
      'Tingkat kompleksitas',
      'Logic & alur sistem',
      'Apakah butuh database / API',
    ]
  },
  {
    sections: [
      {
        title: 'Garansi',
        list: [
          'Garansi 3 hari setelah bot diserahkan',
          'Bug fixing sesuai fitur yang disepakati',
          'Update & penambahan fitur berbayar',
        ]
      },
      {
        title: 'Catatan Penting',
        list: [
          'Semua fitur dibahas & disepakati sebelum pengerjaan',
          'Harga bisa berubah jika scope bertambah',
          'NEGOXIA tidak menjual source code mentah kecuali disepakati',
        ]
      }
    ]
  }
];

const HOSTING_PACKAGES = [
  {
    name: 'PACKAGE 1 | 2 vCore | 1GB RAM | 5GB SSD Storage',
    prices: [
      { period: 'Monthly',       value: 'Rp10.000 / bulan' },
      { period: 'Quarterly',     value: 'Rp20.000 / 3 bulan' },
      { period: 'Semi-Annually', value: 'Rp35.000 / 6 bulan' },
      { period: 'Annually',      value: 'Rp65.000 / tahun' },
    ]
  },
  {
    name: 'PACKAGE 3 | 2 vCore | 3GB RAM | 15GB SSD Storage',
    prices: [
      { period: 'Monthly',       value: 'Rp20.000 / bulan' },
      { period: 'Quarterly',     value: 'Rp50.000 / 3 bulan' },
      { period: 'Semi-Annually', value: 'Rp95.000 / 6 bulan' },
      { period: 'Annually',      value: 'Rp185.000 / tahun' },
    ]
  },
  {
    name: 'PACKAGE 2 | 2 vCore | 2GB RAM | 10GB SSD Storage',
    prices: [
      { period: 'Monthly',       value: 'Rp15.000 / bulan' },
      { period: 'Quarterly',     value: 'Rp35.000 / 3 bulan' },
      { period: 'Semi-Annually', value: 'Rp65.000 / 6 bulan' },
      { period: 'Annually',      value: 'Rp125.000 / tahun' },
    ]
  },
  {
    name: 'PACKAGE 4 | 2 vCore | 4GB RAM | 20GB SSD Storage',
    prices: [
      { period: 'Monthly',       value: 'Rp25.000 / bulan' },
      { period: 'Quarterly',     value: 'Rp65.000 / 3 bulan' },
      { period: 'Semi-Annually', value: 'Rp125.000 / 6 bulan' },
      { period: 'Annually',      value: 'Rp245.000 / tahun' },
    ]
  }
];

export default function CustomDiscordBotPage() {
  const [modalOpen, setModalOpen] = useState(null);
  const btnRefs      = useRef([]);
  const createRipple = useRipple();

  useRippleEffect(btnRefs, createRipple, [modalOpen]);

  const cardFooter = (
    <>
      <GhostButton btnRef={el => btnRefs.current[0] = el} onClick={() => setModalOpen('hosting')}>
        Bot Hosting
      </GhostButton>
      <GhostButton btnRef={el => btnRefs.current[1] = el} onClick={() => setModalOpen('maintenance')}>
        Maintenance
      </GhostButton>
      <OrderButton btnRef={el => btnRefs.current[2] = el} fullWidth />
    </>
  );

  return (
    <ServicePageLayout
      breadcrumb="Custom Discord Bot"
      label="Custom Discord Bot"
      title={<>Bot Discord Custom<br />Sesuai Kebutuhan Kamu</>}
      subtitle="Dibuat dari nol sesuai ide dan kebutuhan server kamu. Fitur dasar hingga sistem kompleks, semua bisa dibahas dulu."
    >
      <ServiceCard
        icon="/discord.svg"
        iconAlt="Discord"
        title="Custom Discord Bot"
        subtitle="Rp20.000 – Rp50.000"
        gridClass="grid-cols-4 max-[1100px]:grid-cols-2 max-md:grid-cols-1"
        footer={cardFooter}
      >
        {BOT_COLUMNS.map((col, idx) => (
          <div
            key={idx}
            className={[
              'bot-col p-[28px_24px_24px] border-r-[1.5px] border-stroke last:border-r-0',
              col.isCustom ? 'bg-accent2/5' : '',
              'max-[1100px]:border-b-[1.5px]',
              'max-[1100px]:[&:nth-child(odd)]:border-r-[1.5px]',
              'max-[1100px]:[&:nth-child(even)]:border-r-0',
              'max-[1100px]:[&:nth-child(3)]:border-b-0',
              'max-[1100px]:[&:nth-child(4)]:border-b-0',
              'max-md:border-r-0 max-md:border-b-[1.5px] max-md:last:border-b-0',
            ].join(' ')}
          >
            {col.isCustom ? (
              <>
                <div className="text-[13px] font-bold mb-2 font-inter">{col.title}</div>
                <p className="text-[12.5px] font-inter leading-[1.7] text-brand/75 mb-2.5">{col.desc}</p>
                <div className="text-[13px] font-bold text-brand font-inter mb-2.5 leading-[1.5]">
                  Harga: {col.range}
                  <span className="block font-normal text-[12px] text-brand/65">{col.rangeSub}</span>
                </div>
                <div className="text-[12px] font-medium text-brand/60 font-inter mb-1.5">Contoh:</div>
                <ul className="list-disc pl-4 text-[12px] font-inter leading-[2] text-brand/75 mb-3">
                  {col.examples.map((ex, i) => <li key={i}>{ex}</li>)}
                </ul>
                <div className="text-[12px] font-inter leading-[1.75] text-brand/70 mt-3">
                  <strong className="text-brand">{col.noteTitle}</strong><br />
                  {col.notes.map((n, i) => <span key={i} className="block">{n}</span>)}
                </div>
              </>
            ) : (
              col.sections.map((sec, sIdx) => (
                <div key={sIdx} className={sIdx > 0 ? 'mt-4.5' : ''}>
                  <div className="text-[13px] font-bold mb-2 font-inter">{sec.title}</div>
                  {sec.subtitle && <div className="text-[12px] font-medium text-brand/60 font-inter mb-1.5">{sec.subtitle}</div>}
                  {sec.price    && <div className="text-[13px] font-bold text-brand font-inter mb-0.5">{sec.price}</div>}
                  {sec.list && (
                    <ul className="list-disc pl-4 text-[12.5px] font-inter leading-[2] text-brand">
                      {sec.list.map((li, lIdx) => <li key={lIdx}>{li}</li>)}
                    </ul>
                  )}
                  {sec.items && sec.items.map((item, iIdx) => (
                    <div key={iIdx} className="flex items-baseline justify-between gap-2 flex-wrap text-[12.5px] font-inter leading-[2]">
                      <span>{item.name}</span>
                      <span className="font-bold text-[12px] whitespace-nowrap shrink-0">{item.price}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        ))}
      </ServiceCard>

      {/* Modal – Bot Hosting */}
      <Modal
        isOpen={modalOpen === 'hosting'}
        onClose={() => setModalOpen(null)}
        title="Bot Hosting"
        icon="/discord.svg"
        footer={<OrderButton btnRef={el => btnRefs.current[3] = el} />}
      >
        <div className="grid grid-cols-2 gap-[28px_40px] mb-7 max-sm:grid-cols-1">
          {HOSTING_PACKAGES.map((pkg, i) => (
            <div key={i}>
              <div className="text-[13px] font-bold font-inter mb-2.5">{pkg.name}</div>
              <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1]">
                {pkg.prices.map((p, pi) => (
                  <li key={pi} className="flex items-baseline justify-between flex-wrap gap-1.5">
                    <span className="text-brand/60">{p.period}</span>
                    <span className="font-bold">{p.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-5 pt-5 border-t-[1.5px] border-stroke max-sm:grid-cols-1">
          <div>
            <div className="text-[13px] font-bold font-inter mb-2.5">Detail Spesifikasi</div>
            <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2]">
              <li>CPU menggunakan Intel Xeon E5-2683 v3</li>
              <li>Setiap package menggunakan 2 vCore sebagai default</li>
              <li>Menggunakan SSD Storage berkecepatan tinggi</li>
              <li>Mendapatkan 1 port tambahan</li>
              <li>Tidak termasuk database (0 database)</li>
              <li>Tersedia 3 slot backup</li>
              <li>Lokasi server di Singapore (stabil &amp; low latency Indonesia)</li>
            </ul>
          </div>
          <div>
            <div className="text-[13px] font-bold font-inter mb-2.5">Catatan Penting</div>
            <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2]">
              <li>Harga menyesuaikan dengan konfigurasi yang dipilih</li>
              <li>Semakin tinggi spesifikasi, semakin optimal performa bot</li>
              <li>Tidak menjual hosting terpisah</li>
              <li>Hosting sudah termasuk maintenance database</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Modal – Maintenance */}
      <Modal
        isOpen={modalOpen === 'maintenance'}
        onClose={() => setModalOpen(null)}
        title="Maintenance"
        icon="/discord.svg"
        footer={<OrderButton btnRef={el => btnRefs.current[4] = el} />}
      >
        <div className="text-center mb-6">
          <p className="text-[13.5px] font-inter text-brand/70 leading-[1.7]">
            Maintenance adalah layanan tambahan setelah project selesai dan di luar garansi.
          </p>
        </div>
        <div className="text-[13px] font-bold font-inter mt-5 mb-2.5">Maintenance mencakup:</div>
        <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1]">
          <li>Penambahan fitur baru</li>
          <li>Upgrade sistem / logic bot</li>
          <li>Integrasi API baru</li>
          <li>Perubahan alur command</li>
          <li>Optimasi performa bot</li>
          <li>Rework sebagian sistem</li>
        </ul>
        <div className="text-[13px] font-bold font-inter mt-5 mb-0">Harga: By Request</div>
        <div className="text-[13px] font-inter mt-1.5">
          <span className="font-bold text-[14px]">(range umum Rp30.000 – Rp300.000+)</span>
        </div>
        <div className="text-[13px] font-bold font-inter mt-5 mb-0">Catatan Penting</div>
        <p className="text-[12.5px] font-inter leading-[1.9] text-brand/70">Harga ditentukan dari:</p>
        <ul className="list-disc pl-[18px] text-[12.5px] font-inter leading-[2.1]">
          <li>Kompleksitas fitur tambahan</li>
          <li>Apakah perlu database / API tambahan</li>
          <li>Perubahan struktur sistem bot</li>
        </ul>
      </Modal>
    </ServicePageLayout>
  );
}

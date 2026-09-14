import PageSkeleton from '../components/PageSkeleton';

// Skeleton NEXO Pass: judul + daftar perk + kartu pembelian.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-4xl" cards={4} cardRows={2} />;
}

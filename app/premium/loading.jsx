import PageSkeleton from '../components/PageSkeleton';

// Skeleton NEXO Pass - meniru UI asli (rata tengah): pill NEXO Pass, judul,
// harga besar, deskripsi, lalu kartu QRIS. Lihat varian 'premium'.
export default function Loading() {
  return <PageSkeleton variant="premium" />;
}

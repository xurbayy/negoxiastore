import PageSkeleton from '../components/PageSkeleton';

// Skeleton NEXOPASS - meniru UI asli (rata tengah): pill NEXOPASS, judul,
// harga besar, deskripsi, lalu kartu QRIS. Lihat varian 'premium'.
export default function Loading() {
  return <PageSkeleton variant="premium" />;
}

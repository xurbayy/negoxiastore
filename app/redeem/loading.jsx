import PageSkeleton from '../components/PageSkeleton';

// Skeleton Redeem - meniru UI asli: kartu form (input kode + tombol + kotak
// Turnstile) lalu kartu riwayat klaim. Lihat varian 'redeem'.
export default function Loading() {
  return <PageSkeleton variant="redeem" />;
}

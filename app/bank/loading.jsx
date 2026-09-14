import PageSkeleton from '../components/PageSkeleton';

// Skeleton Bank Watch - meniru UI asli: 3 kartu ringkasan (kartu terakhir
// ber-border danger) + tabel 50 Hutang Terberat. Lihat varian 'bank'.
export default function Loading() {
  return <PageSkeleton variant="bank" />;
}

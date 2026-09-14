import PageSkeleton from './components/PageSkeleton';

// Skeleton halaman depan - kerangkanya meniru UI asli (hero + statistik live +
// kartu game). Lihat komponen PageSkeleton varian 'home'.
export default function Loading() {
  return <PageSkeleton variant="home" />;
}

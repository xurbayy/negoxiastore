import PageSkeleton from '../components/PageSkeleton';

// Skeleton bank: kotak statistik + tabel hutang terberat.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-4xl" stats table />;
}

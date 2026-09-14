import PageSkeleton from '../components/PageSkeleton';

// Skeleton shop: katalog kategori + grid kartu item.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-5xl" cards={6} cardRows={3} />;
}

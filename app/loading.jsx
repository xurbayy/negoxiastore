import PageSkeleton from './components/PageSkeleton';

// Skeleton halaman depan: hero + statistik live, lalu kartu game.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-5xl" stats cards={2} cardRows={3} />;
}

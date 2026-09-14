import PageSkeleton from '../components/PageSkeleton';

// Skeleton panel admin: sidebar + dashboard. Panel paling berat karena
// memuat snapshot + series + activity log sekaligus.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-6xl" stats table />;
}

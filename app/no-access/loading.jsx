import PageSkeleton from '../components/PageSkeleton';

// Skeleton halaman tidak punya akses - satu kartu di tengah.
export default function Loading() {
  return <PageSkeleton variant="simple" />;
}

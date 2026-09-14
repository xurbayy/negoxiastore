import PageSkeleton from '../components/PageSkeleton';

// Skeleton redeem: form kode + riwayat klaim.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-2xl" cards={2} cardRows={2} />;
}

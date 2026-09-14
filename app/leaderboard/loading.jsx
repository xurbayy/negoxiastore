import PageSkeleton from '../components/PageSkeleton';

// Skeleton leaderboard: judul + tabel pemain + tabel guild.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-4xl" table />;
}

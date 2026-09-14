import PageSkeleton from '../components/PageSkeleton';

// Skeleton Leaderboard - meniru UI asli: tabel Top 10 Pemain + tabel Guild
// Terkuat. Lihat komponen PageSkeleton varian 'leaderboard'.
export default function Loading() {
  return <PageSkeleton variant="leaderboard" />;
}

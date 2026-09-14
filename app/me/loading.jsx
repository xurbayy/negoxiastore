import PageSkeleton from '../components/PageSkeleton';

// Skeleton Profil Saya - meniru UI asli: kartu header gelap (avatar, nama, bar
// XP, statistik), banner status, lalu grid misi + riwayat + sidebar.
// Lihat varian 'me'.
export default function Loading() {
  return <PageSkeleton variant="me" />;
}

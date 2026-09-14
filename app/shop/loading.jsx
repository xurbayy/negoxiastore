import PageSkeleton from '../components/PageSkeleton';

// Skeleton NEXO Shop - meniru UI asli: judul + pill kategori + grid kartu item
// (emoji, nama, deskripsi, harga, stok). Lihat PageSkeleton varian 'shop'.
export default function Loading() {
  return <PageSkeleton variant="shop" />;
}

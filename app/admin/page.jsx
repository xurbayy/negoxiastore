import { getAdminSession, getSession } from '../lib/session';
import { redirect } from 'next/navigation';
import AdminFooter from '../components/admin/AdminFooter';
import AdminShell from '../components/admin/AdminShell';

export const metadata = {
  title: 'Admin Panel',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  // 1. Punya session admin -> langsung buka panel kelola.
  const admin = await getAdminSession();
  if (admin) {
    return (
      <>
        <AdminShell username={admin.adminUsername} avatar={admin.adminAvatar} />
        <AdminFooter />
      </>
    );
  }

  // 2. Belum, TAPI sudah login Discord -> coba naikkan otomatis (route
  //    admin-grant yang putuskan: ID admin -> cookie admin + /admin,
  //    ID lain -> /no-access). Cookie tidak boleh ditulis di render page.
  const session = await getSession();
  if (session) {
    redirect('/api/auth/admin-grant');
  }

  // 3. Belum login sama sekali -> halaman masuk (Discord-first).
  redirect('/admin/login');
}

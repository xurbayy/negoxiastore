import { redirect } from 'next/navigation';
import { getAdminSession } from '../../lib/session';
import { totpConfigured, getPending2fa } from '../../lib/admin-2fa';
import VerifyForm from '../../components/admin/VerifyForm';

export const metadata = {
  title: 'Verifikasi Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

// /admin/verify - langkah 2 login admin. Server-only guard: halaman ini
// cuma tampil kalau ada cookie pending 2FA dan 2FA memang dikonfigurasi.
export default async function AdminVerifyPage() {
  if (!totpConfigured()) redirect('/admin/login');
  const pending = await getPending2fa();
  if (!pending) redirect('/admin/login');
  // Session admin masih utuh? (mis. tab lama) -> langsung panel.
  const admin = await getAdminSession();
  if (admin) redirect('/admin');
  return <VerifyForm />;
}

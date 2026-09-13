import { NextResponse } from 'next/server';
import { getSession, createAdminSession } from '../../../lib/session';

export const dynamic = 'force-dynamic';

// GET /api/auth/admin-grant - upgrade otomatis member -> session admin.
// Dipanggil dari guard /admin ketika user sudah login Discord dan ID-nya
// termasuk ADMIN_DISCORD_IDS. Selain itu: lempar ke /no-access.
export async function GET(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  const adminIds = (process.env.ADMIN_DISCORD_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!adminIds.includes(session.discordId)) {
    return NextResponse.redirect(new URL('/no-access', request.url));
  }
  await createAdminSession(session.username, session.avatar || null);
  return NextResponse.redirect(new URL('/admin', request.url));
}

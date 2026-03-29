import { cookies, headers } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';

export async function getServerSession() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token, {
    userAgent: headerStore.get('user-agent'),
    ip: headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headerStore.get('x-real-ip'),
  });
}

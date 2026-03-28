import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ChatDashboardClient from './ChatDashboardClient';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';

const CHAT_NEXT_PATH = '/chat';

export default async function ChatPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token, {
    userAgent: headerStore.get('user-agent'),
    ip: headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headerStore.get('x-real-ip'),
  });

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(CHAT_NEXT_PATH)}`);
  }

  if (session.needsPasswordChange) {
    redirect('/auth/setup-admin');
  }

  return <ChatDashboardClient />;
}

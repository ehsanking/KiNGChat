import { redirect } from 'next/navigation';
import ChatShell from './ChatShell';
import { getServerSession } from '@/lib/server-session';
import { CHAT_NEXT_PATH } from '@/lib/auth-next-path';

export default async function ChatPage() {
  const session = await getServerSession();

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(CHAT_NEXT_PATH)}`);
  }

  if (session.needsPasswordChange) {
    redirect('/auth/setup-admin');
  }

  return <ChatShell />;
}

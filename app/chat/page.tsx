import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getServerSession } from '@/lib/server-session';
import { CHAT_NEXT_PATH } from '@/lib/auth-next-path';

const ChatShell = dynamic(() => import('./ChatShell'), {
  loading: () => <div className="p-4 text-sm text-zinc-400">Loading secure chat…</div>,
});

export default async function ChatPage() {
  const session = await getServerSession();

  if (!session) {
    redirect(`/auth/login?next=${encodeURIComponent(CHAT_NEXT_PATH)}`);
  }

  return <ChatShell />;
}

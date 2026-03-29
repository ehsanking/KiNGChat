import { redirect } from 'next/navigation';
import LoginPageClient from '@/components/auth/LoginPageClient';
import { sanitizeNextPath } from '@/lib/auth-next-path';
import { getServerSession } from '@/lib/server-session';

type LoginPageProps = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const nextPath = sanitizeNextPath(params.next);
  const session = await getServerSession();

  if (session?.needsPasswordChange) {
    redirect('/auth/setup-admin');
  }

  if (session) {
    redirect(nextPath);
  }

  return <LoginPageClient />;
}

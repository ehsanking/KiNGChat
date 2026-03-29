import { redirect } from 'next/navigation';
import RegisterPageClient from '@/components/auth/RegisterPageClient';
import { getServerSession } from '@/lib/server-session';
import { sanitizeNextPath } from '@/lib/auth-next-path';

type RegisterPageProps = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = (await searchParams) ?? {};
  const session = await getServerSession();

  if (session?.needsPasswordChange) {
    redirect('/auth/setup-admin');
  }

  if (session) {
    redirect(sanitizeNextPath(params.next));
  }

  return <RegisterPageClient />;
}

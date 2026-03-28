import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import LandingPageClient from '@/components/landing/LandingPageClient';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';

type HomePageProps = {
  searchParams?: Promise<{ source?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const headerStore = await headers();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token, {
    userAgent: headerStore.get('user-agent'),
    ip: headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headerStore.get('x-real-ip'),
  });

  if (session?.needsPasswordChange) {
    redirect('/auth/setup-admin');
  }

  if (session) {
    redirect('/chat');
  }

  if (params.source === 'pwa') {
    redirect('/auth/login?next=%2Fchat');
  }

  return <LandingPageClient />;
}

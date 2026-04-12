import { redirect } from 'next/navigation';
import LandingPageClient from '@/components/landing/LandingPageClient';
import { getServerSession } from '@/lib/server-session';
import MarketingShell from '@/components/shells/MarketingShell';

type HomePageProps = {
  searchParams?: Promise<{ source?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = (await searchParams) ?? {};
  const session = await getServerSession();

  if (session) {
    redirect('/chat');
  }

  if (params.source === 'pwa') {
    redirect('/auth/login?next=%2Fchat');
  }

  return <MarketingShell><LandingPageClient /></MarketingShell>;
}

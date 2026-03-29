import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, Shield, Smartphone, KeyRound, UserPlus, MessageSquare } from 'lucide-react';
import { getServerSession } from '@/lib/server-session';

export default async function OnboardingPage({ searchParams }: { searchParams?: Promise<{ next?: string }> }) {
  const params = (await searchParams) ?? {};
  const nextTarget = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : '/chat';
  const session = await getServerSession();

  if (!session) {
    redirect('/auth/login?next=/auth/onboarding');
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50 p-4 md:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Welcome to Elahe Messenger</h1>
          <p className="text-zinc-400">Your account is ready. Complete these steps to harden your account and start chatting.</p>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <OnboardingStep icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} title="1) Account created" description="Your immutable numeric ID has been assigned. You can later change username/password in account settings." />
          <OnboardingStep icon={<Smartphone className="w-5 h-5 text-brand-gold" />} title="2) Device secured" description="Device keys were generated on this browser during signup. Keep this device protected." />
          <OnboardingStep icon={<KeyRound className="w-5 h-5 text-brand-gold" />} title="3) Optional: enable 2FA" description="Add TOTP now or later from Profile Settings." actionHref="/chat/profile" actionLabel="Open profile security" />
          <OnboardingStep icon={<UserPlus className="w-5 h-5 text-brand-gold" />} title="4) Add first contact" description="Search by username or numeric ID from chat." actionHref="/chat" actionLabel="Open contacts" />
          <OnboardingStep icon={<MessageSquare className="w-5 h-5 text-brand-gold" />} title="5) Start first conversation" description="Send your first encrypted direct message and verify peer safety number in Security Center." actionHref="/chat/security-center" actionLabel="Open Security Center" />
        </section>

        <section className="rounded-2xl border border-brand-blue/30 bg-brand-blue/10 p-5 text-sm text-zinc-300 flex items-start gap-3">
          <Shield className="w-5 h-5 text-brand-blue mt-0.5" />
          <p>
            Security model summary: direct messages and secure attachments use client-side encryption. Group/channel E2EE and advanced ratcheting are still transitional.
          </p>
        </section>

        <div className="flex justify-end">
          <Link href={nextTarget} className="px-6 py-3 rounded-xl bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-600">
            Continue to chat
          </Link>
        </div>
      </div>
    </main>
  );
}

function OnboardingStep({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-800 pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-zinc-400">{description}</p>
        </div>
      </div>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="text-sm text-brand-gold hover:underline whitespace-nowrap">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

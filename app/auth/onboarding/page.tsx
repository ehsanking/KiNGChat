import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckCircle2, Shield, Smartphone, KeyRound, UserPlus, MessageSquare, ArrowRight } from 'lucide-react';
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
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">You&apos;re all set 🎉</h1>
          <p className="text-zinc-400">Let&apos;s do a quick first-run setup so your account is ready for everyday use.</p>
        </header>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
          <OnboardingStep icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />} title="Account created" description="Your account is active now. Your numeric ID is permanent and won&apos;t change." />
          <OnboardingStep icon={<Smartphone className="w-5 h-5 text-brand-gold" />} title="This device is prepared" description="Security keys were created in this browser during sign-up. Keep this device protected." />
          <OnboardingStep icon={<KeyRound className="w-5 h-5 text-brand-gold" />} title="Optional: add 2-step verification" description="Extra sign-in protection with authenticator codes. You can enable this now or later." actionHref="/chat/profile" actionLabel="Open security settings" />
          <OnboardingStep icon={<UserPlus className="w-5 h-5 text-brand-gold" />} title="Add your first contact" description="Find people by username or numeric ID to start chatting." actionHref="/chat" actionLabel="Open chat" />
          <OnboardingStep icon={<MessageSquare className="w-5 h-5 text-brand-gold" />} title="Send your first message" description="Start with a direct chat and send a quick hello." actionHref="/chat" actionLabel="Start messaging" />
        </section>

        <section className="rounded-2xl border border-brand-blue/30 bg-brand-blue/10 p-5 text-sm text-zinc-300 flex items-start gap-3">
          <Shield className="w-5 h-5 text-brand-blue mt-0.5" />
          <p>
            Direct messages and secure attachments are protected on your device. Groups and channels are still improving and are not yet identical to direct-message protection.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 text-sm text-zinc-300 space-y-2">
          <p>Tip: You can change your username and password later in profile settings.</p>
          <p>Tip: Save your numeric ID somewhere safe so contacts can find you.</p>
        </section>

        <div className="flex flex-col sm:flex-row justify-end gap-3">
          <Link href="/chat/profile" className="px-6 py-3 rounded-xl border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-center">
            Review security settings
          </Link>
          <Link href={nextTarget} className="px-6 py-3 rounded-xl bg-emerald-500 text-zinc-950 font-semibold hover:bg-emerald-600 inline-flex items-center justify-center gap-2">
            Continue to chat <ArrowRight className="w-4 h-4" />
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

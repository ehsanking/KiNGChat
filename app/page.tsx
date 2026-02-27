import Link from 'next/link';
import Image from 'next/image';
import EncryptionAnimation from '@/components/EncryptionAnimation';
import { Shield, Zap, Globe, Lock, UserPlus, Smartphone, EyeOff, Code } from 'lucide-react';

export default function LandingPage() {
  // Remote logo URL provided by user
  const logoSrc = "https://s8.uupload.ir/files/transparent-logo_omst.png";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Animation - Positioned to cover hero area */}
      <div className="absolute top-0 left-0 w-full h-[80vh] z-0">
        <EncryptionAnimation />
      </div>

      <div className="max-w-3xl text-center space-y-8 flex flex-col items-center relative z-10 pt-20 pb-20">
        <div className="w-[128px] h-[128px] relative mb-4 animate-in fade-in zoom-in duration-700">
          <Image
            src={logoSrc}
            alt="KiNGChat Logo"
            width={128}
            height={128}
            className="object-contain drop-shadow-[0_0_25px_rgba(196,154,69,0.5)]"
            priority
            unoptimized // Using unoptimized for external direct links if needed, or just let Next handle it
          />
        </div>
        <h1 className="text-6xl md:text-7xl font-bold tracking-tighter text-brand-gold drop-shadow-sm">
          KiNGChat
        </h1>
        <p className="text-xl text-zinc-400 max-w-xl">
          The most resilient, privacy-first messenger. 
          Built for those who demand absolute control over their communication.
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-8">
          <Link
            href="/auth/register"
            className="px-10 py-4 bg-brand-blue hover:bg-brand-blue/90 text-white font-bold rounded-2xl transition-all hover:scale-105 shadow-lg shadow-brand-blue/20"
          >
            Get Started
          </Link>
          <Link
            href="/auth/login"
            className="px-10 py-4 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-50 font-bold rounded-2xl transition-all hover:scale-105"
          >
            Sign In
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="mt-32 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl w-full relative z-10">
        <FeatureCard 
          icon={<Lock className="w-6 h-6 text-brand-gold" />}
          title="E2E Encrypted"
          description="Your messages are encrypted before they even leave your device. Only the recipient can read them."
        />
        <FeatureCard 
          icon={<EyeOff className="w-6 h-6 text-brand-gold" />}
          title="Zero Metadata"
          description="We don't log who you talk to, when you talk, or your IP address. Your business is yours."
        />
        <FeatureCard 
          icon={<UserPlus className="w-6 h-6 text-brand-gold" />}
          title="No Phone Required"
          description="Register with just a username. No SIM card or phone number needed for absolute anonymity."
        />
        <FeatureCard 
          icon={<Globe className="w-6 h-6 text-brand-gold" />}
          title="Self-Hosted"
          description="Run your own KiNGChat server. You own the hardware, the data, and the encryption keys."
        />
        <FeatureCard 
          icon={<Smartphone className="w-6 h-6 text-brand-gold" />}
          title="PWA Ready"
          description="Install KiNGChat on any device. It works offline and feels like a native application."
        />
        <FeatureCard 
          icon={<Code className="w-6 h-6 text-brand-gold" />}
          title="Open Source"
          description="Transparent and auditable. Our code is open for anyone to inspect and verify its security."
        />
      </div>

      <footer className="mt-24 py-8 text-zinc-600 text-sm border-t border-zinc-900 w-full text-center">
        &copy; {new Date().getFullYear()} KiNGChat. All rights reserved.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800 hover:border-brand-gold/30 transition-all group backdrop-blur-sm">
      <div className="mb-4 p-3 rounded-2xl bg-zinc-950 w-fit group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-zinc-100 mb-2">{title}</h3>
      <p className="text-zinc-400 text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}

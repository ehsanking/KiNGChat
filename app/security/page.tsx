import Link from 'next/link';
import Image from 'next/image';
import { Lock, EyeOff, Globe, Scale, AlertTriangle, ChevronLeft } from 'lucide-react';

export default function SecurityPage() {
  const logoSrc = "https://s8.uupload.ir/files/transparent-logo_omst.png";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-800 pb-8">
          <Link href="/" className="flex items-center gap-2 group">
            <ChevronLeft className="w-5 h-5 text-zinc-500 group-hover:text-brand-gold transition-colors" />
            <div className="w-8 h-8 relative">
              <Image src={logoSrc} alt="Logo" fill sizes="32px" className="object-contain" unoptimized />
            </div>
            <span className="text-lg font-bold tracking-tighter text-brand-gold">KiNGChat Security</span>
          </Link>
          <div className="hidden md:block text-xs text-zinc-500 font-mono">
            PROTOCOL: E2EE-V1 // STATUS: SECURE
          </div>
        </header>

        {/* Hero Section */}
        <section className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-100">
            Security & <span className="text-brand-gold">Compliance</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl">
            KiNGChat is engineered for absolute privacy. We combine military-grade encryption with a zero-trust architecture to ensure your data remains yours.
          </p>
        </section>

        {/* Security Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800">
            <Lock className="w-8 h-8 text-brand-gold mb-4" />
            <h3 className="text-xl font-bold mb-2">End-to-End Encryption</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Every message, file, and call is encrypted on the sender&apos;s device using X3DH and Double Ratchet algorithms. The server never holds the keys.
            </p>
          </div>
          <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800">
            <EyeOff className="w-8 h-8 text-brand-gold mb-4" />
            <h3 className="text-xl font-bold mb-2">Zero Metadata Logging</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              We do not store IP addresses, contact graphs, or message timestamps. Our database is designed to be &quot;blind&quot; by default.
            </p>
          </div>
        </div>

        {/* International Compliance */}
        <section className="space-y-6 pt-8">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-brand-gold" />
            <h2 className="text-2xl font-bold">International Usage Laws</h2>
          </div>
          <div className="prose prose-invert max-w-none space-y-4 text-zinc-400">
            <p>
              KiNGChat operates under the principles of international privacy standards, including the **General Data Protection Regulation (GDPR)** and the **Universal Declaration of Human Rights (Article 12)**, which states that no one shall be subjected to arbitrary interference with his privacy, family, home or correspondence.
            </p>
            <div className="bg-zinc-900/50 border-l-4 border-brand-gold p-6 rounded-r-2xl">
              <h4 className="text-zinc-100 font-bold mb-2 flex items-center gap-2">
                <Scale className="w-4 h-4 text-brand-gold" /> Legal Framework
              </h4>
              <p className="text-sm">
                As a self-hosted platform, the legal responsibility for data residency and compliance rests with the server operator. KiNGChat provides the tools for secure communication but does not control the infrastructure on which it is deployed.
              </p>
            </div>
            <p>
              Users are required to comply with their local jurisdiction&apos;s laws regarding the use of encryption. KiNGChat is intended for lawful, private communication. The use of this platform for illegal activities, including but not limited to cybercrime, terrorism, or child exploitation, is strictly prohibited and violates our core mission of protecting human rights.
            </p>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="p-8 rounded-3xl bg-brand-blue/10 border border-brand-blue/20">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-brand-blue shrink-0 mt-1" />
            <div>
              <h4 className="text-zinc-100 font-bold mb-2">Security Disclaimer</h4>
              <p className="text-sm text-zinc-400 leading-relaxed">
                While KiNGChat employs state-of-the-art cryptographic methods, no system is 100% infallible. Security is a shared responsibility. Users must ensure their devices are free of malware and their encryption keys are backed up securely.
              </p>
            </div>
          </div>
        </section>

        <footer className="pt-12 pb-8 text-center text-zinc-600 text-xs border-t border-zinc-900">
          &copy; {new Date().getFullYear()} KiNGChat Security Operations. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import { Lock, EyeOff, Globe, Scale, AlertTriangle, ChevronLeft } from 'lucide-react';

export default function SecurityPage() {
  const logoSrc = 'https://s8.uupload.ir/files/transparent-logo_omst.png';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="flex items-center justify-between border-b border-zinc-800 pb-8">
          <Link href="/" className="flex items-center gap-2 group">
            <ChevronLeft className="w-5 h-5 text-zinc-500 group-hover:text-brand-gold transition-colors" />
            <div className="w-8 h-8 relative">
              <Image src={logoSrc} alt="Logo" fill sizes="32px" className="object-contain" unoptimized />
            </div>
            <span className="text-lg font-bold tracking-tighter text-brand-gold">Elahe Messenger Security</span>
          </Link>
          <div className="hidden md:block text-xs text-zinc-500 font-mono">PROTOCOL: E2EE-V2 // STATUS: EVOLVING</div>
        </header>

        <section className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-100">
            Security & <span className="text-brand-gold">Compliance</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl">
            Elahe Messenger uses client-side cryptography for direct messaging and encrypted attachments. We document current protections and known limitations so operators can make informed deployment decisions.
          </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800">
            <Lock className="w-8 h-8 text-brand-gold mb-4" />
            <h3 className="text-xl font-bold mb-2">Current Encryption Scope</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              1:1 messaging uses browser-side ECDH (P-256), HKDF-SHA256, and AES-256-GCM. Group and channel E2EE is not shipped yet, and advanced ratcheting claims should be treated as roadmap work until fully implemented and audited.
            </p>
          </div>
          <div className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800">
            <EyeOff className="w-8 h-8 text-brand-gold mb-4" />
            <h3 className="text-xl font-bold mb-2">Metadata Reality</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">
              The service stores operational metadata such as account records, conversation membership, timestamps, and audit events. Secure design reduces plaintext exposure, but it is not a zero-metadata system.
            </p>
          </div>
        </div>

        <section className="space-y-6 pt-8">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-brand-gold" />
            <h2 className="text-2xl font-bold">International Usage Laws</h2>
          </div>
          <div className="prose prose-invert max-w-none space-y-4 text-zinc-400">
            <p>
              Elahe Messenger is built for privacy-focused communication and can support regulated environments, but compliance outcomes depend on deployment choices and operator controls.
            </p>
            <div className="bg-zinc-900/50 border-l-4 border-brand-gold p-6 rounded-r-2xl">
              <h4 className="text-zinc-100 font-bold mb-2 flex items-center gap-2">
                <Scale className="w-4 h-4 text-brand-gold" /> Legal Framework
              </h4>
              <p className="text-sm">
                As a self-hosted platform, the legal responsibility for data residency, retention, and local regulatory compliance rests with the server operator.
              </p>
            </div>
            <p>
              Users are required to comply with local laws regarding encryption and communications. The platform is intended for lawful use and abuse prevention remains an explicit part of operations.
            </p>
          </div>
        </section>

        <section className="p-8 rounded-3xl bg-brand-blue/10 border border-brand-blue/20">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-brand-blue shrink-0 mt-1" />
            <div>
              <h4 className="text-zinc-100 font-bold mb-2">Security Disclaimer</h4>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Security depends on endpoint integrity, key handling, infrastructure hardening, and operational hygiene. Review the threat model and crypto status docs before production deployment.
              </p>
            </div>
          </div>
        </section>

        <footer className="pt-12 pb-8 text-center text-zinc-600 text-xs border-t border-zinc-900">
          &copy; {new Date().getFullYear()} Elahe Messenger Security Operations. All rights reserved.
        </footer>
      </div>
    </div>
  );
}

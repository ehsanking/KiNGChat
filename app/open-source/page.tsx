import Link from 'next/link';
import Image from 'next/image';
import { Code, Heart, Globe, Scale, ChevronLeft, ExternalLink } from 'lucide-react';

// Github icon removed from lucide-react v1 — using inline SVG as replacement
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
      <path d="M9 18c-4.51 2-5-2-7-2"/>
    </svg>
  );
}

export default function OpenSourcePage() {
  const logoSrc = "https://s8.uupload.ir/files/transparent-logo_omst.png";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-zinc-800 pb-8">
          <Link href="https://github.com/ehsanking" className="flex items-center gap-2 group">
            <ChevronLeft className="w-5 h-5 text-zinc-500 group-hover:text-brand-gold transition-colors" />
            <div className="w-8 h-8 relative">
              <Image src={logoSrc} alt="Logo" fill sizes="32px" className="object-contain" unoptimized />
            </div>
            <span className="text-lg font-bold tracking-tighter text-brand-gold">Elahe Messenger Open Source</span>
          </Link>
          <div className="flex items-center gap-4">
            <a href="#" className="p-2 hover:bg-zinc-900 rounded-lg transition-colors">
              <GithubIcon className="w-5 h-5 text-zinc-400" />
            </a>
          </div>
        </header>

        {/* Hero Section */}
        <section className="space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-zinc-100">
            Built by the <span className="text-brand-gold">Community</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl">
            Transparency is the foundation of trust. Elahe Messenger is 100% open source, allowing anyone to inspect, audit, and contribute to our codebase.
          </p>
        </section>

        {/* MIT License Section */}
        <section className="p-8 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-6">
          <div className="flex items-center gap-3">
            <Scale className="w-6 h-6 text-brand-gold" />
            <h2 className="text-2xl font-bold">MIT License</h2>
          </div>
          <div className="prose prose-invert text-zinc-400 text-sm leading-relaxed space-y-4">
            <p>
              Elahe Messenger is released under the **MIT License**. This is a permissive free software license that puts very few restrictions on reuse, making it highly compatible with other licenses and international standards.
            </p>
            <div className="bg-zinc-950 p-6 rounded-2xl font-mono text-xs border border-zinc-800 overflow-x-auto">
              <p className="mb-4">Copyright (c) {new Date().getFullYear()} Elahe Messenger Contributors</p>
              <p>
                Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the &quot;Software&quot;), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
              </p>
              <p className="mt-4">
                The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
              </p>
              <p className="mt-4">
                THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT...
              </p>
            </div>
          </div>
        </section>

        {/* International Standards */}
        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <Globe className="w-6 h-6 text-brand-gold" />
            <h2 className="text-2xl font-bold">International Cooperation</h2>
          </div>
          <p className="text-zinc-400 leading-relaxed">
            Our open-source model follows international best practices for software development and distribution. By adhering to the MIT License, we ensure that Elahe Messenger remains a global public good, accessible to everyone regardless of borders or political climate.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex items-start gap-4">
              <Code className="w-5 h-5 text-brand-gold shrink-0 mt-1" />
              <div>
                <h4 className="font-bold text-zinc-100">Auditable Code</h4>
                <p className="text-xs text-zinc-500 mt-1">Every line of code is public, ensuring no backdoors or hidden tracking.</p>
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex items-start gap-4">
              <Heart className="w-5 h-5 text-brand-gold shrink-0 mt-1" />
              <div>
                <h4 className="font-bold text-zinc-100">Community Driven</h4>
                <p className="text-xs text-zinc-500 mt-1">Contributions from developers worldwide help us stay ahead of threats.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="text-center py-12 space-y-6">
          <h2 className="text-2xl font-bold">Want to contribute?</h2>
          <p className="text-zinc-400">Join our global community of developers and privacy advocates.</p>
          <a 
            href="https://github.com/ehsanking/Elahe Messenger" 
            className="inline-flex items-center gap-2 px-8 py-3 bg-brand-gold text-zinc-950 font-bold rounded-xl hover:bg-brand-gold/90 transition-all"
          >
            View on GitHub <ExternalLink className="w-4 h-4" />
          </a>
        </section>

        <footer className="pt-12 pb-8 text-center text-zinc-600 text-xs border-t border-zinc-900">
          &copy; {new Date().getFullYear()} Elahe Messenger Open Source Initiative. Released under MIT License.
        </footer>
      </div>
    </div>
  );
}

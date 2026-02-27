import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-3xl text-center space-y-8">
        <h1 className="text-6xl font-bold tracking-tighter text-emerald-400">
          KiNGChat
        </h1>
        <p className="text-xl text-zinc-400">
          Privacy-first, self-hosted web messenger designed for resilience.
          End-to-end encrypted, zero foreign dependencies.
        </p>
        <div className="flex justify-center gap-4 pt-8">
          <Link
            href="/auth/register"
            className="px-8 py-3 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold rounded-xl transition-colors"
          >
            Create Account
          </Link>
          <Link
            href="/auth/login"
            className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 font-semibold rounded-xl transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
      <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl w-full text-left">
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
          <h3 className="text-lg font-semibold text-emerald-400 mb-2">E2E Encrypted</h3>
          <p className="text-zinc-400 text-sm">
            Messages and attachments are encrypted on your device. The server only sees ciphertext.
          </p>
        </div>
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
          <h3 className="text-lg font-semibold text-emerald-400 mb-2">Resilient</h3>
          <p className="text-zinc-400 text-sm">
            Works fully on local infrastructure. No reliance on foreign CDNs or push services.
          </p>
        </div>
        <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
          <h3 className="text-lg font-semibold text-emerald-400 mb-2">Self-Hosted</h3>
          <p className="text-zinc-400 text-sm">
            Deploy anywhere. You control the data, the keys, and the network.
          </p>
        </div>
      </div>
    </div>
  );
}

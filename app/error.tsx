'use client';

import { useEffect } from 'react';
import Link from 'next/link';

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Global error boundary.
 *
 * Catches all unhandled errors at the root level. More specific error
 * boundaries exist for /chat, /admin, and /auth routes to provide
 * contextual recovery UI for each section.
 */
export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // In production, avoid exposing error details in console.
    // The server-side logger (lib/logger.ts) captures the structured error.
    if (process.env.NODE_ENV !== 'production') {
      console.error('Unhandled application error:', error);
    }
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
        <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-gray-300">
        An unexpected error occurred. Try again, and if the issue persists contact your administrator.
      </p>
      {error.digest && (
        <p className="text-xs text-zinc-600 font-mono">Error ID: {error.digest}</p>
      )}
      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium transition hover:bg-white/10"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium transition hover:bg-white/10"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

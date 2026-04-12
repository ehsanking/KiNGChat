'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ChatBootstrapPage() {
  const router = useRouter();

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const response = await fetch('/api/session', {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          router.replace('/auth/login');
          return;
        }

        const data = await response.json();
        if (!data.authenticated || !data.user) {
          router.replace('/auth/login');
          return;
        }

        // Session is valid, redirect directly to chat
        router.replace('/chat');
      } catch {
        router.replace('/auth/login');
      }
    };

    bootstrap();
  }, [router]);

  return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Bootstrapping session...</div>;
}

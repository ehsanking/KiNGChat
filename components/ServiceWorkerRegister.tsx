'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/_next/static/sw.js').catch(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
  }, []);

  return null;
}

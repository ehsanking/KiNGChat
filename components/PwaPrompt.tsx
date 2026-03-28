'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bell, Download, X } from 'lucide-react';
import { requestNotificationPermission } from '@/lib/firebase';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const isStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches
  || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

export default function PwaPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [isIosSafari, setIsIosSafari] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const routeContext = useMemo<'marketing' | 'auth' | 'chat'>(() => {
    if (pathname.startsWith('/auth/')) return 'auth';
    if (pathname.startsWith('/chat')) return 'chat';
    return 'marketing';
  }, [pathname]);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(ua);
    const isSafari = iOS && /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    setIsIosSafari(isSafari);
    setIsStandalone(isStandaloneMode());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setShowInstall(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (isStandalone || routeContext === 'chat') {
      setShowInstall(false);
      return;
    }

    if (deferredPrompt) {
      setShowInstall(true);
      return;
    }

    if (isIosSafari) {
      setShowInstall(true);
    }
  }, [deferredPrompt, isIosSafari, isStandalone, routeContext]);

  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    if (routeContext !== 'chat' && routeContext !== 'auth') return;
    if (isStandaloneMode()) return;

    const hasDismissed = localStorage.getItem('elahe_notifications_dismissed');
    if (hasDismissed) return;

    const timer = window.setTimeout(() => setShowNotificationPrompt(true), 5000);
    return () => window.clearTimeout(timer);
  }, [routeContext]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstall(false);
  };

  const handleNotificationClick = async () => {
    try {
      await requestNotificationPermission();
    } finally {
      setShowNotificationPrompt(false);
    }
  };

  const dismissNotificationPrompt = () => {
    localStorage.setItem('elahe_notifications_dismissed', 'true');
    setShowNotificationPrompt(false);
  };

  if (!showInstall && !showNotificationPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 flex flex-col gap-3">
      {showInstall && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-brand-gold/10 rounded-2xl flex items-center justify-center shrink-0">
              <Download className="w-6 h-6 text-brand-gold" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-zinc-50">Install Elahe Messenger</h4>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                Add Elahe Messenger to your home screen for a faster, app-like experience.
              </p>
            </div>
            <button onClick={() => setShowInstall(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {isIosSafari && !deferredPrompt ? (
            <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50 text-[11px] text-zinc-300 leading-relaxed">
              On iPhone/iPad Safari, tap <span className="font-semibold">Share</span> then <span className="font-semibold">Add to Home Screen</span>.
            </div>
          ) : (
            <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50 text-[11px] text-zinc-300 leading-relaxed">
              On Android, use the install dialog to pin Elahe Messenger to your home screen.
            </div>
          )}

          <div className="flex gap-2">
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="flex-1 py-2.5 bg-brand-gold hover:bg-brand-gold/90 text-zinc-950 text-sm font-bold rounded-xl transition-all active:scale-95"
              >
                Install app
              </button>
            )}
            <button
              onClick={() => setShowInstall(false)}
              className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 text-sm font-bold rounded-xl transition-all active:scale-95"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showNotificationPrompt && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-brand-blue/10 rounded-2xl flex items-center justify-center shrink-0">
              <Bell className="w-6 h-6 text-brand-blue" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-zinc-50">Enable notifications</h4>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">Stay up to date with secure message alerts.</p>
            </div>
            <button onClick={dismissNotificationPrompt} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleNotificationClick}
              className="flex-1 py-2.5 bg-brand-blue hover:bg-brand-blue/90 text-white text-sm font-bold rounded-xl transition-all active:scale-95"
            >
              Enable
            </button>
            <button
              onClick={dismissNotificationPrompt}
              className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 text-sm font-bold rounded-xl transition-all active:scale-95"
            >
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

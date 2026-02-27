'use client';

import { useEffect, useState } from 'react';
import { Download, Bell, X } from 'lucide-react';
import { requestNotificationPermission } from '@/lib/firebase';

export default function PwaPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    if (!isStandalone) {
      // Listen for the beforeinstallprompt event
      window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        // Stash the event so it can be triggered later.
        setDeferredPrompt(e);
        // Update UI notify the user they can install the PWA
        setShowInstall(true);
      });
    }

    // Check notification permissions
    if ('Notification' in window) {
      const hasDismissed = localStorage.getItem('kingchat_notifications_dismissed');
      
      if (Notification.permission === 'default' && !hasDismissed) {
        // If in standalone mode (PWA opened), prompt more urgently
        // Otherwise, wait a bit
        const delay = isStandalone ? 1000 : 5000;
        
        const timer = setTimeout(() => {
          setShowNotificationPrompt(true);
        }, delay);
        
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowInstall(false);
  };

  const handleNotificationClick = async () => {
    try {
      const token = await requestNotificationPermission();
      if (token) {
        console.log('Notification permission granted', token);
      }
    } catch (err) {
      console.error('Failed to get notification permission', err);
    }
    setShowNotificationPrompt(false);
  };

  const dismissNotificationPrompt = () => {
    // Store dismissal for 7 days
    localStorage.setItem('kingchat_notifications_dismissed', 'true');
    setShowNotificationPrompt(false);
  };

  if (!showInstall && !showNotificationPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 flex flex-col gap-3">
      {showInstall && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl flex items-start gap-4 animate-in slide-in-from-bottom-5">
          <div className="w-10 h-10 bg-brand-gold/10 rounded-xl flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-brand-gold" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-zinc-50">Install KiNGChat</h4>
            <p className="text-xs text-zinc-400 mt-1">Install our app for a better, offline-capable experience.</p>
            <div className="flex gap-2 mt-3">
              <button 
                onClick={handleInstallClick}
                className="px-3 py-1.5 bg-brand-gold hover:bg-brand-gold/90 text-zinc-950 text-xs font-semibold rounded-lg transition-colors"
              >
                Install App
              </button>
              <button 
                onClick={() => setShowInstall(false)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 text-xs font-medium rounded-lg transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>
          <button onClick={() => setShowInstall(false)} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showNotificationPrompt && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-2xl flex items-start gap-4 animate-in slide-in-from-bottom-5">
          <div className="w-10 h-10 bg-brand-blue/10 rounded-xl flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-brand-blue" />
          </div>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-zinc-50">Enable Notifications</h4>
            <p className="text-xs text-zinc-400 mt-1">Get notified when you receive new encrypted messages.</p>
            <div className="flex gap-2 mt-3">
              <button 
                onClick={handleNotificationClick}
                className="px-3 py-1.5 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Enable
              </button>
              <button 
                onClick={dismissNotificationPrompt}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 text-xs font-medium rounded-lg transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>
          <button onClick={dismissNotificationPrompt} className="text-zinc-500 hover:text-zinc-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

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
      const hasDismissed = localStorage.getItem('elahe_notifications_dismissed');
      
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
    localStorage.setItem('elahe_notifications_dismissed', 'true');
    setShowNotificationPrompt(false);
  };

  if (!showInstall && !showNotificationPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 flex flex-col gap-3" dir="rtl">
      {showInstall && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-brand-gold/10 rounded-2xl flex items-center justify-center shrink-0">
              <Download className="w-6 h-6 text-brand-gold" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-zinc-50">نصب کینگ‌چت</h4>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                برای تجربه بهتر، سرعت بالاتر و استفاده آفلاین، اپلیکیشن را نصب کنید.
              </p>
            </div>
            <button onClick={() => setShowInstall(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800/50">
            <p className="text-[10px] text-zinc-500 font-medium mb-1 uppercase tracking-wider">راهنمای نصب سریع:</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              در آیفون: دکمه <span className="text-zinc-200">Share</span> و سپس <span className="text-zinc-200">Add to Home Screen</span> را بزنید.
              <br />
              در اندروید: روی سه نقطه مرورگر و سپس <span className="text-zinc-200">Install App</span> کلیک کنید.
            </p>
          </div>

          <div className="flex gap-2">
            <button 
              onClick={handleInstallClick}
              className="flex-1 py-2.5 bg-brand-gold hover:bg-brand-gold/90 text-zinc-950 text-sm font-bold rounded-xl transition-all active:scale-95"
            >
              نصب اپلیکیشن
            </button>
            <button 
              onClick={() => setShowInstall(false)}
              className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 text-sm font-bold rounded-xl transition-all active:scale-95"
            >
              متوجه شدم
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
              <h4 className="text-base font-bold text-zinc-50">فعال‌سازی اعلان‌ها</h4>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                با فعال‌سازی اعلان‌ها، هیچ پیام رمزنگاری شده‌ای را از دست نخواهید داد.
              </p>
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
              فعال‌سازی
            </button>
            <button 
              onClick={dismissNotificationPrompt}
              className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-50 text-sm font-bold rounded-xl transition-all active:scale-95"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

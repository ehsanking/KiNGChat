'use client';

import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';

type TurnstileWidgetProps = {
  siteKey: string;
  onTokenChange: (token: string) => void;
  theme?: 'light' | 'dark';
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default function TurnstileWidget({ siteKey, onTokenChange, theme = 'dark' }: TurnstileWidgetProps) {
  const containerId = useMemo(() => `turnstile-${Math.random().toString(36).slice(2)}`, []);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!scriptReady || !window.turnstile) return;

    onTokenChange('');
    const createdWidgetId = window.turnstile.render(`#${containerId}`, {
      sitekey: siteKey,
      theme,
      callback: (token: string) => onTokenChange(token),
      'expired-callback': () => onTokenChange(''),
      'error-callback': () => onTokenChange(''),
    });

    return () => {
      if (window.turnstile && createdWidgetId) {
        window.turnstile.remove(createdWidgetId);
      }
    };
  }, [containerId, onTokenChange, scriptReady, siteKey, theme]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div id={containerId} />
    </>
  );
}

'use client';

import { useEffect, useId, useState } from 'react';
import Script from 'next/script';

type GoogleRecaptchaProps = {
  siteKey: string;
  onTokenChange: (token: string) => void;
  disabled?: boolean;
};

export default function GoogleRecaptcha({ siteKey, onTokenChange, disabled = false }: GoogleRecaptchaProps) {
  const elementId = useId().replace(/:/g, '_');
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [widgetId, setWidgetId] = useState<number | null>(null);

  useEffect(() => {
    if (!scriptLoaded || !siteKey || disabled || widgetId !== null || !window.grecaptcha) {
      return;
    }

    window.grecaptcha.ready(() => {
      const renderedWidgetId = window.grecaptcha?.render(elementId, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token) => onTokenChange(token),
        'expired-callback': () => onTokenChange(''),
        'error-callback': () => onTokenChange(''),
      });

      if (typeof renderedWidgetId === 'number') {
        setWidgetId(renderedWidgetId);
      }
    });
  }, [disabled, elementId, onTokenChange, scriptLoaded, siteKey, widgetId]);

  useEffect(() => {
    if (!window.grecaptcha || widgetId === null) {
      return;
    }

    if (disabled) {
      window.grecaptcha.reset(widgetId);
      onTokenChange('');
    }
  }, [disabled, onTokenChange, widgetId]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://www.google.com/recaptcha/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div className="space-y-2">
        <div id={elementId} className="flex justify-center" />
        <p className="text-xs text-zinc-500 text-center">Google reCAPTCHA</p>
      </div>
    </>
  );
}

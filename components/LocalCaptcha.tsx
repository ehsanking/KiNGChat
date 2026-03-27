'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';

type CaptchaPayload = {
  captchaId: string;
  prompt: string;
  expiresAt: number;
};

type LocalCaptchaProps = {
  enabled: boolean;
  onChange: (value: { captchaId: string; captchaAnswer: string }) => void;
};

export default function LocalCaptcha({ enabled, onChange }: LocalCaptchaProps) {
  const [captcha, setCaptcha] = useState<CaptchaPayload | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadCaptcha = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/captcha', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data?.success || !data?.captchaId || !data?.prompt) {
        throw new Error(data?.error || 'Failed to load captcha challenge.');
      }

      setCaptcha({
        captchaId: String(data.captchaId),
        prompt: String(data.prompt),
        expiresAt: Number(data.expiresAt || Date.now()),
      });
      setCaptchaAnswer('');
      onChange({ captchaId: String(data.captchaId), captchaAnswer: '' });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to load captcha challenge.');
      setCaptcha(null);
      onChange({ captchaId: '', captchaAnswer: '' });
    } finally {
      setIsLoading(false);
    }
  }, [enabled, onChange]);

  useEffect(() => {
    if (!enabled) {
      setCaptcha(null);
      setCaptchaAnswer('');
      onChange({ captchaId: '', captchaAnswer: '' });
      return;
    }

    loadCaptcha();
  }, [enabled, loadCaptcha, onChange]);

  const handleAnswerChange = (value: string) => {
    const normalized = value.replace(/[^0-9]/g, '').slice(0, 3);
    setCaptchaAnswer(normalized);
    onChange({
      captchaId: captcha?.captchaId ?? '',
      captchaAnswer: normalized,
    });
  };

  if (!enabled) return null;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-400">Security Check</label>
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-3">
        {isLoading ? (
          <div className="h-[56px] rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading challenge...
          </div>
        ) : captcha?.prompt ? (
          <div className="h-[56px] rounded-lg bg-zinc-900 flex items-center justify-between px-4 text-zinc-100 font-mono text-lg tracking-wide">
            <span>{captcha.prompt}</span>
          </div>
        ) : (
          <div className="h-[56px] rounded-lg bg-zinc-900 flex items-center justify-center text-amber-400 text-xs px-2 text-center">
            Could not load challenge. Please refresh.
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={captchaAnswer}
            onChange={(event) => handleAnswerChange(event.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="Enter the answer"
            autoComplete="off"
            maxLength={3}
            inputMode="numeric"
          />
          <button
            type="button"
            onClick={loadCaptcha}
            className="px-3 py-2.5 border border-zinc-700 rounded-xl text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Refresh challenge"
          >
            <RefreshCcw className="w-4 h-4" />
          </button>
        </div>

        {!!captcha?.expiresAt && (
          <p className="text-[11px] text-zinc-500">
            Expires in about {Math.max(1, Math.ceil((captcha.expiresAt - Date.now()) / 60000))} minute(s).
          </p>
        )}
        {error && <p className="text-xs text-amber-400">{error}</p>}
      </div>
    </div>
  );
}

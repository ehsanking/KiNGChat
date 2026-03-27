'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Shield, Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ImageCaptcha from '@/components/ImageCaptcha';

type PublicSettings = {
  isCaptchaEnabled: boolean;
  isRegistrationEnabled: boolean;
  captchaProvider?: string;
};

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [settings, setSettings] = useState<PublicSettings>({
    isCaptchaEnabled: false,
    isRegistrationEnabled: true,
    captchaProvider: 'disabled',
  });
  const [captchaErrorMessage, setCaptchaErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [pending2FAUserId, setPending2FAUserId] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const router = useRouter();

  const isCaptchaReady = !settings.isCaptchaEnabled || (captchaId.length > 0 && captchaAnswer.length > 0);

  const fetchJsonWithRetry = useCallback(async (url: string, attempts = 3) => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`${url} returned ${response.status}`);
        }
        return await response.json();
      } catch (requestError) {
        lastError = requestError instanceof Error ? requestError : new Error('Unknown network error');
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    }
    throw lastError ?? new Error('Request failed');
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/session', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.authenticated && data.user) {
          router.replace('/chat');
        }
      } catch {
        // ignore
      }
    };
    checkSession();
  }, [router]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsData = await fetchJsonWithRetry('/api/settings/public');
        if (settingsData?.success && settingsData?.settings) {
          setSettings(settingsData.settings);
          return;
        }
      } catch (settingsError) {
        console.error('Public settings load failed:', settingsError);
      }

      setSettings({
        isCaptchaEnabled: false,
        isRegistrationEnabled: true,
        captchaProvider: 'disabled',
      });
      setCaptchaErrorMessage('Could not load security settings. Captcha is disabled temporarily.');
    };

    loadSettings();
  }, [fetchJsonWithRetry]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          captchaId,
          captchaAnswer,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Login failed');
        setCaptchaAnswer('');
      } else if (data.requires2FA) {
        setShow2FA(true);
        setPending2FAUserId(data.userId ?? '');
      } else {
        router.push('/chat');
      }
    } catch (requestError) {
      console.error(requestError);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FAVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/2fa', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: pending2FAUserId,
          token: totpCode,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Invalid 2FA code');
      } else if (data.success) {
        router.push('/chat');
      }
    } catch (requestError) {
      console.error(requestError);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (show2FA) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-brand-gold/10 rounded-full flex items-center justify-center">
              <KeyRound className="w-8 h-8 text-brand-gold" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-zinc-50 mb-2">Two-Factor Authentication</h2>
          <p className="text-zinc-400 text-center text-sm mb-8">Enter the 6-digit code from your authenticator app.</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-6 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handle2FAVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Verification Code</label>
              <input
                type="text"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-brand-gold transition-colors"
                placeholder="000000"
                required
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                inputMode="numeric"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full bg-brand-gold hover:bg-brand-gold/90 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 rounded-xl transition-colors mt-6 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Login'
              )}
            </button>
          </form>

          <button
            onClick={() => {
              setShow2FA(false);
              setTotpCode('');
              setError('');
            }}
            className="w-full text-center text-zinc-500 text-sm mt-4 hover:text-zinc-300"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-emerald-500" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center text-zinc-50 mb-8">Welcome Back</h2>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="e.g. ehsanking"
              required
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="********"
              required
              disabled={isLoading}
            />
          </div>

          {settings.isCaptchaEnabled ? (
            <ImageCaptcha
              enabled={settings.isCaptchaEnabled}
              onChange={({ captchaId: nextCaptchaId, captchaAnswer: nextCaptchaAnswer }) => {
                setCaptchaId(nextCaptchaId);
                setCaptchaAnswer(nextCaptchaAnswer);
              }}
            />
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs p-3 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <div>
                Captcha is currently disabled by server settings.
                {captchaErrorMessage ? ` ${captchaErrorMessage}` : ''}
              </div>
            </div>
          )}

          {settings.isCaptchaEnabled && !isCaptchaReady && (
            <p className="text-xs text-amber-400">Please complete the security challenge before signing in.</p>
          )}

          <button
            type="submit"
            disabled={isLoading || !isCaptchaReady}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 rounded-xl transition-colors mt-6 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Signing In...
              </>
            ) : (
              'Decrypt Keys & Login'
            )}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-8">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-emerald-400 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Shield, Loader2, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import GoogleRecaptcha from '@/components/auth/google-recaptcha';



const sanitizeNextPath = (value: string | null) => {
  if (!value) return '/chat';
  if (!value.startsWith('/') || value.startsWith('//')) return '/chat';
  return value;
};
type PublicSettings = {
  isCaptchaEnabled: boolean;
  recaptchaSiteKey: string | null;
};

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [pending2FAUserId, setPending2FAUserId] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    isCaptchaEnabled: false,
    recaptchaSiteKey: null,
  });
  const router = useRouter();
  const nextPath = sanitizeNextPath(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('next'));

  useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch('/api/session', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.authenticated && data.user) {
          router.replace(nextPath);
        }
      } catch {
        // ignore
      }
    };
    checkSession();
  }, [router, nextPath]);

  useEffect(() => {
    const loadPublicSettings = async () => {
      try {
        const response = await fetch('/api/settings/public', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.success && data?.settings) {
          setPublicSettings({
            isCaptchaEnabled: Boolean(data.settings.isCaptchaEnabled),
            recaptchaSiteKey: typeof data.settings.recaptchaSiteKey === 'string'
              ? data.settings.recaptchaSiteKey
              : null,
          });
        }
      } catch {
        // ignore
      }
    };
    loadPublicSettings();
  }, []);

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
          captchaToken,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Login failed');
      } else if (data.requires2FA) {
        setShow2FA(true);
        setPending2FAUserId(data.userId ?? '');
      } else {
        router.replace(nextPath);
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
        router.replace(nextPath);
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
            <div className="mt-2 text-right">
              <Link href="/auth/recover" className="text-xs text-emerald-400 hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || (publicSettings.isCaptchaEnabled && !captchaToken)}
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
          {publicSettings.isCaptchaEnabled && publicSettings.recaptchaSiteKey && (
            <GoogleRecaptcha
              siteKey={publicSettings.recaptchaSiteKey}
              onTokenChange={setCaptchaToken}
              disabled={isLoading}
            />
          )}
        </form>

        <p className="text-center text-zinc-500 text-sm mt-8">
          Don&apos;t have an account?{' '}
          <Link href={`/auth/register?next=${encodeURIComponent(nextPath)}`} className="text-emerald-400 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}

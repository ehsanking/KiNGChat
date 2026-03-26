'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Shield, Loader2, RefreshCw, KeyRound, AlertTriangle } from 'lucide-react';
// We no longer import server actions directly here. Instead, the login
// and two-factor verification are handled via API routes that set
// session cookies.
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [isCaptchaEnabled, setIsCaptchaEnabled] = useState(true);
  const [captchaError, setCaptchaError] = useState(false);
  const [captchaErrorMessage, setCaptchaErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [pending2FAUserId, setPending2FAUserId] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const router = useRouter();
  const isCaptchaReady = !isCaptchaEnabled || (!!captchaId && !!captchaImage && !captchaError);

  // Auto-redirect if already logged in by checking the session cookie
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

  const fetchCaptcha = useCallback(async () => {
    setCaptchaError(false);
    setCaptchaErrorMessage('');
    setCaptchaImage('');
    setCaptchaId('');
    setCaptchaAnswer('');

    try {
      // Step 1: Fetch public settings via REST API
      const settingsRes = await fetch('/api/settings/public', { cache: 'no-store' });
      if (!settingsRes.ok) {
        throw new Error(`Settings API returned ${settingsRes.status}`);
      }
      const settingsData = await settingsRes.json();
      if (settingsData.success && settingsData.settings?.isCaptchaEnabled === false) {
        setIsCaptchaEnabled(false);
        return;
      }

      setIsCaptchaEnabled(true);

      // Step 2: Fetch captcha via REST API
      const captchaRes = await fetch('/api/captcha', { cache: 'no-store' });
      if (!captchaRes.ok) {
        throw new Error(`Captcha API returned ${captchaRes.status}`);
      }
      const captchaData = await captchaRes.json();

      if (captchaData.success && captchaData.captchaId && captchaData.image) {
        setCaptchaId(captchaData.captchaId);
        setCaptchaImage(captchaData.image);
      } else {
        throw new Error(captchaData.error || 'Invalid captcha response');
      }
    } catch (err) {
      console.error('Captcha load failed:', err);
      setCaptchaError(true);
      setCaptchaErrorMessage(err instanceof Error ? err.message : 'Unknown captcha error');
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
        fetchCaptcha();
      } else if (data.requires2FA) {
        // Show 2FA input
        setShow2FA(true);
        setPending2FAUserId(data.userId!);
      } else {
        router.push('/chat');
      }
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
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
    } catch (err) {
      console.error(err);
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
          <p className="text-zinc-400 text-center text-sm mb-8">
            Enter the 6-digit code from your authenticator app.
          </p>

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
            onClick={() => { setShow2FA(false); setTotpCode(''); setError(''); }}
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
          {isCaptchaEnabled && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Security Check</label>
              <div className="flex items-center gap-2 mb-2">
                {captchaError ? (
                  <div className="flex-1 bg-zinc-950 border border-red-500/50 rounded-xl p-2 h-[66px] flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 text-xs text-center">
                      {captchaErrorMessage || 'Failed to load'}
                    </span>
                  </div>
                ) : captchaImage ? (
                  <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl p-2 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={captchaImage}
                      alt="Captcha"
                      className="h-[50px] w-auto select-none pointer-events-none"
                      draggable={false}
                    />
                  </div>
                ) : (
                  <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl p-2 h-[66px] flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={fetchCaptcha}
                  className="p-3 bg-zinc-800 rounded-xl text-zinc-400 hover:text-emerald-500 transition-colors"
                  title="Refresh Captcha"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
              <input
                type="text"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors uppercase tracking-widest"
                placeholder="Enter the text above"
                required
                disabled={isLoading || !isCaptchaReady}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
          {isCaptchaEnabled && !isCaptchaReady && (
            <p className="text-xs text-amber-400">
              Captcha is not ready yet. Please refresh and wait for it to load before signing in.
            </p>
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

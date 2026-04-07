'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Shield, Loader2, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import GoogleRecaptcha from '@/components/auth/google-recaptcha';

type PublicSettings = {
  isCaptchaEnabled: boolean;
  captchaProvider?: 'recaptcha' | 'local' | string;
  recaptchaSiteKey: string | null;
  localCaptcha?: { prompt: string; captchaId: string } | null;
};

const toFriendlyError = (error: unknown) => {
  const message = typeof error === 'string' ? error : 'Sign-in failed. Please try again.';
  if (/invalid|incorrect|wrong/i.test(message)) return 'Your username or password is incorrect.';
  if (/captcha/i.test(message)) return 'Please complete the security check and try again.';
  if (/challenge|expired|missing/i.test(message)) return 'Your verification step expired. Please sign in again.';
  if (/rate|too many/i.test(message)) return 'Too many attempts. Please wait a moment and try again.';
  return message;
};

type LoginPageClientProps = {
  nextPath: string;
};

export default function LoginPageClient({ nextPath }: LoginPageClientProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [pending2FAUserId, setPending2FAUserId] = useState('');
  const [pending2FAChallengeId, setPending2FAChallengeId] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [localCaptchaAnswer, setLocalCaptchaAnswer] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [phaseMessage, setPhaseMessage] = useState('Enter your username and password.');
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    isCaptchaEnabled: false,
    captchaProvider: 'recaptcha',
    recaptchaSiteKey: null,
    localCaptcha: null,
  });
  const router = useRouter();

  useEffect(() => {
    const loadPublicSettings = async () => {
      try {
        const response = await fetch('/api/settings/public', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        if (data?.success && data?.settings) {
          setPublicSettings({
            isCaptchaEnabled: Boolean(data.settings.isCaptchaEnabled),
            captchaProvider: data.settings.captchaProvider,
            recaptchaSiteKey: typeof data.settings.recaptchaSiteKey === 'string'
              ? data.settings.recaptchaSiteKey
              : null,
            localCaptcha: data.settings.localCaptcha ?? null,
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
    setPhaseMessage('Checking your sign-in details…');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          captchaToken: publicSettings.captchaProvider === 'local' ? localCaptchaAnswer : captchaToken,
          captchaId: publicSettings.captchaProvider === 'local' ? publicSettings.localCaptcha?.captchaId : undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(toFriendlyError(data.error));
        setPhaseMessage('Enter your username and password.');
      } else if (data.requires2FA) {
        if (!data.challengeId) {
          setError('Could not start 2-step verification. Please sign in again.');
          setPhaseMessage('Enter your username and password.');
          return;
        }
        setPending2FAUserId(data.userId ?? '');
        setPending2FAChallengeId(data.challengeId);
        setShow2FA(true);
        setPhaseMessage('Step 2 of 2: Enter your 6-digit code.');
      } else {
        router.replace(nextPath || '/chat');
      }
    } catch {
      setError('Sign-in is temporarily unavailable. Please try again.');
      setPhaseMessage('Enter your username and password.');
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
        body: JSON.stringify({ userId: pending2FAUserId, token: totpCode, challengeId: pending2FAChallengeId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const safeError = toFriendlyError(data.error);
        setError(safeError);
        if (/expired|challenge|missing/i.test(safeError)) {
          setShow2FA(false);
          setPending2FAChallengeId('');
          setPending2FAUserId('');
          setPhaseMessage('Your verification session expired. Please sign in again.');
        }
      } else if (data.success) {
        router.replace(nextPath || '/chat');
      }
    } catch {
      setError('Could not verify your code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (show2FA && pending2FAChallengeId) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4"><div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"><div className="flex justify-center mb-8"><div className="w-16 h-16 bg-brand-gold/10 rounded-full flex items-center justify-center"><KeyRound className="w-8 h-8 text-brand-gold" /></div></div><h2 className="text-2xl font-bold text-center text-zinc-50 mb-2">Almost there</h2><p className="text-zinc-400 text-center text-sm mb-3">Enter the 6-digit code from your authenticator app.</p><p className="text-zinc-500 text-center text-xs mb-8">{phaseMessage}</p>{error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-6 text-center">{error}</div>}<form onSubmit={handle2FAVerify} className="space-y-4"><div><label className="block text-sm font-medium text-zinc-400 mb-1">Verification code</label><input type="text" value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-brand-gold transition-colors" placeholder="000000" required maxLength={6} autoFocus autoComplete="one-time-code" inputMode="numeric" /></div><button type="submit" disabled={isLoading || totpCode.length !== 6} className="w-full bg-brand-gold hover:bg-brand-gold/90 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 rounded-xl transition-colors mt-6 flex items-center justify-center gap-2">{isLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Verifying…</> : 'Verify and continue'}</button></form><button onClick={() => { setShow2FA(false); setTotpCode(''); setError(''); setPhaseMessage('Enter your username and password.'); }} className="w-full text-center text-zinc-500 text-sm mt-4 hover:text-zinc-300">Back to sign in</button></div></div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-8"><div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center"><Shield className="w-8 h-8 text-emerald-500" /></div></div>
        <h2 className="text-2xl font-bold text-center text-zinc-50 mb-2">Welcome back</h2>
        <p className="text-zinc-500 text-center text-xs mb-8">{phaseMessage}</p>
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-6 text-center">{error}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <div><label className="block text-sm font-medium text-zinc-400 mb-1">Username</label><input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors" placeholder="e.g. ehsanking" required disabled={isLoading} /></div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 pr-20 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors" placeholder="********" required disabled={isLoading} autoComplete="current-password" autoCorrect="off" autoCapitalize="none" spellCheck={false} />
              <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute inset-y-0 right-3 text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50" disabled={isLoading} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="mt-2 text-right"><Link href="/auth/recover" className="text-xs text-emerald-400 hover:underline">Forgot password?</Link></div>
          </div>
          <button type="submit" disabled={isLoading || (publicSettings.isCaptchaEnabled && ((publicSettings.captchaProvider === 'local' && !localCaptchaAnswer.trim()) || (publicSettings.captchaProvider !== 'local' && !captchaToken)))} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 rounded-xl transition-colors mt-6 flex items-center justify-center gap-2">{isLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Signing in…</> : 'Sign in securely'}</button>
          {publicSettings.isCaptchaEnabled && publicSettings.captchaProvider === 'recaptcha' && publicSettings.recaptchaSiteKey && <GoogleRecaptcha siteKey={publicSettings.recaptchaSiteKey} onTokenChange={setCaptchaToken} disabled={isLoading} />}
          {publicSettings.isCaptchaEnabled && publicSettings.captchaProvider === 'local' && publicSettings.localCaptcha && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">Security check: {publicSettings.localCaptcha.prompt}</p>
              <input type="text" value={localCaptchaAnswer} onChange={(e) => setLocalCaptchaAnswer(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors" placeholder="Type your answer" required />
            </div>
          )}
        </form>
        <p className="text-center text-zinc-500 text-sm mt-8">Don&apos;t have an account? <Link href={`/auth/register?next=${encodeURIComponent(nextPath)}`} className="text-emerald-400 hover:underline">Create one</Link></p>
      </div>
    </div>
  );
}

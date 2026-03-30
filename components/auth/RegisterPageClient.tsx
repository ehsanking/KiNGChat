'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createRegistrationBundleV2, persistRegistrationBundleV2 } from '@/lib/e2ee-registration';
import { registerUserWithBundleV2 } from '@/lib/e2ee-register-runtime';
import GoogleRecaptcha from '@/components/auth/google-recaptcha';
import { sanitizeNextPath } from '@/lib/auth-next-path';

type PublicSettings = {
  isRegistrationEnabled: boolean;
  isCaptchaEnabled: boolean;
  recaptchaSiteKey: string | null;
};

type RegistrationStage = 'idle' | 'preparing-keys' | 'creating-account';

export default function RegisterPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => sanitizeNextPath(searchParams.get('next')), [searchParams]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    isRegistrationEnabled: true,
    isCaptchaEnabled: false,
    recaptchaSiteKey: null,
  });
  const [captchaToken, setCaptchaToken] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [error, setError] = useState('');
  const [showRecovery, setShowRecovery] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stage, setStage] = useState<RegistrationStage>('idle');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

  const trimmedUsername = username.trim();
  const usernameError = useMemo(() => {
    if (!trimmedUsername) return 'Choose a username to continue.';
    if (trimmedUsername.length < 3) return 'Use at least 3 characters.';
    if (trimmedUsername.length > 24) return 'Use 24 characters or fewer.';
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) return 'Use only letters, numbers, and underscore.';
    return '';
  }, [trimmedUsername]);

  const passwordError = useMemo(() => {
    if (!password) return 'Choose a password to continue.';
    if (password.length < 8) return 'Use at least 8 characters.';
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Add both lowercase and uppercase letters.';
    if (!/\d/.test(password)) return 'Add at least one number.';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Add at least one symbol.';
    return '';
  }, [password]);

  const status = useMemo(() => {
    if (stage === 'preparing-keys') return 'Step 1 of 2: Setting up your device security…';
    if (stage === 'creating-account') return 'Step 2 of 2: Creating your account…';
    return 'Ready. This takes a few seconds.';
  }, [stage]);

  useEffect(() => {
    const loadPublicSettings = async () => {
      try {
        const response = await fetch('/api/settings/public', { cache: 'no-store' });
        if (!response.ok) throw new Error('settings unavailable');
        const data = await response.json();
        if (data?.success && data?.settings) {
          setPublicSettings({
            isRegistrationEnabled: Boolean(data.settings.isRegistrationEnabled),
            isCaptchaEnabled: Boolean(data.settings.isCaptchaEnabled),
            recaptchaSiteKey: typeof data.settings.recaptchaSiteKey === 'string' ? data.settings.recaptchaSiteKey : null,
          });
          setSettingsLoadFailed(false);
          setSettingsLoaded(true);
          return;
        }
      } catch {
        // ignore
      }

      setSettingsLoadFailed(true);
      setSettingsLoaded(true);
    };

    loadPublicSettings();
  }, []);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();

    setUsernameTouched(true);
    setPasswordTouched(true);

    if (usernameError || passwordError) {
      return;
    }

    if (!settingsLoaded || settingsLoadFailed) {
      setError('We could not load required security settings. Refresh and try again.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      setStage('preparing-keys');
      const bundle = await createRegistrationBundleV2();
      await persistRegistrationBundleV2(bundle);

      setStage('creating-account');
      const result = await registerUserWithBundleV2({
        username: trimmedUsername,
        password,
        confirmPassword: password,
        agreementPublicKey: bundle.agreementPublicKey,
        signingPublicKey: bundle.signingPublicKey,
        signedPreKey: bundle.signedPreKey,
        signedPreKeySig: bundle.signedPreKeySig,
        recoveryQuestion,
        recoveryAnswer,
        captchaToken,
      });

      if (result?.error) {
        setError(result.error);
      } else {
        router.replace(`/auth/login?next=${encodeURIComponent('/auth/onboarding?next=' + encodeURIComponent(nextPath || '/chat'))}`);
      }
    } catch {
      setError('Sign-up could not be completed. Please try again.');
    } finally {
      setIsLoading(false);
      setStage('idle');
    }
  };

  const isSubmitDisabled = isLoading
    || !!usernameError
    || !!passwordError
    || !settingsLoaded
    || settingsLoadFailed
    || !publicSettings.isRegistrationEnabled
    || (publicSettings.isCaptchaEnabled && !captchaToken);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6"><div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center"><ShieldCheck className="w-8 h-8 text-emerald-500" /></div></div>
        <h1 className="text-2xl font-bold text-center text-zinc-50 mb-2">Create your Elahe Messenger account</h1>
        <p className="text-zinc-400 text-center text-sm mb-8">Sign up in one step. Your device protection is created automatically on this device.</p>
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl mb-4 text-center">{error}</div>}
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <input
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50"
              placeholder="Username"
              value={username}
              onBlur={() => setUsernameTouched(true)}
              onChange={(e) => setUsername(e.target.value)}
              required
              aria-invalid={usernameTouched && !!usernameError}
            />
            <p className={`text-xs ${usernameTouched && usernameError ? 'text-amber-300' : 'text-zinc-500'}`}>
              {usernameTouched && usernameError ? usernameError : '3–24 characters. Letters, numbers, and underscore only.'}
            </p>
          </div>
          <div className="space-y-2">
            <input
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50"
              placeholder="Password"
              type="password"
              value={password}
              onBlur={() => setPasswordTouched(true)}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={passwordTouched && !!passwordError}
            />
            <p className={`text-xs ${passwordTouched && passwordError ? 'text-amber-300' : 'text-zinc-500'}`}>
              {passwordTouched && passwordError ? passwordError : '8+ characters with upper/lowercase, a number, and a symbol.'}
            </p>
          </div>
          <div className="space-y-2">
            <button type="button" onClick={() => setShowRecovery((prev) => !prev)} className="text-xs text-brand-gold hover:underline">
              {showRecovery ? 'Hide recovery question (optional)' : 'Add a recovery question (optional)'}
            </button>
            {showRecovery && (
              <>
                <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50" placeholder="Recovery question" value={recoveryQuestion} onChange={(e) => setRecoveryQuestion(e.target.value)} minLength={5} maxLength={200} />
                <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50" placeholder="Recovery answer" value={recoveryAnswer} onChange={(e) => setRecoveryAnswer(e.target.value)} minLength={1} maxLength={200} />
                <p className="text-xs text-zinc-500">You can also set this later in account security settings.</p>
              </>
            )}
          </div>
          {publicSettings.isCaptchaEnabled && publicSettings.recaptchaSiteKey && <GoogleRecaptcha siteKey={publicSettings.recaptchaSiteKey} onTokenChange={setCaptchaToken} disabled={isLoading} />}
          <button type="submit" disabled={isSubmitDisabled} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Setting up your account…</> : 'Create account'}
          </button>
        </form>
        <div className="mt-4 space-y-2">
          <p className="text-zinc-500 text-sm text-center">{status}</p>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-400 space-y-1">
            <p>• Your private keys stay on this device.</p>
            {!publicSettings.isRegistrationEnabled && <p className="text-amber-400">New sign-ups are currently paused by the administrator.</p>}
          </div>
        </div>
        <p className="text-center text-zinc-500 text-sm mt-6">Already have an account? <Link href={`/auth/login?next=${encodeURIComponent(nextPath)}`} className="text-emerald-400 hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}

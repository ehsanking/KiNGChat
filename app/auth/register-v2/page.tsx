'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import TurnstileWidget from '@/components/TurnstileWidget';
import { createRegistrationBundleV2, persistRegistrationBundleV2 } from '@/lib/e2ee-registration';
import { registerUserWithBundleV2 } from '@/lib/e2ee-register-runtime';

type PublicSettings = {
  isCaptchaEnabled: boolean;
  isRegistrationEnabled: boolean;
  captchaProvider?: string;
  turnstileSiteKey?: string;
};

export default function RegisterV2Page() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    isCaptchaEnabled: false,
    isRegistrationEnabled: true,
    captchaProvider: 'disabled',
    turnstileSiteKey: '',
  });
  const [captchaError, setCaptchaError] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Ready to create your account.');
  const passwordHint = useMemo(() => 'Use 8+ characters with upper/lowercase letters, a number, and a symbol.', []);
  const isCaptchaReady = !publicSettings.isCaptchaEnabled || captchaToken.length > 0;

  const fetchJsonWithRetry = async (url: string, attempts = 3) => {
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
  };

  useEffect(() => {
    const loadPublicSettings = async () => {
      try {
        const data = await fetchJsonWithRetry('/api/settings/public');
        if (data?.success && data?.settings) {
          setPublicSettings(data.settings);
          return;
        }
      } catch {
        // ignore
      }

      setCaptchaError('Unable to load security settings.');
      setPublicSettings({
        isCaptchaEnabled: false,
        isRegistrationEnabled: true,
        captchaProvider: 'disabled',
        turnstileSiteKey: '',
      });
    };

    loadPublicSettings();
  }, []);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      setStatus('Creating your device security keys...');
      const bundle = await createRegistrationBundleV2();
      await persistRegistrationBundleV2(bundle);

      setStatus('Finishing secure account setup...');
      const result = await registerUserWithBundleV2({
        username,
        password,
        confirmPassword: password,
        agreementPublicKey: bundle.agreementPublicKey,
        signingPublicKey: bundle.signingPublicKey,
        signedPreKey: bundle.signedPreKey,
        signedPreKeySig: bundle.signedPreKeySig,
        captchaToken,
      });

      if (result?.error) {
        setError(result.error);
        setCaptchaToken('');
      } else {
        router.replace('/auth/login');
      }
    } catch {
      setError('Registration failed.');
    } finally {
      setIsLoading(false);
      setStatus('Ready to create your account.');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-emerald-500" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-zinc-50 mb-2">Create your KiNGChat account</h1>
        <p className="text-zinc-400 text-center text-sm mb-8">Simple sign-up first. Your device security keys are created automatically on this device during setup.</p>
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl mb-4 text-center">{error}</div>}
        <form onSubmit={handleRegister} className="space-y-4">
          <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <div className="space-y-2">
            <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <p className="text-xs text-zinc-500">{passwordHint}</p>
          </div>

          {publicSettings.isCaptchaEnabled && publicSettings.turnstileSiteKey ? (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">Security Check</label>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                <TurnstileWidget siteKey={publicSettings.turnstileSiteKey} onTokenChange={setCaptchaToken} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-400">Captcha is disabled because Turnstile keys are not configured.</p>
          )}

          {captchaError && <p className="text-xs text-amber-400">{captchaError}</p>}

          <button type="submit" disabled={isLoading || !publicSettings.isRegistrationEnabled || !isCaptchaReady} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Creating account...</> : 'Create secure account'}
          </button>
        </form>
        <div className="mt-4 space-y-2">
          <p className="text-zinc-500 text-sm text-center">{status}</p>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-400 space-y-1">
            <p>• Your private keys stay on this device.</p>
            <p>• We only ask for extra anti-abuse checks when the server requires them.</p>
            {!publicSettings.isRegistrationEnabled && <p className="text-amber-400">Registration is currently paused by the administrator.</p>}
          </div>
        </div>
        <p className="text-center text-zinc-500 text-sm mt-6">Already have an account? <Link href="/auth/login" className="text-emerald-400 hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}

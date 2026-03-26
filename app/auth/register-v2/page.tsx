'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createRegistrationBundleV2, persistRegistrationBundleV2 } from '@/lib/e2ee-registration';
import { registerUserWithBundleV2 } from '@/lib/e2ee-register-runtime';

export default function RegisterV2Page() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaImage, setCaptchaImage] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [publicSettings, setPublicSettings] = useState<{ isCaptchaEnabled: boolean; isRegistrationEnabled: boolean }>({
    isCaptchaEnabled: false,
    isRegistrationEnabled: true,
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('Ready to create your account.');
  const passwordHint = useMemo(() => 'Use 8+ characters with upper/lowercase letters, a number, and a symbol.', []);

  const loadPublicSettings = async () => {
    try {
      const response = await fetch('/api/settings/public', { cache: 'no-store' });
      const data = await response.json();
      if (data?.success && data?.settings) {
        setPublicSettings({
          isCaptchaEnabled: Boolean(data.settings.isCaptchaEnabled),
          isRegistrationEnabled: Boolean(data.settings.isRegistrationEnabled),
        });
        if (!data.settings.isCaptchaEnabled) {
          setCaptchaId('');
          setCaptchaImage('');
          setCaptchaAnswer('');
          return;
        }
      }
    } catch {}

    await fetchCaptcha();
  };

  const fetchCaptcha = async () => {
    try {
      const response = await fetch('/api/captcha');
      const data = await response.json();
      if (data.success) {
        setPublicSettings((prev) => ({ ...prev, isCaptchaEnabled: true }));
        setCaptchaId(data.captchaId);
        setCaptchaImage(data.image);
      }
    } catch {
      setError('Failed to load captcha.');
    }
  };

  useEffect(() => {
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
        captchaId,
        captchaAnswer,
      });

      if (result?.error) {
        setError(result.error);
        await fetchCaptcha();
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
          {publicSettings.isCaptchaEnabled && captchaImage && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl p-2 flex items-center justify-center">
                  <img src={captchaImage} alt="Captcha" className="h-[50px] w-auto" />
                </div>
                <button type="button" onClick={fetchCaptcha} className="p-3 bg-zinc-800 rounded-xl text-zinc-400 hover:text-emerald-500 transition-colors">
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
              <input className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50" placeholder="Captcha" value={captchaAnswer} onChange={(e) => setCaptchaAnswer(e.target.value)} required />
            </div>
          )}
          <button type="submit" disabled={isLoading || !publicSettings.isRegistrationEnabled} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
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

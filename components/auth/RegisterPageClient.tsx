'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Loader2,
  ShieldCheck,
  ArrowRight,
  ChevronLeft,
  Check,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  createRegistrationBundleV2,
  persistRegistrationBundleV2,
} from '@/lib/e2ee-registration';
import { registerUserWithBundleV2 } from '@/lib/e2ee-register-runtime';
import GoogleRecaptcha from '@/components/auth/google-recaptcha';
import ThemeToggleButton from '@/components/ThemeToggleButton';
import LanguageSelector from '@/components/LanguageSelector';

type PublicSettings = {
  isRegistrationEnabled: boolean;
  isCaptchaEnabled: boolean;
  recaptchaSiteKey: string | null;
  oauthProviders?: { google: boolean; github: boolean; oidc: boolean };
  requireEmailVerification?: boolean;
};

type RegistrationStage = 'idle' | 'preparing-keys' | 'creating-account';

type RegisterPageClientProps = {
  nextPath: string;
};

export default function RegisterPageClient({ nextPath }: RegisterPageClientProps) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [publicSettings, setPublicSettings] = useState<PublicSettings>({
    isRegistrationEnabled: true,
    isCaptchaEnabled: false,
    recaptchaSiteKey: null,
    oauthProviders: { google: false, github: false, oidc: false },
    requireEmailVerification: false,
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

  const trimmedEmail = email.trim().toLowerCase();
  const emailError = useMemo(() => {
    if (!publicSettings.requireEmailVerification && !trimmedEmail) return '';
    if (publicSettings.requireEmailVerification && !trimmedEmail) return 'Email is required.';
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
      return 'Enter a valid email address.';
    return '';
  }, [trimmedEmail, publicSettings.requireEmailVerification]);

  const trimmedUsername = username.trim();
  const usernameError = useMemo(() => {
    if (!trimmedUsername) return 'Choose a username to continue.';
    if (trimmedUsername.length < 3) return 'Use at least 3 characters.';
    if (trimmedUsername.length > 24) return 'Use 24 characters or fewer.';
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername))
      return 'Use only letters, numbers, and underscore.';
    return '';
  }, [trimmedUsername]);

  const passwordChecks = useMemo(() => {
    return {
      length: password.length >= 8,
      case: /[a-z]/.test(password) && /[A-Z]/.test(password),
      number: /\d/.test(password),
      symbol: /[^A-Za-z0-9]/.test(password),
    };
  }, [password]);

  const passwordError = useMemo(() => {
    if (!password) return 'Choose a password to continue.';
    if (!passwordChecks.length) return 'Use at least 8 characters.';
    if (!passwordChecks.case) return 'Add both lowercase and uppercase letters.';
    if (!passwordChecks.number) return 'Add at least one number.';
    if (!passwordChecks.symbol) return 'Add at least one symbol.';
    return '';
  }, [password, passwordChecks]);

  const passwordStrength = useMemo(() => {
    const score =
      Number(passwordChecks.length) +
      Number(passwordChecks.case) +
      Number(passwordChecks.number) +
      Number(passwordChecks.symbol);
    return score; // 0-4
  }, [passwordChecks]);

  const status = useMemo(() => {
    if (stage === 'preparing-keys')
      return 'Step 1 of 2: Setting up your device security…';
    if (stage === 'creating-account')
      return 'Step 2 of 2: Creating your account…';
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
            recaptchaSiteKey:
              typeof data.settings.recaptchaSiteKey === 'string'
                ? data.settings.recaptchaSiteKey
                : null,
            oauthProviders: {
              google: Boolean(data.settings.oauthProviders?.google),
              github: Boolean(data.settings.oauthProviders?.github),
              oidc: Boolean(data.settings.oauthProviders?.oidc),
            },
            requireEmailVerification: Boolean(data.settings.requireEmailVerification),
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
    setEmailTouched(true);

    if (usernameError || passwordError || emailError) {
      return;
    }

    if (!settingsLoaded || settingsLoadFailed) {
      setError(
        'We could not load required security settings. Refresh and try again.',
      );
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
        email: trimmedEmail || undefined,
      });

      if (result?.error) {
        setError(result.error);
      } else if (result?.requiresEmailVerification) {
        router.replace(
          `/auth/verify-email?next=${encodeURIComponent(nextPath || '/chat')}`,
        );
      } else {
        router.replace(
          `/auth/login?next=${encodeURIComponent(
            '/auth/onboarding?next=' + encodeURIComponent(nextPath || '/chat'),
          )}`,
        );
      }
    } catch {
      setError('Sign-up could not be completed. Please try again.');
    } finally {
      setIsLoading(false);
      setStage('idle');
    }
  };

  const isSubmitDisabled =
    isLoading ||
    !!usernameError ||
    !!passwordError ||
    !!emailError ||
    !settingsLoaded ||
    settingsLoadFailed ||
    !publicSettings.isRegistrationEnabled ||
    (publicSettings.isCaptchaEnabled && !captchaToken);

  const strengthMeta = [
    { label: 'Weak', color: 'oklch(65% 0.22 25)' },
    { label: 'Fair', color: 'oklch(72% 0.18 55)' },
    { label: 'Good', color: 'oklch(75% 0.16 95)' },
    { label: 'Strong', color: 'oklch(72% 0.18 150)' },
    { label: 'Excellent', color: 'oklch(72% 0.18 160)' },
  ];

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-aurora opacity-60 dark:opacity-35" />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-mesh opacity-50 dark:opacity-20" />

      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/70 px-3 py-2 text-xs font-medium text-[var(--text-secondary)] backdrop-blur hover:text-[var(--text-primary)] sm:left-6 sm:top-6"
      >
        <ChevronLeft className="h-4 w-4" />
        Home
      </Link>

      <div
        className="glass-strong relative w-full max-w-md overflow-hidden rounded-3xl p-7 sm:p-9"
        style={{ animation: 'var(--animate-scale-in)' }}
      >
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative h-8 w-8">
              <Image
                src="/logo.png"
                alt="Elahe Messenger"
                fill
                sizes="32px"
                className="object-contain"
                unoptimized
              />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Elahe <span className="text-gradient-brand">Messenger</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <ThemeToggleButton />
          </div>
        </div>

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-inner">
            <ShieldCheck className="h-6 w-6 text-[var(--success)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Create your account
          </h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
            One step. Your device keys are generated locally and never leave this browser.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-4 py-3 text-center text-sm text-[color:var(--danger)]"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div className="space-y-2">
            <div className="relative">
              <input
                id="reg-username"
                className="peer w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/80 px-4 pb-2.5 pt-6 text-sm text-[var(--text-primary)] backdrop-blur transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                placeholder=" "
                value={username}
                onBlur={() => setUsernameTouched(true)}
                onChange={(e) => setUsername(e.target.value)}
                required
                aria-invalid={usernameTouched && !!usernameError}
              />
              <label
                htmlFor="reg-username"
                className="pointer-events-none absolute start-4 top-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]"
              >
                Username
              </label>
            </div>
            <p
              className={`text-xs ${
                usernameTouched && usernameError
                  ? 'text-[color:var(--warning)]'
                  : 'text-[var(--text-muted)]'
              }`}
            >
              {usernameTouched && usernameError
                ? usernameError
                : '3–24 characters. Letters, numbers, and underscore only.'}
            </p>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <input
                id="reg-password"
                className="peer w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/80 px-4 pb-2.5 pt-6 text-sm text-[var(--text-primary)] backdrop-blur transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                placeholder=" "
                type="password"
                value={password}
                onBlur={() => setPasswordTouched(true)}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-invalid={passwordTouched && !!passwordError}
              />
              <label
                htmlFor="reg-password"
                className="pointer-events-none absolute start-4 top-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]"
              >
                Password
              </label>
            </div>

            {/* Password strength meter */}
            <div className="flex gap-1.5" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-1.5 flex-1 rounded-full transition-colors"
                  style={{
                    backgroundColor:
                      i < passwordStrength
                        ? strengthMeta[passwordStrength - 1]?.color ?? 'var(--border)'
                        : 'var(--border)',
                  }}
                />
              ))}
            </div>

            <ul className="grid grid-cols-2 gap-1 text-[11px] text-[var(--text-muted)]">
              <CheckItem ok={passwordChecks.length} label="8+ characters" />
              <CheckItem ok={passwordChecks.case} label="Upper &amp; lowercase" />
              <CheckItem ok={passwordChecks.number} label="A number" />
              <CheckItem ok={passwordChecks.symbol} label="A symbol" />
            </ul>
          </div>

          {/* Email field */}
          <div className="space-y-2">
            <div className="relative">
              <input
                id="reg-email"
                className="peer w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/80 px-4 pb-2.5 pt-6 text-sm text-[var(--text-primary)] backdrop-blur transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                placeholder=" "
                type="email"
                value={email}
                onBlur={() => setEmailTouched(true)}
                onChange={(e) => setEmail(e.target.value)}
                required={publicSettings.requireEmailVerification}
                aria-invalid={emailTouched && !!emailError}
              />
              <label
                htmlFor="reg-email"
                className="pointer-events-none absolute start-4 top-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]"
              >
                Email{publicSettings.requireEmailVerification ? '' : ' (optional)'}
              </label>
            </div>
            {emailTouched && emailError ? (
              <p className="text-xs text-[color:var(--warning)]">{emailError}</p>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                {publicSettings.requireEmailVerification
                  ? 'Required for account verification and password recovery.'
                  : 'Optional — used for password recovery.'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowRecovery((prev) => !prev)}
              className="text-xs font-medium text-[var(--accent)] hover:underline"
            >
              {showRecovery
                ? 'Hide recovery question (optional)'
                : 'Add a recovery question (optional)'}
            </button>
            {showRecovery && (
              <div className="space-y-2">
                <input
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/80 px-4 py-3 text-sm text-[var(--text-primary)] backdrop-blur focus:border-[var(--accent)] focus:outline-none"
                  placeholder="Recovery question"
                  value={recoveryQuestion}
                  onChange={(e) => setRecoveryQuestion(e.target.value)}
                  minLength={5}
                  maxLength={200}
                />
                <input
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/80 px-4 py-3 text-sm text-[var(--text-primary)] backdrop-blur focus:border-[var(--accent)] focus:outline-none"
                  placeholder="Recovery answer"
                  value={recoveryAnswer}
                  onChange={(e) => setRecoveryAnswer(e.target.value)}
                  minLength={1}
                  maxLength={200}
                />
                <p className="text-xs text-[var(--text-muted)]">
                  You can also set this later in account security settings.
                </p>
              </div>
            )}
          </div>

          {publicSettings.isCaptchaEnabled && publicSettings.recaptchaSiteKey && (
            <GoogleRecaptcha
              siteKey={publicSettings.recaptchaSiteKey}
              onTokenChange={setCaptchaToken}
              disabled={isLoading}
            />
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="btn-modern flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-white shadow-lg shadow-[color:var(--accent-soft)] hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Setting up your account…
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-5 space-y-2">
          <p className="text-center text-xs text-[var(--text-muted)]">{status}</p>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/60 p-3 text-xs text-[var(--text-secondary)] backdrop-blur">
            <p>• Your private keys stay on this device.</p>
            {!publicSettings.isRegistrationEnabled && (
              <p className="mt-1 text-[color:var(--warning)]">
                New sign-ups are currently paused by the administrator.
              </p>
            )}
          </div>
        </div>

        {(publicSettings.oauthProviders?.google ||
          publicSettings.oauthProviders?.github ||
          publicSettings.oauthProviders?.oidc) && (
          <div className="mt-5">
            <div className="relative my-4 flex items-center">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span className="mx-3 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                or use SSO
              </span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>
            <div className="space-y-2">
              {publicSettings.oauthProviders?.google && (
                <OAuthButton
                  href="/api/auth/signin/google?callbackUrl=%2Fapi%2Fauth%2Foauth%2Ffinalize"
                  label="Continue with Google"
                />
              )}
              {publicSettings.oauthProviders?.github && (
                <OAuthButton
                  href="/api/auth/signin/github?callbackUrl=%2Fapi%2Fauth%2Foauth%2Ffinalize"
                  label="Continue with GitHub"
                />
              )}
              {publicSettings.oauthProviders?.oidc && (
                <OAuthButton
                  href="/api/auth/signin/oidc?callbackUrl=%2Fapi%2Fauth%2Foauth%2Ffinalize"
                  label="Continue with SSO"
                />
              )}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
          Already have an account?{' '}
          <Link
            href={`/auth/login?next=${encodeURIComponent(nextPath)}`}
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function CheckItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded-full border ${
          ok
            ? 'border-[color:var(--success)]/50 bg-[color:var(--success)]/15 text-[color:var(--success)]'
            : 'border-[var(--border)] text-[var(--text-muted)]'
        }`}
      >
        {ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
      </span>
      <span dangerouslySetInnerHTML={{ __html: label }} />
    </li>
  );
}

function OAuthButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="btn-modern flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/70 py-3 text-sm font-medium text-[var(--text-primary)] backdrop-blur transition-colors hover:border-[var(--border-hover)] hover:bg-[var(--bg-tertiary)]"
    >
      {label}
    </Link>
  );
}

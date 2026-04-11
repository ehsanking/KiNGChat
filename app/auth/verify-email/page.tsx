'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck, Loader2, RefreshCw, ArrowLeft } from 'lucide-react';
import { sendEmailVerificationCode, verifyEmailCode } from '@/app/actions/email-verification';
import { useSession } from '@/hooks/useSession';
import Link from 'next/link';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') || '/chat';
  const router = useRouter();
  const { user, isLoading: isLoadingSession } = useSession();

  const [code, setCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const didSendRef = useRef(false);

  useEffect(() => {
    if (isLoadingSession) return;
    if (!user) {
      router.push('/auth/login');
      return;
    }
    if (user.emailVerified) {
      router.push(nextPath);
      return;
    }
    // Auto-send on first load
    if (!didSendRef.current) {
      didSendRef.current = true;
      handleSend();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoadingSession]);

  const handleSend = async () => {
    setIsSending(true);
    setError('');
    setInfo('');
    const result = await sendEmailVerificationCode();
    setIsSending(false);
    if (result.error) {
      setError(result.error);
    } else {
      setCodeSent(true);
      setInfo('A 6-digit code has been sent to your email address.');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setError('');
    const result = await verifyEmailCode(code);
    setIsVerifying(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push(nextPath);
    }
  };

  if (isLoadingSession || !user) return null;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-brand-gold/10 rounded-full flex items-center justify-center">
            <MailCheck className="w-8 h-8 text-brand-gold" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-zinc-50 mb-2">Verify Your Email</h2>
          <p className="text-zinc-400 text-sm">
            Enter the 6-digit code sent to your email address to activate your account.
          </p>
        </div>

        {info && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm p-3 rounded-xl mb-4 text-center">
            {info}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-brand-gold transition-colors"
              placeholder="000000"
              disabled={isVerifying}
              autoComplete="one-time-code"
            />
          </div>

          <button
            type="submit"
            disabled={isVerifying || code.length !== 6}
            className="w-full bg-brand-gold hover:bg-brand-gold/90 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Verifying…
              </>
            ) : (
              'Verify Email'
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link
            href="/auth/login"
            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {codeSent ? 'Resend Code' : 'Send Code'}
          </button>
        </div>
      </div>
    </div>
  );
}

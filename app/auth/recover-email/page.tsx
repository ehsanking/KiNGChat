'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Loader2, ArrowLeft, KeyRound } from 'lucide-react';
import {
  sendPasswordResetCode,
  resetPasswordWithEmailCode,
} from '@/app/actions/email-verification';
import Link from 'next/link';

type Stage = 'request' | 'reset';

export default function RecoverEmailPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('request');
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setInfo('');
    await sendPasswordResetCode(usernameOrEmail);
    setIsLoading(false);
    setInfo(
      'If an account with that username or email exists, a reset code has been sent to the associated email address.',
    );
    setStage('reset');
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const result = await resetPasswordWithEmailCode({
      usernameOrEmail,
      code,
      newPassword,
      confirmPassword,
    });
    setIsLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      alert('Password reset successfully. Please log in with your new password.');
      router.push('/auth/login');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center">
            {stage === 'request' ? (
              <Mail className="w-8 h-8 text-blue-400" />
            ) : (
              <KeyRound className="w-8 h-8 text-blue-400" />
            )}
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-zinc-50 mb-2">
            {stage === 'request' ? 'Reset Password via Email' : 'Enter Reset Code'}
          </h2>
          <p className="text-zinc-400 text-sm">
            {stage === 'request'
              ? 'Enter your username or email address and we will send you a reset code.'
              : 'Enter the 6-digit code sent to your email and choose a new password.'}
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

        {stage === 'request' ? (
          <form onSubmit={handleRequest} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Username or Email
              </label>
              <input
                type="text"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="your_username or email@example.com"
                required
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !usernameOrEmail.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              Send Reset Code
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Reset Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="000000"
                disabled={isLoading}
                autoComplete="one-time-code"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || code.length !== 6 || !newPassword || !confirmPassword}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              Reset Password
            </button>
            <button
              type="button"
              onClick={() => setStage('request')}
              className="w-full text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
            >
              Back
            </button>
          </form>
        )}

        <div className="mt-6 flex justify-center">
          <Link
            href="/auth/login"
            className="flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}

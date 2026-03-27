'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldQuestion } from 'lucide-react';

export default function RecoverPasswordPage() {
  const [username, setUsername] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState('');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleLoadQuestion = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setStatus('');
    setRecoveryQuestion('');

    setIsLoadingQuestion(true);
    try {
      const response = await fetch('/api/password-recovery', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'question',
          username,
        }),
      });
      const data = await response.json();

      if (!response.ok || data?.error) {
        setError(data?.error || 'Could not load recovery question.');
        return;
      }

      setRecoveryQuestion(typeof data?.recoveryQuestion === 'string' ? data.recoveryQuestion : '');
    } catch {
      setError('Could not load recovery question.');
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  const handleResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setStatus('');

    setIsResetting(true);
    try {
      const response = await fetch('/api/password-recovery', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          username,
          recoveryAnswer,
          newPassword,
          confirmPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok || data?.error) {
        setError(data?.error || 'Password reset failed.');
        return;
      }

      setStatus('Password changed successfully. You can now sign in with your new password.');
      setRecoveryAnswer('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('Password reset failed.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
            <ShieldQuestion className="w-8 h-8 text-emerald-500" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-zinc-50">Password recovery</h1>
        <p className="text-zinc-400 text-center text-sm">
          Enter your username, answer your recovery question, and set a new password.
        </p>

        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl text-center">{error}</div>}
        {status && <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-300 text-sm p-3 rounded-xl text-center">{status}</div>}

        <form onSubmit={handleLoadQuestion} className="space-y-3">
          <input
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={isLoadingQuestion || isResetting}
          />
          <button
            type="submit"
            disabled={isLoadingQuestion || isResetting || !username.trim()}
            className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-100 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {isLoadingQuestion ? <><Loader2 className="w-4 h-4 animate-spin" />Loading question...</> : 'Load recovery question'}
          </button>
        </form>

        {recoveryQuestion && (
          <form onSubmit={handleResetPassword} className="space-y-3">
            <div className="text-sm text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-3">
              <span className="text-zinc-400 block text-xs mb-1">Recovery question</span>
              {recoveryQuestion}
            </div>
            <input
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50"
              placeholder="Recovery answer"
              value={recoveryAnswer}
              onChange={(e) => setRecoveryAnswer(e.target.value)}
              required
              maxLength={200}
              disabled={isResetting}
            />
            <input
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50"
              placeholder="New password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              disabled={isResetting}
            />
            <input
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50"
              placeholder="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              maxLength={128}
              disabled={isResetting}
            />
            <button
              type="submit"
              disabled={isResetting}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-zinc-950 font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isResetting ? <><Loader2 className="w-4 h-4 animate-spin" />Updating...</> : 'Reset password'}
            </button>
          </form>
        )}

        <p className="text-center text-zinc-500 text-sm">
          Remembered your password?{' '}
          <Link href="/auth/login" className="text-emerald-400 hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}

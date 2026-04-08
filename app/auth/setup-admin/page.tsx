'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2, AlertTriangle } from 'lucide-react';
import { updateAdminCredentials } from '@/app/actions/auth.actions';
import { useSession } from '@/hooks/useSession';

export default function SetupAdminPage() {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { user: currentUser, isLoading: isLoadingSession, logout } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoadingSession) return;
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    if (!currentUser.needsPasswordChange) {
      router.push('/chat');
    }
  }, [currentUser, isLoadingSession, router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!currentUser) {
      setError('Session not found. Please log in again.');
      setIsLoading(false);
      return;
    }

    try {
      const result = await updateAdminCredentials({
        userId: currentUser.id,
        newUsername,
        newPassword,
        confirmPassword
      });

      if (result.error) {
        setError(result.error);
      } else {
        let logoutFailureMessage = '';
        try {
          await logout();
        } catch (logoutError) {
          console.error('Logout after credential update failed:', logoutError);
          logoutFailureMessage = ' Automatic logout failed, but your credentials were updated.';
        }
        alert(`Credentials updated successfully.${logoutFailureMessage} Please login with your new credentials.`);
        window.location.assign('/auth/login');
      }
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingSession || !currentUser) return null;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-brand-gold/10 rounded-full flex items-center justify-center">
            <Shield className="w-8 h-8 text-brand-gold" />
          </div>
        </div>
        
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-zinc-50 mb-2">Initial Admin Setup</h2>
          <p className="text-zinc-400 text-sm">For security reasons, you must change the default admin credentials before continuing.</p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/50 text-amber-500 text-xs p-4 rounded-xl mb-6 flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p>The default username and password &quot;admin&quot; will be disabled after this step.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">New Admin Username</label>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-brand-gold transition-colors"
              placeholder="e.g. super_admin"
              required
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">New Admin Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-brand-gold transition-colors"
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-brand-gold transition-colors"
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-gold hover:bg-brand-gold/90 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-950 font-semibold py-3 rounded-xl transition-colors mt-6 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Updating...
              </>
            ) : (
              'Update & Logout'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

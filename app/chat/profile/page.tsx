'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Camera, Save, User, BadgeCheck, Shield, Headset, ShoppingBag, Wrench, Megaphone, Server, KeyRound, Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
// Import profile and 2FA actions from the refactored modules.  `getPublicUserProfile`
// returns the profile of any user by id, while `updateUserProfile` applies
// updates for the authenticated user.  2FA actions derive the current
// user from the session.
import { getUserProfile, updateUserProfile } from '@/app/actions/profile.actions';
import { setup2FA, verify2FA, disable2FA } from '@/app/actions/security-2fa.actions';
import { useRouter } from 'next/navigation';

export default function UserProfile() {
  const MAX_PROFILE_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  // 2FA State
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [show2FADisable, setShow2FADisable] = useState(false);
  const [twoFAMessage, setTwoFAMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch('/api/session', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) {
          router.push('/auth/login');
          return;
        }
        const data = await res.json();
        if (!data.authenticated || !data.user) {
          router.push('/auth/login');
          return;
        }
        if (data.user.needsPasswordChange) {
          router.push('/auth/setup-admin');
          return;
        }
        const user = data.user;
        setCurrentUser(user);

        const result = await getUserProfile();
        if ('success' in result && result.success && result.user) {
          setDisplayName(result.user.displayName || result.user.username || '');
          setBio(result.user.bio || '');
          setProfilePhoto(result.user.profilePhoto || null);
          setIs2FAEnabled(!!(result.user as any).totpEnabled);
          const mergedUser = { ...user, ...result.user };
          setCurrentUser(mergedUser);
        }
      } catch (err) {
        console.error('Failed to initialize profile session:', err);
        router.push('/auth/login');
      }
    };
    init();
  }, [router]);

  const renderBadgeIcon = (badge: string | null) => {
    switch (badge) {
      case 'Support': return <div title="Support"><Headset className="w-4 h-4 text-blue-400" /></div>;
      case 'Seller': return <div title="Seller"><ShoppingBag className="w-4 h-4 text-orange-400" /></div>;
      case 'Technical': return <div title="Technical"><Wrench className="w-4 h-4 text-zinc-400" /></div>;
      case 'Ads': return <div title="Ads"><Megaphone className="w-4 h-4 text-purple-400" /></div>;
      default: return null;
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_PROFILE_PHOTO_SIZE) {
        setStatusMessage({ type: 'error', text: 'Profile photo size must be 5MB or less.' });
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhoto(reader.result as string);
        setStatusMessage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!currentUser?.id) return;

    setIsSaving(true);
    setStatusMessage(null);

    const result = await updateUserProfile({
      displayName,
      bio,
      profilePhoto,
    });

    setIsSaving(false);

    if (result.error) {
      setStatusMessage({ type: 'error', text: result.error });
      return;
    }

    if ('success' in result && result.success && result.user) {
      const mergedUser = { ...currentUser, ...result.user };
      setCurrentUser(mergedUser);
      setStatusMessage({ type: 'success', text: 'Profile updated successfully.' });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 md:px-8 bg-zinc-900/50 sticky top-0 z-10">
        <div className="flex items-center">
          <Link href="/chat" className="p-2 -ml-2 mr-4 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <div className="w-6 h-6 relative">
              <Image src="https://s8.uupload.ir/files/transparent-logo_omst.png" alt="Logo" fill sizes="24px" className="object-contain" unoptimized />
            </div>
            Profile Settings
          </h1>
        </div>
        {currentUser?.role === 'ADMIN' && (
          <Link href="/chat?view=admin&tab=settings" className="flex items-center gap-2 p-2 px-4 bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20 rounded-lg transition-colors text-sm font-medium">
            <Server className="w-4 h-4" />
            <span className="hidden sm:inline">System Settings</span>
          </Link>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 md:p-8">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-xl space-y-8">
          
          {/* Profile Photo Section */}
          <div className="flex flex-col items-center space-y-4">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full bg-zinc-800 border-4 border-zinc-950 overflow-hidden flex items-center justify-center relative">
                {profilePhoto ? (
                  <Image 
                    src={profilePhoto} 
                    alt="Profile" 
                    fill 
                    sizes="128px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <User className="w-12 h-12 text-zinc-500" />
                )}
                
                {/* Hover Overlay */}
                <label className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  <Camera className="w-6 h-6 text-white mb-1" />
                  <span className="text-xs text-white font-medium">Change</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handlePhotoUpload}
                  />
                </label>
              </div>
            </div>
            <div className="text-center flex flex-col items-center">
              <div className="flex items-center gap-2 justify-center">
                <h2 className="text-xl font-bold text-zinc-50">{displayName || 'Anonymous User'}</h2>
                {currentUser?.isVerified && <div title="Verified"><BadgeCheck className="w-5 h-5 text-blue-500" /></div>}
                {renderBadgeIcon(currentUser?.badge)}
                {currentUser?.role === 'ADMIN' && <div title="Admin"><Shield className="w-5 h-5 text-brand-gold" /></div>}
              </div>
              <p className="text-sm text-zinc-400 font-mono mt-1">@{currentUser?.username || 'user'}</p>
            </div>
          </div>

          <hr className="border-zinc-800" />

          {/* Edit Form */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-brand-gold transition-colors"
                placeholder="Enter your display name"
                maxLength={50}
              />
              <p className="text-xs text-zinc-500 mt-2">
                This is how other users will see you in chats and groups.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-brand-gold transition-colors resize-none"
                placeholder="Tell others a bit about yourself..."
                maxLength={160}
              />
              <div className="flex justify-end mt-1">
                <span className="text-xs text-zinc-500">{bio.length}/160</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-brand-gold hover:bg-brand-gold/90 disabled:bg-brand-gold/50 disabled:cursor-not-allowed text-zinc-950 font-semibold px-8 py-3 rounded-xl transition-colors flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          {statusMessage && (
            <p className={`text-sm ${statusMessage.type === 'success' ? 'text-emerald-500' : 'text-red-400'}`}>
              {statusMessage.text}
            </p>
          )}

          <hr className="border-zinc-800" />

          {/* Two-Factor Authentication Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-brand-gold/10 rounded-lg">
                <KeyRound className="w-5 h-5 text-brand-gold" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">Two-Factor Authentication</h3>
                <p className="text-xs text-zinc-500">Add an extra layer of security using Google Authenticator or Authy</p>
              </div>
            </div>

            {twoFAMessage && (
              <div className={`text-sm p-3 rounded-xl ${twoFAMessage.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                {twoFAMessage.text}
              </div>
            )}

            {is2FAEnabled ? (
              /* 2FA is currently enabled */
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-400">2FA is enabled</span>
                </div>
                <p className="text-xs text-zinc-400">Your account is protected with TOTP two-factor authentication.</p>
                {show2FADisable ? (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-zinc-400">Enter your authenticator code to disable 2FA:</p>
                    <input
                      type="text"
                      value={totpDisableCode}
                      onChange={(e) => setTotpDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-center text-xl tracking-[0.5em] font-mono focus:outline-none focus:border-red-500 transition-colors"
                      placeholder="000000"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!currentUser?.id || totpDisableCode.length !== 6) return;
                          setIs2FALoading(true);
                          setTwoFAMessage(null);
                          const res = await disable2FA(totpDisableCode);
                          if ('success' in res && res.success) {
                            setIs2FAEnabled(false);
                            setShow2FADisable(false);
                            setTotpDisableCode('');
                            setTwoFAMessage({ type: 'success', text: '2FA has been disabled.' });
                          } else {
                            setTwoFAMessage({ type: 'error', text: 'error' in res ? res.error : 'Failed to disable 2FA.' });
                          }
                          setIs2FALoading(false);
                        }}
                        disabled={is2FALoading || totpDisableCode.length !== 6}
                        className="flex-1 bg-red-500/20 text-red-400 font-medium py-2 rounded-xl hover:bg-red-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                      >
                        {is2FALoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                        Disable 2FA
                      </button>
                      <button
                        onClick={() => { setShow2FADisable(false); setTotpDisableCode(''); setTwoFAMessage(null); }}
                        className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShow2FADisable(true)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Disable 2FA
                  </button>
                )}
              </div>
            ) : show2FASetup ? (
              /* 2FA setup flow */
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-4">
                <p className="text-sm text-zinc-300 font-medium">Scan this QR code with your authenticator app:</p>
                {qrCode && (
                  <div className="flex justify-center p-4 bg-white rounded-xl">
                    {/* QR code is a data URI — next/image does not support data: URLs */}
                    <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                  </div>
                )}
                {totpSecret && (
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">Or enter this key manually:</p>
                    <p className="text-xs font-mono bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-300 select-all break-all">{totpSecret}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">Enter the 6-digit code from your authenticator app to verify:</p>
                  <input
                    type="text"
                    value={totpVerifyCode}
                    onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-center text-xl tracking-[0.5em] font-mono focus:outline-none focus:border-brand-gold transition-colors"
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!currentUser?.id || totpVerifyCode.length !== 6) return;
                      setIs2FALoading(true);
                      setTwoFAMessage(null);
                      const res = await verify2FA(totpVerifyCode);
                      if ('success' in res && res.success) {
                        setIs2FAEnabled(true);
                        setShow2FASetup(false);
                        setTotpVerifyCode('');
                        setQrCode('');
                        setTotpSecret('');
                        setTwoFAMessage({ type: 'success', text: '2FA is now enabled! You will need your authenticator app for future logins.' });
                      } else {
                        setTwoFAMessage({ type: 'error', text: 'error' in res ? res.error : 'Verification failed.' });
                      }
                      setIs2FALoading(false);
                    }}
                    disabled={is2FALoading || totpVerifyCode.length !== 6}
                    className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-zinc-950 font-medium py-2 rounded-xl disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {is2FALoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Verify & Enable
                  </button>
                  <button
                    onClick={() => { setShow2FASetup(false); setTotpVerifyCode(''); setQrCode(''); setTotpSecret(''); setTwoFAMessage(null); }}
                    className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* 2FA not enabled — show enable button */
              <button
                onClick={async () => {
                  if (!currentUser?.id) return;
                  setIs2FALoading(true);
                  setTwoFAMessage(null);
                  const res = await setup2FA();
                  if ('success' in res && res.success) {
                    setQrCode(res.qrCode);
                    setTotpSecret(res.secret);
                    setShow2FASetup(true);
                  } else {
                    setTwoFAMessage({ type: 'error', text: 'error' in res ? res.error : 'Failed to start 2FA setup.' });
                  }
                  setIs2FALoading(false);
                }}
                disabled={is2FALoading}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {is2FALoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Enable Two-Factor Authentication
              </button>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

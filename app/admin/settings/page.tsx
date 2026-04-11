'use client';

import { useState, useEffect } from 'react';
import { getAdminSettings, updateAdminSettings, updateFileUploadSettings, updateFirebaseSettings } from '@/app/actions/admin';
import { Save, Shield, FileText, HardDrive, CheckCircle2, AlertCircle, Loader2, Database, Mail } from 'lucide-react';

export default function AdminSettingsPage() {
  const [maxSize, setMaxSize] = useState(10); // MB
  const [formats, setFormats] = useState('*');
  const [firebaseConfig, setFirebaseConfig] = useState('');
  const [isFirebaseEnabled, setIsFirebaseEnabled] = useState(false);
  const [isCaptchaEnabled, setIsCaptchaEnabled] = useState(false);
  const [oauthGoogleEnabled, setOauthGoogleEnabled] = useState(false);
  const [oauthGithubEnabled, setOauthGithubEnabled] = useState(false);
  const [oauthOidcEnabled, setOauthOidcEnabled] = useState(false);
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState('');
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState('');
  const [requireEmailVerification, setRequireEmailVerification] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    async function loadSettings() {
      const result = await getAdminSettings();
      const { settings } = result;
      if (settings) {
        const dynamicSettings = settings as Record<string, unknown>;
        setMaxSize(settings.maxAttachmentSize / (1024 * 1024));
        setFormats(settings.allowedFileFormats);
        setFirebaseConfig(settings.firebaseConfig || '');
        setIsFirebaseEnabled(!!settings.firebaseConfig && settings.firebaseConfig.length > 10);
        setIsCaptchaEnabled(Boolean(settings.isCaptchaEnabled));
        setOauthGoogleEnabled(Boolean(dynamicSettings.oauthGoogleEnabled));
        setOauthGithubEnabled(Boolean(dynamicSettings.oauthGithubEnabled));
        setOauthOidcEnabled(Boolean(dynamicSettings.oauthOidcEnabled));
        setRecaptchaSiteKey(typeof dynamicSettings.recaptchaSiteKey === 'string' ? dynamicSettings.recaptchaSiteKey : '');
        setRecaptchaSecretKey(typeof dynamicSettings.recaptchaSecretKey === 'string' ? dynamicSettings.recaptchaSecretKey : '');
        setRequireEmailVerification(Boolean(dynamicSettings.requireEmailVerification));
      }
      setSmtpConfigured(Boolean((result as Record<string, unknown>).smtpConfigured));
      setIsLoading(false);
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage({ type: '', text: '' });

    const sizeInBytes = Math.round(maxSize * 1024 * 1024);
    const { success, error } = await updateFileUploadSettings(sizeInBytes, formats);
    
    const fbSuccess = await updateFirebaseSettings(isFirebaseEnabled ? firebaseConfig : null);
    const captchaResult = await updateAdminSettings({
      isCaptchaEnabled,
      recaptchaSiteKey: recaptchaSiteKey.trim() || null,
      recaptchaSecretKey: recaptchaSecretKey.trim() || null,
      oauthGoogleEnabled,
      oauthGithubEnabled,
      oauthOidcEnabled,
      requireEmailVerification,
    });

    if (success && !fbSuccess.error && !captchaResult.error) {
      setMessage({ type: 'success', text: 'Settings updated successfully' });
    } else {
      setMessage({ type: 'error', text: error || fbSuccess.error || captchaResult.error || 'Failed to update settings' });
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-brand-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4 border-b border-zinc-800 pb-6">
          <div className="p-3 bg-brand-gold/10 rounded-2xl">
            <Shield className="w-8 h-8 text-brand-gold" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
            <p className="text-zinc-400">Manage system-wide configurations and security limits.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* File Size Limit */}
            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-brand-gold">
                <HardDrive className="w-5 h-5" />
                <h2 className="font-bold">File Upload Limit</h2>
              </div>
              <p className="text-sm text-zinc-400">Set the maximum size allowed for file attachments in chat.</p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={maxSize}
                  onChange={(e) => setMaxSize(Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold transition-colors"
                  min="1"
                  max="1000"
                />
                <span className="text-zinc-500 font-medium">MB</span>
              </div>
            </div>

            {/* Allowed Formats */}
            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-4">
              <div className="flex items-center gap-3 text-brand-gold">
                <FileText className="w-5 h-5" />
                <h2 className="font-bold">Allowed Formats</h2>
              </div>
              <p className="text-sm text-zinc-400">Specify allowed extensions (comma-separated) or use * for all.</p>
              <input
                type="text"
                value={formats}
                onChange={(e) => setFormats(e.target.value)}
                placeholder="e.g. jpg, png, pdf, zip"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold transition-colors"
              />
              <p className="text-[10px] text-zinc-500 italic">Example: jpg, png, pdf, docx, zip</p>
            </div>
          </div>

          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-brand-gold">Google reCAPTCHA (Login & Registration)</h2>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-zinc-400">Enable reCAPTCHA</span>
                <input
                  type="checkbox"
                  checked={isCaptchaEnabled}
                  onChange={(e) => setIsCaptchaEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-800 text-brand-gold focus:ring-brand-gold bg-zinc-950"
                />
              </label>
            </div>
            <p className="text-sm text-zinc-400">
              Configure Google &quot;I&apos;m not a robot&quot; for login and registration. Keep disabled if you do not need it.
            </p>
            <input
              type="text"
              value={recaptchaSiteKey}
              onChange={(e) => setRecaptchaSiteKey(e.target.value)}
              placeholder="reCAPTCHA Site Key"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold transition-colors"
            />
            <input
              type="password"
              value={recaptchaSecretKey}
              onChange={(e) => setRecaptchaSecretKey(e.target.value)}
              placeholder="reCAPTCHA Secret Key"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold transition-colors"
            />
            <p className="text-xs text-zinc-500">
              When enabled, both keys are required and verification is enforced server-side.
            </p>
          </div>

          {/* Email Verification */}
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-brand-gold">
                <Mail className="w-5 h-5" />
                <h2 className="font-bold">Email Verification</h2>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-zinc-400">Require email on registration</span>
                <input
                  type="checkbox"
                  checked={requireEmailVerification}
                  onChange={(e) => setRequireEmailVerification(e.target.checked)}
                  disabled={!smtpConfigured}
                  className="w-4 h-4 rounded border-zinc-800 text-brand-gold focus:ring-brand-gold bg-zinc-950 disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </label>
            </div>
            <p className="text-sm text-zinc-400">
              When enabled, new users must provide an email address and verify it with a 6-digit code before accessing the app.
              The admin account email is pre-verified and not affected by this setting.
            </p>
            {!smtpConfigured && (
              <div className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs p-3 rounded-xl">
                SMTP is not configured. Set <code className="bg-zinc-800 px-1 rounded">SMTP_HOST</code>,{' '}
                <code className="bg-zinc-800 px-1 rounded">SMTP_USER</code>,{' '}
                <code className="bg-zinc-800 px-1 rounded">SMTP_PASS</code>, and{' '}
                <code className="bg-zinc-800 px-1 rounded">SMTP_FROM</code> in your environment to enable email.
              </div>
            )}
            {smtpConfigured && (
              <p className="text-xs text-emerald-400">SMTP is configured and ready to send emails.</p>
            )}
          </div>

          {/* Firebase Configuration */}
          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-brand-gold">
                <Database className="w-5 h-5" />
                <h2 className="font-bold">Firebase Configuration (Optional)</h2>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-zinc-400">Enable Firebase</span>
                <input
                  type="checkbox"
                  checked={isFirebaseEnabled}
                  onChange={(e) => setIsFirebaseEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-800 text-brand-gold focus:ring-brand-gold bg-zinc-950"
                />
              </label>
            </div>
            <p className="text-sm text-zinc-400">
              By default, the app uses an internal database and internal push notifications. Enable Firebase if you want to use Firebase services.
            </p>
            {isFirebaseEnabled && (
              <textarea
                value={firebaseConfig}
                onChange={(e) => setFirebaseConfig(e.target.value)}
                placeholder='{"apiKey": "...", "authDomain": "...", ...}'
                className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-brand-gold transition-colors font-mono text-sm"
              />
            )}
          </div>

          <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-3xl space-y-4">
            <h2 className="font-bold text-brand-gold">OAuth / SSO Providers</h2>
            <p className="text-sm text-zinc-400">Enable provider buttons on login/register. Provider credentials still come from environment variables.</p>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>Google OAuth</span>
              <input type="checkbox" checked={oauthGoogleEnabled} onChange={(e) => setOauthGoogleEnabled(e.target.checked)} className="w-4 h-4 rounded border-zinc-800 text-brand-gold focus:ring-brand-gold bg-zinc-950" />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>GitHub OAuth</span>
              <input type="checkbox" checked={oauthGithubEnabled} onChange={(e) => setOauthGithubEnabled(e.target.checked)} className="w-4 h-4 rounded border-zinc-800 text-brand-gold focus:ring-brand-gold bg-zinc-950" />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>OIDC SSO</span>
              <input type="checkbox" checked={oauthOidcEnabled} onChange={(e) => setOauthOidcEnabled(e.target.checked)} className="w-4 h-4 rounded border-zinc-800 text-brand-gold focus:ring-brand-gold bg-zinc-950" />
            </label>
          </div>

          {message.text && (
            <div className={`p-4 rounded-2xl flex items-center gap-3 ${
              message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-8 py-4 bg-brand-gold hover:bg-brand-gold/90 text-zinc-950 font-bold rounded-2xl transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Changes
            </button>
          </div>
        </form>

        <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-3xl">
          <h3 className="text-sm font-bold text-zinc-300 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-zinc-500" />
            Security Note
          </h3>
          <p className="text-xs text-zinc-500 leading-relaxed">
            All uploaded files are stored in an encrypted state if the client-side encryption is active. 
            Restricting file formats helps prevent the distribution of potentially harmful executables, 
            but remember that Elahe Messenger does not scan file contents due to privacy-first architecture.
          </p>
        </div>
      </div>
    </div>
  );
}

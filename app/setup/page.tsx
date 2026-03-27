'use client';

import { useState } from 'react';
import { Shield, CheckCircle } from 'lucide-react';

export default function SetupWizard() {
  const [step, setStep] = useState(1);
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [firebaseConfig, setFirebaseConfig] = useState('');
  const [rules, setRules] = useState('');

  const handleNext = () => setStep((s) => s + 1);

  const handleFinish = async () => {
    // In a real app, this would send the setup data to the backend
    // to create the admin user and save the settings.
    window.location.href = '/admin';
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        
        <div className="flex items-center justify-between mb-8 border-b border-zinc-800 pb-4">
          <h2 className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
            <Shield className="w-6 h-6" /> KiNGChat Setup Wizard
          </h2>
          <div className="text-sm text-zinc-500">Step {step} of 3</div>
        </div>

        {step === 1 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h3 className="text-lg font-medium text-zinc-50 mb-2">1. Create Admin Account</h3>
              <p className="text-sm text-zinc-400 mb-4">
                This account will have full access to the administration panel, user management, and system settings.
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Admin Username</label>
                <input
                  type="text"
                  value={adminUser}
                  onChange={(e) => setAdminUser(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="admin"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Admin Password</label>
                <input
                  type="password"
                  value={adminPass}
                  onChange={(e) => setAdminPass(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 focus:outline-none focus:border-emerald-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>
            
            <div className="flex justify-end pt-4">
              <button
                onClick={handleNext}
                className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold px-6 py-2 rounded-xl transition-colors"
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h3 className="text-lg font-medium text-zinc-50 mb-2">2. Firebase Configuration (Optional)</h3>
              <p className="text-sm text-zinc-400 mb-4">
                Paste your Firebase JSON configuration here to enable push notifications. Leave blank if you don&apos;t want to use foreign services.
              </p>
            </div>
            
            <textarea
              value={firebaseConfig}
              onChange={(e) => setFirebaseConfig(e.target.value)}
              rows={8}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 font-mono text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder='{
  "apiKey": "...",
  "authDomain": "...",
  "projectId": "...",
  "storageBucket": "...",
  "messagingSenderId": "...",
  "appId": "..."
}'
            />
            
            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep(1)}
                className="text-zinc-400 hover:text-zinc-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleNext}
                className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold px-6 py-2 rounded-xl transition-colors"
              >
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h3 className="text-lg font-medium text-zinc-50 mb-2">3. Server Rules & TOS</h3>
              <p className="text-sm text-zinc-400 mb-4">
                Define the rules and Terms of Service for your server. Users must agree to these upon registration.
              </p>
            </div>
            
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={8}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-50 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="1. Be respectful.
2. No illegal content.
3. ..."
            />
            
            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep(2)}
                className="text-zinc-400 hover:text-zinc-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleFinish}
                className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold px-6 py-2 rounded-xl transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Complete Setup
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

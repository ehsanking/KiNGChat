'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Camera, Save, User } from 'lucide-react';

export default function UserProfile() {
  const [displayName, setDisplayName] = useState('Ehsan KiNG');
  const [bio, setBio] = useState('Privacy advocate and developer.');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call to save profile
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    // In a real app, show a success toast here
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800 flex items-center px-4 md:px-8 bg-zinc-900/50 sticky top-0 z-10">
        <Link href="/chat" className="p-2 -ml-2 mr-4 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <div className="w-6 h-6 relative">
            <Image src="/logo.png" alt="Logo" fill className="object-contain" />
          </div>
          Profile Settings
        </h1>
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
            <div className="text-center">
              <h2 className="text-xl font-bold text-zinc-50">{displayName || 'Anonymous User'}</h2>
              <p className="text-sm text-zinc-400 font-mono mt-1">@ehsanking</p>
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

        </div>
      </main>
    </div>
  );
}

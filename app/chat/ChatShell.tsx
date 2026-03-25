'use client';

import Link from 'next/link';
import { Check, Copy, MessageSquare, Plus, Settings, Shield, User, UserPlus, Users, X } from 'lucide-react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import type { AdminSettings, AuditLog, ChatUser, Report } from '@/lib/types';
import AdminDrawer from './AdminDrawer';
import ContactSidebar from './ContactSidebar';
import ConversationPanel from './ConversationPanel';
import type { AdminOverview, ChatMessage, Community, ContactUser, MobileTab } from './chat-types';
import { BrandLogo, CommunityAvatar, UserAvatar, UserNameRow } from './chat-ui';

export default function ChatShell({
  currentUser,
  activeView,
  setActiveView,
  sidebarTab,
  setSidebarTab,
  adminTab,
  setAdminTab,
  adminUsers,
  adminReports,
  adminSettings,
  adminAuditLogs,
  adminOverview,
  isLoadingAdmin,
  searchQuery,
  setSearchQuery,
  searchResults,
  isSearching,
  contacts,
  communities,
  selectedRecipient,
  selectedGroup,
  copied,
  isProfileModalOpen,
  setIsProfileModalOpen,
  recipientProfile,
  showCreateGroup,
  setShowCreateGroup,
  newGroupName,
  setNewGroupName,
  newGroupType,
  setNewGroupType,
  newGroupDesc,
  setNewGroupDesc,
  mobileTab,
  setMobileTab,
  mobileShowChat,
  setMobileShowChat,
  sessionKey,
  isOtherUserTyping,
  loadingMessages,
  messages,
  scrollRef,
  fileInputRef,
  input,
  isUploading,
  onAddContact,
  onSelectContact,
  onSelectGroup,
  onCreateGroup,
  onOpenRecipientProfile,
  onInputChange,
  onSubmit,
  onFileUpload,
  onCopyId,
  onLogout,
  onToggleBan,
  onUpdateUserBadges,
  onSettingsChange,
  onSaveSettings,
}: {
  currentUser: ChatUser;
  activeView: 'chat' | 'admin';
  setActiveView: (view: 'chat' | 'admin') => void;
  sidebarTab: 'contacts' | 'groups';
  setSidebarTab: (tab: 'contacts' | 'groups') => void;
  adminTab: 'overview' | 'users' | 'reports' | 'settings' | 'data' | 'audit';
  setAdminTab: (tab: 'overview' | 'users' | 'reports' | 'settings' | 'data' | 'audit') => void;
  adminUsers: ChatUser[];
  adminReports: Report[];
  adminSettings: AdminSettings | null;
  adminAuditLogs: AuditLog[];
  adminOverview: AdminOverview | null;
  isLoadingAdmin: boolean;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchResults: ChatUser[];
  isSearching: boolean;
  contacts: ContactUser[];
  communities: Community[];
  selectedRecipient: ContactUser | null;
  selectedGroup: Community | null;
  copied: boolean;
  isProfileModalOpen: boolean;
  setIsProfileModalOpen: (open: boolean) => void;
  recipientProfile: ChatUser | null;
  showCreateGroup: boolean;
  setShowCreateGroup: (open: boolean) => void;
  newGroupName: string;
  setNewGroupName: (value: string) => void;
  newGroupType: 'GROUP' | 'CHANNEL';
  setNewGroupType: (value: 'GROUP' | 'CHANNEL') => void;
  newGroupDesc: string;
  setNewGroupDesc: (value: string) => void;
  mobileTab: MobileTab;
  setMobileTab: (value: MobileTab) => void;
  mobileShowChat: boolean;
  setMobileShowChat: (value: boolean) => void;
  sessionKey: CryptoKey | null;
  isOtherUserTyping: boolean;
  loadingMessages: boolean;
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  input: string;
  isUploading: boolean;
  onAddContact: (user: ChatUser) => void;
  onSelectContact: (contact: ContactUser) => void;
  onSelectGroup: (community: Community) => void;
  onCreateGroup: () => void;
  onOpenRecipientProfile: () => void;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onCopyId: (text: string) => void;
  onLogout: () => void;
  onToggleBan: (userId: string) => void;
  onUpdateUserBadges: (userId: string, badge: string | null, isVerified: boolean) => void;
  onSettingsChange: (next: AdminSettings) => void;
  onSaveSettings: () => void;
}) {
  const groups = communities.filter((community) => community.type === 'GROUP');
  const channels = communities.filter((community) => community.type === 'CHANNEL');

  const mobileSelectContact = (contact: ContactUser) => {
    onSelectContact(contact);
    setMobileShowChat(true);
  };

  const mobileSelectGroup = (community: Community) => {
    onSelectGroup(community);
    setMobileShowChat(true);
  };

  return (
    <div className="telegram-shell flex h-[100dvh] text-zinc-50 font-sans">
      <ContactSidebar
        currentUser={currentUser}
        activeView={activeView}
        sidebarTab={sidebarTab}
        setSidebarTab={setSidebarTab}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSearching={isSearching}
        searchResults={searchResults}
        contacts={contacts}
        communities={communities}
        selectedRecipientId={selectedRecipient?.id}
        selectedGroupId={selectedGroup?.id}
        copied={copied}
        onAddContact={onAddContact}
        onSelectContact={onSelectContact}
        onSelectGroup={onSelectGroup}
        onCreateCommunity={() => setShowCreateGroup(true)}
        onToggleAdminView={() => setActiveView(activeView === 'admin' ? 'chat' : 'admin')}
        onLogout={onLogout}
        onCopyId={onCopyId}
      />

      <div className="telegram-main hidden md:flex flex-1 flex-col">
        {activeView === 'admin' ? (
          <AdminDrawer
            adminTab={adminTab}
            setAdminTab={setAdminTab}
            isLoadingAdmin={isLoadingAdmin}
            adminOverview={adminOverview}
            adminUsers={adminUsers}
            adminReports={adminReports}
            adminSettings={adminSettings}
            adminAuditLogs={adminAuditLogs}
            onBack={() => setActiveView('chat')}
            onToggleBan={onToggleBan}
            onUpdateUserBadges={onUpdateUserBadges}
            onSettingsChange={onSettingsChange}
            onSaveSettings={onSaveSettings}
          />
        ) : (
          <ConversationPanel
            selectedRecipient={selectedRecipient}
            selectedGroup={selectedGroup}
            sessionKey={sessionKey}
            isOtherUserTyping={isOtherUserTyping}
            loadingMessages={loadingMessages}
            messages={messages}
            scrollRef={scrollRef}
            fileInputRef={fileInputRef}
            input={input}
            isUploading={isUploading}
            onMobileBack={() => undefined}
            onOpenRecipientProfile={onOpenRecipientProfile}
            onInputChange={onInputChange}
            onSubmit={onSubmit}
            onFileUpload={onFileUpload}
          />
        )}
      </div>

      <div className="telegram-main flex md:hidden flex-1 flex-col">
        {activeView === 'admin' ? (
          <AdminDrawer
            adminTab={adminTab}
            setAdminTab={setAdminTab}
            isLoadingAdmin={isLoadingAdmin}
            adminOverview={adminOverview}
            adminUsers={adminUsers}
            adminReports={adminReports}
            adminSettings={adminSettings}
            adminAuditLogs={adminAuditLogs}
            onBack={() => setActiveView('chat')}
            onToggleBan={onToggleBan}
            onUpdateUserBadges={onUpdateUserBadges}
            onSettingsChange={onSettingsChange}
            onSaveSettings={onSaveSettings}
          />
        ) : mobileShowChat && (selectedRecipient || selectedGroup) ? (
          <ConversationPanel
            selectedRecipient={selectedRecipient}
            selectedGroup={selectedGroup}
            sessionKey={sessionKey}
            isOtherUserTyping={isOtherUserTyping}
            loadingMessages={loadingMessages}
            messages={messages}
            scrollRef={scrollRef}
            fileInputRef={fileInputRef}
            input={input}
            isUploading={isUploading}
            onMobileBack={() => setMobileShowChat(false)}
            onOpenRecipientProfile={onOpenRecipientProfile}
            onInputChange={onInputChange}
            onSubmit={onSubmit}
            onFileUpload={onFileUpload}
          />
        ) : (
          <div className="flex flex-col h-full">
            <div className="telegram-panel p-3 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-lg font-bold text-brand-gold flex items-center gap-2"><BrandLogo size={20} />KiNGChat</h2>
              {mobileTab !== 'settings' && (
                <button onClick={() => setShowCreateGroup(true)} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400" title="Create Group/Channel">
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>

            {mobileTab !== 'settings' && (
              <div className="p-3 border-b border-white/10">
                <div className="relative">
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search username or ID..." className="w-full bg-zinc-900/80 border border-white/10 rounded-xl py-2 pl-4 pr-4 text-sm focus:outline-none focus:border-brand-gold transition-colors" />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {mobileTab === 'chats' ? (
                contacts.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500"><UserPlus className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-xs">Search for users to add contacts</p></div>
                ) : (
                  contacts.map((contact) => (
                    <div key={contact.id} onClick={() => mobileSelectContact(contact)} className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-white/5 ${selectedRecipient?.id === contact.id ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/30'}`}>
                      <UserAvatar user={contact} size={40} fallbackIcon={<User className="w-5 h-5 text-zinc-400" />} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{contact.displayName || contact.username}</p>
                        <p className="text-[10px] text-zinc-500">ID: {contact.numericId}</p>
                      </div>
                    </div>
                  ))
                )
              ) : mobileTab === 'groups' ? (
                groups.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500"><Users className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-xs">No groups yet</p></div>
                ) : (
                  groups.map((community) => (
                    <div key={community.id} onClick={() => mobileSelectGroup(community)} className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-white/5 ${selectedGroup?.id === community.id ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/30'}`}>
                      <CommunityAvatar community={community} size={40} />
                      <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{community.name}</p><p className="text-[10px] text-zinc-500">{community.memberCount} members</p></div>
                    </div>
                  ))
                )
              ) : mobileTab === 'channels' ? (
                channels.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500"><Shield className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-xs">No channels yet</p></div>
                ) : (
                  channels.map((community) => (
                    <div key={community.id} onClick={() => mobileSelectGroup(community)} className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-white/5 ${selectedGroup?.id === community.id ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/30'}`}>
                      <CommunityAvatar community={community} size={40} />
                      <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{community.name}</p><p className="text-[10px] text-zinc-500">{community.memberCount} subscribers</p></div>
                    </div>
                  ))
                )
              ) : (
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/70 border border-white/10">
                    <UserAvatar user={currentUser} size={56} fallbackIcon={<User className="w-6 h-6 text-emerald-500" />} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate"><UserNameRow user={currentUser} /></div>
                      <p className="text-xs text-zinc-500">@{currentUser.username}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-zinc-500">ID: {currentUser.numericId}</p>
                        <button onClick={() => onCopyId(currentUser.numericId)} className="p-0.5 hover:bg-zinc-800 rounded transition-colors" title="Copy ID">
                          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-zinc-500" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <Link href="/chat/profile" className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center"><User className="w-5 h-5 text-blue-400" /></div>
                    <div><p className="text-sm font-medium">Profile & Account</p><p className="text-[10px] text-zinc-500">Edit profile, 2FA, security settings</p></div>
                  </Link>
                  {currentUser.role === 'ADMIN' && (
                    <button onClick={() => setActiveView('admin')} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/50 transition-colors text-left">
                      <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center"><Shield className="w-5 h-5 text-brand-gold" /></div>
                      <div><p className="text-sm font-medium">Admin Panel</p><p className="text-[10px] text-zinc-500">Manage users, settings, reports</p></div>
                    </button>
                  )}
                  <button onClick={onLogout} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/50 transition-colors text-left">
                    <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center"><Settings className="w-5 h-5 text-red-400" /></div>
                    <div><p className="text-sm font-medium text-red-400">Log Out</p><p className="text-[10px] text-zinc-500">Sign out of your account</p></div>
                  </button>
                </div>
              )}
            </div>

            <nav className="telegram-panel border-t border-white/10 flex safe-area-pb">
              {([
                { key: 'chats' as MobileTab, icon: MessageSquare, label: 'Chats' },
                { key: 'groups' as MobileTab, icon: Users, label: 'Groups' },
                { key: 'channels' as MobileTab, icon: Shield, label: 'Channels' },
                { key: 'settings' as MobileTab, icon: Settings, label: 'Settings' },
              ]).map(({ key, icon: Icon, label }) => (
                <button key={key} onClick={() => { setMobileTab(key); setSearchQuery(''); }} className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${mobileTab === key ? 'text-brand-gold' : 'text-zinc-500'}`}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>

      {showCreateGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowCreateGroup(false)}>
          <div className="telegram-panel w-full md:max-w-md border-t md:border border-white/10 rounded-t-2xl md:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="telegram-panel p-4 border-b border-white/10 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-300">Create New</p>
              <button onClick={() => setShowCreateGroup(false)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 md:p-6 space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setNewGroupType('GROUP')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${newGroupType === 'GROUP' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'}`}>Group</button>
                <button onClick={() => setNewGroupType('CHANNEL')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${newGroupType === 'CHANNEL' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-zinc-800 text-zinc-400'}`}>Channel</button>
              </div>
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder={`${newGroupType === 'CHANNEL' ? 'Channel' : 'Group'} name`} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-gold transition-colors" />
              <textarea value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} placeholder="Description (optional)" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-gold transition-colors h-20 resize-none" />
              <button onClick={onCreateGroup} disabled={!newGroupName.trim()} className="w-full bg-brand-gold text-zinc-950 py-2.5 rounded-xl font-bold hover:bg-brand-gold/90 disabled:opacity-50 transition-colors">Create {newGroupType === 'CHANNEL' ? 'Channel' : 'Group'}</button>
            </div>
            <div className="h-safe-area-b md:h-0" />
          </div>
        </div>
      )}

      {isProfileModalOpen && recipientProfile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setIsProfileModalOpen(false)}>
          <div className="telegram-panel w-full md:max-w-sm border-t md:border border-white/10 rounded-t-2xl md:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="telegram-panel p-4 border-b border-white/10 flex items-center justify-between">
              <p className="text-sm text-zinc-300">User Profile</p>
              <button onClick={() => setIsProfileModalOpen(false)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 flex flex-col items-center text-center gap-3">
              <UserAvatar user={recipientProfile} size={96} fallbackIcon={<User className="w-8 h-8 text-zinc-500" />} />
              <div className="text-lg font-semibold truncate"><UserNameRow user={recipientProfile} /></div>
              <p className="text-xs text-zinc-500">@{recipientProfile.username}</p>
              <p className="text-sm text-zinc-300 min-h-10">{recipientProfile.bio?.trim() || 'No bio yet.'}</p>
            </div>
            <div className="h-safe-area-b md:h-0" />
          </div>
        </div>
      )}
    </div>
  );
}

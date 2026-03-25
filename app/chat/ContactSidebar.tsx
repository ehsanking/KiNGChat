'use client';

import Link from 'next/link';
import { Check, Copy, Loader2, LogOut, MessageSquare, Plus, Search, Settings, Shield, User, UserPlus, Users } from 'lucide-react';
import type { ChatUser } from '@/lib/types';
import type { Community, ContactUser } from './chat-types';
import { BrandLogo, CommunityAvatar, UserAvatar, UserNameRow } from './chat-ui';

export default function ContactSidebar({
  currentUser,
  activeView,
  sidebarTab,
  setSidebarTab,
  searchQuery,
  setSearchQuery,
  isSearching,
  searchResults,
  contacts,
  communities,
  selectedRecipientId,
  selectedGroupId,
  copied,
  onAddContact,
  onSelectContact,
  onSelectGroup,
  onCreateCommunity,
  onToggleAdminView,
  onLogout,
  onCopyId,
}: {
  currentUser: ChatUser;
  activeView: 'chat' | 'admin';
  sidebarTab: 'contacts' | 'groups';
  setSidebarTab: (tab: 'contacts' | 'groups') => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  isSearching: boolean;
  searchResults: ChatUser[];
  contacts: ContactUser[];
  communities: Community[];
  selectedRecipientId?: string;
  selectedGroupId?: string;
  copied: boolean;
  onAddContact: (user: ChatUser) => void;
  onSelectContact: (contact: ContactUser) => void;
  onSelectGroup: (community: Community) => void;
  onCreateCommunity: () => void;
  onToggleAdminView: () => void;
  onLogout: () => void;
  onCopyId: (text: string) => void;
}) {
  return (
    <div className="telegram-sidebar hidden md:flex w-80 border-r border-white/10 flex-col">
      <div className="telegram-panel p-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-xl font-bold text-brand-gold flex items-center gap-2">
          <BrandLogo size={24} />
          KiNGChat
        </h2>
        <div className="flex items-center gap-1">
          {currentUser.role === 'ADMIN' && (
            <button onClick={onToggleAdminView} className={`p-2 rounded-lg transition-colors ${activeView === 'admin' ? 'bg-brand-gold text-zinc-950' : 'hover:bg-zinc-800 text-zinc-400'}`} title="Admin Panel">
              <Shield className="w-5 h-5" />
            </button>
          )}
          <Link href="/chat/profile" className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"><Settings className="w-5 h-5 text-zinc-400" /></Link>
          <button onClick={onLogout} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-red-400"><LogOut className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="flex border-b border-white/10">
        <button onClick={() => setSidebarTab('contacts')} className={`flex-1 py-2.5 text-xs font-medium transition-colors ${sidebarTab === 'contacts' ? 'text-brand-gold border-b-2 border-brand-gold' : 'text-zinc-500'}`}>
          <div className="flex items-center justify-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" />Contacts</div>
        </button>
        <button onClick={() => setSidebarTab('groups')} className={`flex-1 py-2.5 text-xs font-medium transition-colors ${sidebarTab === 'groups' ? 'text-brand-gold border-b-2 border-brand-gold' : 'text-zinc-500'}`}>
          <div className="flex items-center justify-center gap-1.5"><Users className="w-3.5 h-3.5" />Groups & Channels</div>
        </button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search username or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/80 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-gold transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {searchQuery ? (
          isSearching ? (
            <div className="p-4 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-500" /></div>
          ) : searchResults.length === 0 ? (
            <div className="p-4 text-center text-xs text-zinc-500">No users found</div>
          ) : (
            searchResults.map((user) => (
              <div key={user.id} className="p-3 flex items-center gap-3 hover:bg-zinc-800/40 cursor-pointer transition-colors border-b border-white/5">
                <UserAvatar user={user} size={40} fallbackIcon={<User className="w-5 h-5 text-zinc-400" />} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{user.displayName || user.username}</p>
                  <p className="text-[10px] text-zinc-500">@{user.username}</p>
                </div>
                <button onClick={() => onAddContact(user)} className="p-1.5 bg-brand-gold/10 text-brand-gold rounded-lg hover:bg-brand-gold/20 transition-colors shrink-0" title="Add to contacts">
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            ))
          )
        ) : sidebarTab === 'contacts' ? (
          contacts.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Search for users to add contacts</p>
            </div>
          ) : (
            contacts.map((contact) => (
              <div key={contact.id} onClick={() => onSelectContact(contact)} className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-white/5 ${selectedRecipientId === contact.id ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/30'}`}>
                <UserAvatar user={contact} size={40} fallbackIcon={<User className="w-5 h-5 text-zinc-400" />} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1"><p className="font-medium text-sm truncate">{contact.displayName || contact.username}</p></div>
                  <p className="text-[10px] text-zinc-500">ID: {contact.numericId}</p>
                </div>
              </div>
            ))
          )
        ) : (
          <>
            <div className="p-3">
              <button onClick={onCreateCommunity} className="w-full py-2 bg-brand-gold/10 text-brand-gold rounded-xl text-xs font-medium hover:bg-brand-gold/20 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Create Group or Channel
              </button>
            </div>
            {communities.length === 0 ? (
              <div className="p-8 text-center text-zinc-500"><Users className="w-8 h-8 mx-auto opacity-30" /><p className="text-xs mt-2">No groups or channels yet</p></div>
            ) : communities.map((community) => (
              <div key={community.id} onClick={() => onSelectGroup(community)} className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-white/5 ${selectedGroupId === community.id ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/30'}`}>
                <CommunityAvatar community={community} size={40} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{community.name}</p>
                  <p className="text-[10px] text-zinc-500">{community.memberCount} members</p>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="telegram-panel p-3 border-t border-white/10">
        <div className="flex items-center gap-3">
          <UserAvatar user={currentUser} size={32} fallbackIcon={<User className="w-4 h-4 text-emerald-500" />} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate"><UserNameRow user={currentUser} /></div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-zinc-500">ID: {currentUser.numericId}</p>
              <button onClick={() => onCopyId(currentUser.numericId)} className="p-0.5 hover:bg-zinc-800 rounded transition-colors" title="Copy ID">
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-zinc-500" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

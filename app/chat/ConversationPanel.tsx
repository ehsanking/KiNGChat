'use client';

import { BadgeCheck, ChevronLeft, Lock, Megaphone, User, Users } from 'lucide-react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import type { ChatUser } from '@/lib/types';
import MessageComposer from './MessageComposer';
import RealtimeMessageList from './RealtimeMessageList';
import type { ChatMessage, Community, ContactUser } from './chat-types';
import { CommunityAvatar, UserAvatar, getUserDisplayName, renderBadgeIcon } from './chat-ui';

export default function ConversationPanel({
  selectedRecipient,
  selectedGroup,
  sessionKey,
  isOtherUserTyping,
  loadingMessages,
  messages,
  scrollRef,
  fileInputRef,
  input,
  isUploading,
  onMobileBack,
  onOpenRecipientProfile,
  onInputChange,
  onSubmit,
  onFileUpload,
}: {
  selectedRecipient: ContactUser | null;
  selectedGroup: Community | null;
  sessionKey: CryptoKey | null;
  isOtherUserTyping: boolean;
  loadingMessages: boolean;
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  input: string;
  isUploading: boolean;
  onMobileBack: () => void;
  onOpenRecipientProfile: () => void;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const chatTarget = selectedRecipient || selectedGroup;

  if (!chatTarget) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center text-center p-8 space-y-6">
        <div className="w-24 h-24 relative opacity-20">
          <Users className="w-24 h-24 text-brand-blue/50" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-zinc-300">Welcome to KiNGChat</h2>
          <p className="text-zinc-500 max-w-sm">Search for a user to add to your contacts, or create a group/channel to start a conversation.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Lock className="w-4 h-4" />
            <span>E2E Encrypted</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <BadgeCheck className="w-4 h-4" />
            <span>Telegram-inspired UI</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="telegram-panel p-3 md:p-4 border-b border-white/10 flex items-center gap-3">
        <button
          onClick={onMobileBack}
          className="md:hidden p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {selectedRecipient ? (
          <UserAvatar user={selectedRecipient} size={40} fallbackIcon={<User className="w-5 h-5 text-zinc-400" />} />
        ) : selectedGroup ? (
          <CommunityAvatar community={selectedGroup} size={40} />
        ) : null}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            {selectedRecipient ? (
              <button onClick={onOpenRecipientProfile} className="font-medium hover:text-brand-gold transition-colors truncate">
                {getUserDisplayName(selectedRecipient as ChatUser)}
              </button>
            ) : (
              <p className="font-medium truncate">{selectedGroup?.name}</p>
            )}
            {selectedRecipient?.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />}
            {renderBadgeIcon(selectedRecipient?.badge)}
          </div>
          <div className="flex items-center gap-2">
            {isOtherUserTyping ? (
              <p className="text-xs text-brand-gold">Typing...</p>
            ) : sessionKey ? (
              <p className="text-xs text-emerald-500 flex items-center gap-1">
                <Lock className="w-3 h-3" /> E2E Encrypted
              </p>
            ) : selectedGroup ? (
              <p className="text-xs text-zinc-500">{selectedGroup.memberCount} members</p>
            ) : (
              <p className="text-xs text-zinc-500">{selectedRecipient ? `ID: ${selectedRecipient.numericId}` : ''}</p>
            )}
          </div>
        </div>
      </div>

      <RealtimeMessageList
        loadingMessages={loadingMessages}
        messages={messages}
        isOtherUserTyping={isOtherUserTyping}
        scrollRef={scrollRef}
      />

      <MessageComposer
        input={input}
        sessionKey={sessionKey}
        isUploading={isUploading}
        fileInputRef={fileInputRef}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        onFileUpload={onFileUpload}
      />
    </>
  );
}

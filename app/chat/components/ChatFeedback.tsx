import { Lock, Shield } from 'lucide-react';

type DraftState = 'saved' | 'saving' | 'error' | 'idle';

export function ConversationSecurityBanner({
  isDirect,
  hasSessionKey,
  memberCount,
}: {
  isDirect: boolean;
  hasSessionKey: boolean;
  memberCount?: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-zinc-200 font-medium">Chat protection</p>
          <p className="mt-1">
            {isDirect
              ? (hasSessionKey
                ? 'This direct chat is protected end-to-end on both devices.'
                : 'This is a direct chat, but protection setup is not complete yet. Wait a moment or re-open this chat.')
              : `Members-only access is enforced for this conversation (${memberCount ?? 0} members). Group/channel protection is not the same as direct-chat E2EE yet.`}
          </p>
        </div>
        <div className={`rounded-full px-2 py-1 text-[10px] border ${isDirect && hasSessionKey ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10'}`}>
          {isDirect ? (hasSessionKey ? 'Direct chat protected' : 'Protection not ready') : 'Members only'}
        </div>
      </div>
    </div>
  );
}

export function DraftAndConnectionStatus({
  isOnline,
  draftState,
}: {
  isOnline: boolean;
  draftState: DraftState;
}) {
  return (
    <div className="mb-2 flex items-center justify-between text-[11px] text-zinc-500">
      <span>{isOnline ? 'Connected. New messages send right away.' : 'Offline. New messages are stored locally and sent when you reconnect.'}</span>
      <span>
        {draftState === 'saving' ? 'Saving draft…' : draftState === 'saved' ? 'Draft saved' : draftState === 'error' ? 'Could not save draft' : ''}
      </span>
    </div>
  );
}

export function ChatEmptyState({ hasDirectSecurity }: { hasDirectSecurity: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-45">
      <Shield className="w-12 h-12" />
      <p className="text-sm max-w-xs">
        {hasDirectSecurity
          ? 'No messages yet. Say hi to start this protected chat.'
          : 'No messages yet. Start chatting when everyone is ready.'}
      </p>
    </div>
  );
}

export function ConversationStatus({
  isOnline,
  isTyping,
  hasSessionKey,
  recipientNumericId,
  memberCount,
  isGroup,
}: {
  isOnline: boolean;
  isTyping: boolean;
  hasSessionKey: boolean;
  recipientNumericId?: string;
  memberCount?: number;
  isGroup: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {isTyping ? (
        <p className="text-xs text-brand-gold">Typing…</p>
      ) : hasSessionKey ? (
        <p className="text-xs text-emerald-500 flex items-center gap-1">
          <Lock className="w-3 h-3" /> Direct chat protected
        </p>
      ) : isGroup ? (
        <p className="text-xs text-zinc-500">{memberCount} members</p>
      ) : (
        <p className="text-xs text-zinc-500">ID: {recipientNumericId}</p>
      )}
      <p className={`text-[10px] rounded-full px-2 py-0.5 border ${isOnline ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10'}`}>
        {isOnline ? 'Connected' : 'Offline queue active'}
      </p>
    </div>
  );
}

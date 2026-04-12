'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import Link from 'next/link';
import Image from 'next/image';
import {
  Send, Search, User, Settings, Shield, LogOut, Paperclip, File as FileIcon,
  Download, Loader2, Copy, Check, BadgeCheck, Wrench, Megaphone,
  ShoppingBag, Headset, X, Plus, Users, UserPlus, MessageSquare,
  ChevronLeft, Lock,
  ShieldAlert, ShieldOff, Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Forward, Reply, XCircle,
} from 'lucide-react';
import { getTextDirection } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
// Import session‑independent actions (search, public key lookup) from the new auth‑session module.
import { searchUsers, getRecipientE2eeStatus, getUserPublicKeys } from '@/app/actions/index';
// Import profile actions that infer the user from the session.
import {
  getPublicUserProfile,
} from '@/app/actions/profile.actions';
// Import contacts actions that derive the caller from the session.
import { getContacts, addContact } from '@/app/actions/contacts.actions';
// Import community and message actions that derive the caller from the session.
import {
  getUserCommunities,
  createCommunity,
  getMessageHistory,
} from '@/app/actions/groups.actions';
// Import admin actions which automatically enforce the admin session.  These
// functions should be called without passing a userId.
import {
  getAllUsers,
  toggleBanUser,
  updateUserBadges,
  getAdminSettings,
  updateAdminSettings,
  getAuditLogs,
  exportSystemData,
  getAllReports,
  resolveReport,
  getSystemOverview,
} from '@/app/actions/admin';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import {
  encryptMessage, decryptMessage, getOrCreateSessionKey, getIdentityPrivateKey,
} from '@/lib/crypto';
import { parseSecureAttachmentFromLegacyMessage } from '@/lib/e2ee-legacy-bridge';
import { createSecureAttachmentMessage } from '@/lib/e2ee-chat-runtime';
import { E2EE_UNAVAILABLE_WARNING, prepareDirectMessagePayload } from '@/app/chat/message-send-security';
import { fetchWithCsrf, HttpAuthError } from '@/lib/http/fetchWithCsrf';
import { detectKeyChange } from '@/lib/e2ee-key-change-detector';
import { isContactVerified } from '@/lib/e2ee-verification-store';
import {
  buildConversationId,
  buildDraftStorageKey,
  buildPendingQueueStorageKey,
  renderDeliveryLabel,
  type PendingQueueItem,
} from '@/app/chat/chat-state';
import { usePendingQueue } from '@/app/chat/hooks/usePendingQueue';
import { ChatEmptyState, ConversationSecurityBanner, ConversationStatus, DraftAndConnectionStatus } from '@/app/chat/components/ChatFeedback';
import ThemeToggleButton from '@/components/ThemeToggleButton';
import LanguageSelector from '@/components/LanguageSelector';
import { CallStateMachine, type CallType } from '@/lib/webrtc/call-state';
import { getCallMediaStream, stopMediaStream } from '@/lib/webrtc/media-manager';
import { PeerConnectionManager } from '@/lib/webrtc/peer-connection';

// Import shared type definitions to replace use of `any`.
import type { ChatUser, Report, AdminSettings, AuditLog, SocketMessagePayload, DeliveryState } from '@/lib/types';

interface ChatMessage {
  id: string;
  text: string;
  sender: 'me' | 'them';
  senderId?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  type?: number;
  createdAt?: string;
  encrypted?: boolean;
  status?: DeliveryState;
  tempId?: string;
  error?: string;
  replyToId?: string | null;
  forwardedFrom?: string | null;
}

interface ContactUser {
  id: string;
  username: string;
  numericId: string;
  displayName?: string | null;
  bio?: string | null;
  profilePhoto?: string | null;
  role: string;
  badge?: string | null;
  isVerified: boolean;
  identityKeyPublic?: string | null;
  signedPreKey?: string | null;
  signedPreKeySig?: string | null;
}

interface Community {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  type: string;
  isPublic: boolean;
  inviteLink?: string | null;
  e2eeEnabled?: boolean;
  memberCount: number;
  myRole: string;
}

// Mobile bottom nav tab type
type MobileTab = 'chats' | 'groups' | 'channels' | 'settings';


type DraftState = 'saved' | 'saving' | 'error' | 'idle';

const adminSettingToggles: Array<{ label: string; key: keyof Pick<AdminSettings, 'isRegistrationEnabled'>; desc: string }> = [
  { label: 'User Registration', key: 'isRegistrationEnabled', desc: 'Allow new users' },
];

const isDataUri = (value: string) => value.startsWith('data:');

function ChatDashboardContent() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [currentUser, setCurrentUser] = useState<ChatUser | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<ContactUser | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Community | null>(null);
  const [activeView, setActiveView] = useState<'chat' | 'admin'>('chat');
  const [sidebarTab, setSidebarTab] = useState<'contacts' | 'groups'>('contacts');
  const [adminTab, setAdminTab] = useState<'overview' | 'users' | 'reports' | 'settings' | 'data' | 'audit'>('overview');
  const [adminUsers, setAdminUsers] = useState<ChatUser[]>([]);
  const [adminReports, setAdminReports] = useState<Report[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AuditLog[]>([]);
  const [adminOverview, setAdminOverview] = useState<any>(null);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [recipientProfile, setRecipientProfile] = useState<ChatUser | null>(null);
  const [contacts, setContacts] = useState<ContactUser[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupType, setNewGroupType] = useState<'GROUP' | 'CHANNEL'>('GROUP');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [draftState, setDraftState] = useState<DraftState>('idle');
  const [composeWarning, setComposeWarning] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  // Mobile-specific state
  const [mobileTab, setMobileTab] = useState<MobileTab>('chats');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [recipientE2eeEnrolled, setRecipientE2eeEnrolled] = useState<boolean | null>(null);
  const [isContactLocallyVerified, setIsContactLocallyVerified] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [lastSeenByUser, setLastSeenByUser] = useState<Record<string, string>>({});
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [threadRoot, setThreadRoot] = useState<ChatMessage | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [showThreadView, setShowThreadView] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const [showForwardPicker, setShowForwardPicker] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ callId: string; fromUserId: string; type: CallType } | null>(null);
  const [activeCall, setActiveCall] = useState<{ callId: string; peerUserId: string; type: CallType; state: string; startedAt?: number | null } | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [localMuted, setLocalMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentTokensRef = useRef<Record<string, string>>({});
  const callStateRef = useRef(new CallStateMachine());
  const peerManagerRef = useRef<PeerConnectionManager | null>(null);
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const selectedRecipientIdRef = useRef<string | null>(null);
  const threadRootRef = useRef<ChatMessage | null>(null);
  const showThreadViewRef = useRef(false);
  const pendingQueueStorageKey = buildPendingQueueStorageKey(currentUser?.id);
  const currentConversationId = buildConversationId(currentUser?.id, selectedRecipient?.id, selectedGroup?.id);

  const updateLocalMessageStatus = useCallback((tempId: string, status: DeliveryState, patch?: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((msg) => (msg.id === tempId || msg.tempId === tempId) ? { ...msg, status, ...patch } : msg));
  }, []);

  const {
    queueRef: pendingQueueRef,
    persistQueue: persistPendingQueue,
    loadQueue: loadPendingQueue,
    emitQueuedMessage,
    flushQueue: flushPendingQueue,
  } = usePendingQueue({
    storageKey: pendingQueueStorageKey,
    socket,
    updateLocalMessageStatus,
  });

  usePushNotifications(currentUser?.id);


  useEffect(() => {
    currentUserIdRef.current = currentUser?.id || null;
  }, [currentUser?.id]);

  useEffect(() => {
    selectedRecipientIdRef.current = selectedRecipient?.id || null;
  }, [selectedRecipient?.id]);

  useEffect(() => {
    threadRootRef.current = threadRoot;
  }, [threadRoot]);

  useEffect(() => {
    showThreadViewRef.current = showThreadView;
  }, [showThreadView]);

  useEffect(() => {
    let active = true;
    if (selectedGroup) {
      setRecipientE2eeEnrolled(null);
      return;
    }
    if (!selectedRecipient?.id) {
      setRecipientE2eeEnrolled(false);
      return;
    }
    getRecipientE2eeStatus(selectedRecipient.id).then((result) => {
      if (!active) return;
      setRecipientE2eeEnrolled(result.enrolled);
    });
    return () => {
      active = false;
    };
  }, [selectedGroup, selectedRecipient?.id]);

  useEffect(() => {
    let active = true;
    if (!selectedRecipient?.id) {
      setIsContactLocallyVerified(false);
      return;
    }
    isContactVerified(selectedRecipient.id).then((value) => {
      if (active) {
        setIsContactLocallyVerified(value);
      }
    });
    return () => {
      active = false;
    };
  }, [selectedRecipient?.id]);

  useEffect(() => {
    if (!selectedRecipient?.id || !selectedRecipient.identityKeyPublic) return;
    try {
      const key = 'dmIdentityFingerprints';
      const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>;
      const previous = stored[selectedRecipient.id];
      const current = selectedRecipient.identityKeyPublic.trim();
      if (previous && detectKeyChange(selectedRecipient.id, previous, current)) {
        setMessages((prev) => [...prev, {
          id: `key-change-${selectedRecipient.id}-${Date.now()}`,
          text: 'Security keys for this contact have changed. Verify their identity.',
          sender: 'them',
          type: 99,
          createdAt: new Date().toISOString(),
        }]);
      }
      stored[selectedRecipient.id] = current;
      localStorage.setItem(key, JSON.stringify(stored));
    } catch {
      // ignore storage parsing errors and continue chat rendering
    }
  }, [selectedRecipient?.id, selectedRecipient?.identityKeyPublic]);

  // Admin view routing
  useEffect(() => {
    const viewParam = searchParams.get('view');
    const tabParam = searchParams.get('tab');
    if (viewParam === 'admin') {
      setActiveView('admin');
      if (['users', 'reports', 'settings', 'data', 'audit', 'overview'].includes(tabParam || '')) {
        setAdminTab(tabParam as any);
      }
    }
  }, [searchParams]);

  // Initialize user & socket using session cookie instead of localStorage
  useEffect(() => {
    let activeSocket: Socket | null = null;

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
        setCsrfToken(typeof data.csrfToken === 'string' ? data.csrfToken : null);
        const user = data.user;
        setCurrentUser(user);
        setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);

        const queueKey = buildPendingQueueStorageKey(user.id);
        loadPendingQueue(queueKey);

        activeSocket = io();
        activeSocket.on('connect', () => {
          setSocket(activeSocket);
          setIsOnline(true);
          activeSocket?.emit('join', user.id);
          flushPendingQueue(activeSocket);
        });

        activeSocket.on('disconnect', () => {
          setIsOnline(false);
        });

        activeSocket.on('presence:online', (data: { userId?: string }) => {
          if (!data?.userId) return;
          setOnlineUsers((prev) => ({ ...prev, [data.userId as string]: true }));
        });

        activeSocket.on('presence:offline', (data: { userId?: string }) => {
          if (!data?.userId) return;
          setOnlineUsers((prev) => ({ ...prev, [data.userId as string]: false }));
        });

        activeSocket.on('presence:lastSeen', (data: { userId?: string; at?: string }) => {
          if (!data?.userId || !data?.at) return;
          setLastSeenByUser((prev) => ({ ...prev, [data.userId as string]: data.at as string }));
        });

        activeSocket.on('receiveMessage', async (data: SocketMessagePayload & { messagePayload?: string; _senderPublicKey?: string }) => {
          if (data._self) return;

          let text = data.ciphertext || data.messagePayload || '';
          if (data.ciphertext && data.nonce && data.senderId !== user.id) {
            try {
              const privKey = await getIdentityPrivateKey();
              if (privKey && data._senderPublicKey) {
                const key = await getOrCreateSessionKey(privKey, data._senderPublicKey, data.senderId);
                text = await decryptMessage(key, data.ciphertext, data.nonce);
              }
            } catch {
              text = data.ciphertext;
            }
          }

          setMessages((prev) => [...prev, {
            id: data.id || Date.now().toString(),
            tempId: data.tempId || undefined,
            text,
            sender: data.senderId === user.id ? 'me' : 'them',
            senderId: data.senderId,
            type: data.type || 0,
            fileUrl: data.fileUrl || undefined,
            fileName: data.fileName || undefined,
            fileSize: data.fileSize || undefined,
            createdAt: data.createdAt,
            encrypted: !!data.nonce,
            status: data.deliveryStatus || 'DELIVERED',
            replyToId: data.replyToId || null,
            forwardedFrom: data.forwardedFrom || null,
          }]);
          setIsOtherUserTyping(false);
        });

        activeSocket.on('messageSent', (data: { id?: string; tempId?: string; deliveryStatus?: DeliveryState; createdAt?: string; error?: string }) => {
          const tempId = data.tempId || data.id;
          if (!tempId) return;
          setMessages((prev) => prev.map((msg) => (msg.id === tempId || msg.tempId === tempId) ? {
            ...msg,
            id: data.id || msg.id,
            tempId,
            status: data.error ? 'FAILED' : (data.deliveryStatus || 'SENT'),
            createdAt: data.createdAt || msg.createdAt,
            error: data.error || undefined,
          } : msg));
          const remaining = pendingQueueRef.current.filter((item) => item.tempId !== tempId);
          persistPendingQueue(remaining);
        });


        activeSocket.on('thread:updated', () => {
          if (showThreadViewRef.current && threadRootRef.current?.id) {
            void fetchThreadById(threadRootRef.current.id);
          }
        });

        activeSocket.on('call:ring', (payload: { callId: string; fromUserId: string; type: CallType }) => {
          setIncomingCall(payload);
          callStateRef.current.ring(payload.callId, payload.fromUserId, payload.type);
        });

        activeSocket.on('call:accept', async (payload: { callId: string; toUserId: string; type: CallType }) => {
          const actorId = currentUserIdRef.current;
          if (!actorId || payload.toUserId !== actorId) return;
          const stream = await getCallMediaStream({ type: payload.type });
          localCallStreamRef.current = stream;
          const peer = new PeerConnectionManager({
            turnUrl: process.env.NEXT_PUBLIC_TURN_URL || process.env.NEXT_PUBLIC_TURN_URL_FALLBACK,
            turnUsername: process.env.NEXT_PUBLIC_TURN_USERNAME,
            turnCredential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
          });
          peer.attachLocalStream(stream);
          peer.connection.onicecandidate = (event) => {
            const recipientId = selectedRecipientIdRef.current;
            if (!event.candidate || !recipientId) return;
            activeSocket?.emit('call:ice-candidate', { callId: payload.callId, toUserId: recipientId, type: payload.type, candidate: event.candidate.toJSON() });
          };
          peer.connection.ontrack = (event) => {
            const remote = event.streams[0];
            if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
          };
          const offer = await peer.createOffer();
          const recipientId = selectedRecipientIdRef.current || '';
          activeSocket?.emit('call:offer', { callId: payload.callId, toUserId: recipientId, type: payload.type, offer });
          peerManagerRef.current = peer;
          setActiveCall({ callId: payload.callId, peerUserId: recipientId, type: payload.type, state: 'connected', startedAt: Date.now() });
          callStateRef.current.connect();
        });

        activeSocket.on('call:offer', async (payload: any) => {
          const stream = await getCallMediaStream({ type: payload.type });
          localCallStreamRef.current = stream;
          const peer = new PeerConnectionManager({
            turnUrl: process.env.NEXT_PUBLIC_TURN_URL || process.env.NEXT_PUBLIC_TURN_URL_FALLBACK,
            turnUsername: process.env.NEXT_PUBLIC_TURN_USERNAME,
            turnCredential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
          });
          peer.attachLocalStream(stream);
          await peer.applyRemoteDescription(payload.offer);
          peer.connection.onicecandidate = (event) => {
            if (!event.candidate) return;
            activeSocket?.emit('call:ice-candidate', { callId: payload.callId, toUserId: payload.fromUserId, type: payload.type, candidate: event.candidate.toJSON() });
          };
          peer.connection.ontrack = (event) => {
            const remote = event.streams[0];
            if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remote;
          };
          const answer = await peer.createAnswer();
          activeSocket?.emit('call:answer', { callId: payload.callId, toUserId: payload.fromUserId, type: payload.type, answer });
          peerManagerRef.current = peer;
          setActiveCall({ callId: payload.callId, peerUserId: payload.fromUserId, type: payload.type, state: 'connected', startedAt: Date.now() });
          callStateRef.current.connect();
        });

        activeSocket.on('call:answer', async (payload: any) => {
          await peerManagerRef.current?.applyRemoteDescription(payload.answer);
        });

        activeSocket.on('call:ice-candidate', async (payload: any) => {
          await peerManagerRef.current?.addIceCandidate(payload.candidate);
        });

        activeSocket.on('call:end', () => {
          peerManagerRef.current?.cleanup();
          peerManagerRef.current = null;
          stopMediaStream(localCallStreamRef.current);
          localCallStreamRef.current = null;
          setActiveCall(null);
          setIncomingCall(null);
          setCallSeconds(0);
          callStateRef.current.end();
          callStateRef.current.reset();
        });

        activeSocket.on('userTyping', (data: any) => {
          if (data.senderId !== user.id) {
            setIsOtherUserTyping(data.isTyping);
          }
        });
      } catch (err) {
        console.error('Failed to initialize session:', err);
        router.push('/auth/login');
      }
    };

    init();

    const handleOnline = () => {
      setIsOnline(true);
      flushPendingQueue(activeSocket);
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      activeSocket?.disconnect();
    };
    // NOTE: We intentionally avoid depending on queue helpers here.
    // Their identities can change as queue storage/socket state changes, which
    // would re-run this initialization effect and continuously reconnect socket
    // + refetch session/admin data (visible as loading loops in admin settings).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // Load contacts & communities when the session user is available.
  // loadContacts and loadCommunities are stable functions defined in the same
  // component scope — adding them to the dep array would cause infinite loops.
  useEffect(() => {
    if (!currentUser?.id) return;
    loadContacts();
    loadCommunities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const loadContacts = async () => {
    // Do not call if no session yet
    if (!currentUser?.id) return;
    const res = await getContacts();
    if ('success' in res && res.success) setContacts(res.contacts || []);
  };

  const loadCommunities = async () => {
    if (!currentUser?.id) return;
    const res = await getUserCommunities();
    if ('success' in res && res.success) setCommunities(res.communities || []);
  };

  useEffect(() => {
    if (!currentConversationId) return;
    const storageKey = buildDraftStorageKey(currentUser?.id, selectedRecipient?.id, selectedGroup?.id);
    let cancelled = false;

    const loadDraft = async () => {
      try {
        const response = await fetch('/api/drafts', { cache: 'no-store', credentials: 'include' });
        const data = await response.json();
        const conversationDraft = data?.drafts?.find((draft: { recipientId?: string; groupId?: string }) => draft.recipientId === selectedRecipient?.id || draft.groupId === selectedGroup?.id);
        const localDraft = storageKey ? localStorage.getItem(storageKey) : '';
        if (!cancelled) {
          setInput((conversationDraft?.clientDraft || localDraft || '').toString());
          setDraftState((conversationDraft?.clientDraft || localDraft) ? 'saved' : 'idle');
        }
      } catch {
        if (!cancelled && storageKey) {
          setInput(localStorage.getItem(storageKey) || '');
        }
      }
    };

    loadDraft();
    return () => { cancelled = true; };
  }, [currentConversationId, currentUser?.id, selectedGroup?.id, selectedRecipient?.id]);

  useEffect(() => {
    if (!currentConversationId) return;
    const storageKey = buildDraftStorageKey(currentUser?.id, selectedRecipient?.id, selectedGroup?.id);
    if (!storageKey) return;

    const timeout = setTimeout(async () => {
      try {
        setDraftState(input.trim() ? 'saving' : 'idle');
        localStorage.setItem(storageKey, input);
        if (!input.trim()) {
          await fetchWithCsrf('/api/drafts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipientId: selectedRecipient?.id, groupId: selectedGroup?.id }),
          }, csrfToken);
          setDraftState('idle');
          return;
        }

        await fetchWithCsrf('/api/drafts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId: selectedRecipient?.id, groupId: selectedGroup?.id, clientDraft: input }),
        }, csrfToken);
        setDraftState('saved');
      } catch (error) {
        if (error instanceof HttpAuthError && error.status === 403) {
          setComposeWarning('Your session expired. Refresh the page and try again.');
        }
        setDraftState('error');
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [csrfToken, currentConversationId, currentUser?.id, input, selectedGroup?.id, selectedRecipient?.id]);

  // Load message history when recipient changes
  useEffect(() => {
    if (!currentUser?.id) return;
    if (!selectedRecipient && !selectedGroup) return;

    const loadHistory = async () => {
      setLoadingMessages(true);
      setMessages([]);

      const res = await getMessageHistory(
        selectedRecipient?.id,
        selectedGroup?.id,
      );

      if ('success' in res && res.success && res.messages) {
        const decryptedMessages: ChatMessage[] = [];
        for (const msg of res.messages) {
          let text = msg.ciphertext || '';

          // Try decryption for 1:1 messages
          if (selectedRecipient && msg.nonce && msg.ciphertext) {
            try {
              if (sessionKey) {
                text = await decryptMessage(sessionKey, msg.ciphertext, msg.nonce);
              }
            } catch {
              // Decryption failed — show as encrypted
            }
          }

          decryptedMessages.push({
            id: msg.id,
            text,
            sender: msg.senderId === currentUser.id ? 'me' : 'them',
            senderId: msg.senderId,
            type: msg.type,
            fileUrl: msg.fileUrl || undefined,
            fileName: msg.fileName || undefined,
            fileSize: msg.fileSize || undefined,
            createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : undefined,
            encrypted: !!msg.nonce,
            status: (msg.deliveryStatus || (msg.readAt ? 'READ' : msg.deliveredAt ? 'DELIVERED' : 'SENT')) as DeliveryState,
            replyToId: msg.replyToId || null,
            forwardedFrom: msg.forwardedFrom || null,
          });
        }
        setMessages(decryptedMessages);
      }
      setLoadingMessages(false);
    };

    loadHistory();
    // selectedRecipient and selectedGroup objects are intentionally excluded;
    // only their .id properties are tracked to avoid re-running on unrelated field changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipient?.id, selectedGroup?.id, currentUser?.id, sessionKey]);

  // Establish E2EE session key when selecting a recipient
  useEffect(() => {
    if (!selectedRecipient?.id || !currentUser?.id) {
      setSessionKey(null);
      return;
    }

    const setupE2EE = async () => {
      try {
        const privKey = await getIdentityPrivateKey();
        if (!privKey) return;

        let recipientPubKey = selectedRecipient.identityKeyPublic;
        if (!recipientPubKey) {
          const keysRes = await getUserPublicKeys(selectedRecipient.id);
          if (keysRes.success && keysRes.keys) {
            recipientPubKey = keysRes.keys.identityKeyPublic;
          }
        }

        if (recipientPubKey) {
          const key = await getOrCreateSessionKey(privKey, recipientPubKey, selectedRecipient.id);
          setSessionKey(key);
        }
      } catch (err) {
        console.error('Failed to establish E2EE session:', err);
      }
    };

    setupE2EE();
    // selectedRecipient.identityKeyPublic is read inside the effect but we only
    // want to re-run when the recipient ID changes, not on every key update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRecipient?.id, currentUser?.id]);

  // Join group socket room
  useEffect(() => {
    if (!socket || !selectedGroup?.id) return;
    socket.emit('joinGroup', selectedGroup.id);
  }, [socket, selectedGroup?.id]);

  // Admin data — fetchAdminData is a stable local function; omitting it from
  // deps is intentional to avoid re-fetching on every render.
  useEffect(() => {
    if (activeView === 'admin' && currentUser?.role === 'ADMIN') {
      fetchAdminData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, currentUser]);

  const fetchAdminData = async () => {
    if (!currentUser) return;
    setIsLoadingAdmin(true);
    try {
      const [usersRes, settingsRes, reportsRes, auditRes, overviewRes] = await Promise.all([
        getAllUsers(),
        getAdminSettings(),
        getAllReports(),
        getAuditLogs(),
        getSystemOverview(),
      ]);
      if ('success' in usersRes && usersRes.success) setAdminUsers(usersRes.users);
      if ('success' in settingsRes && settingsRes.success) {
        setAdminSettings((prev) => ({
          ...settingsRes.settings,
          oauthGoogleEnabled: typeof settingsRes.settings.oauthGoogleEnabled === 'boolean'
            ? settingsRes.settings.oauthGoogleEnabled
            : (prev?.oauthGoogleEnabled ?? false),
          oauthGithubEnabled: typeof settingsRes.settings.oauthGithubEnabled === 'boolean'
            ? settingsRes.settings.oauthGithubEnabled
            : (prev?.oauthGithubEnabled ?? false),
          oauthOidcEnabled: typeof settingsRes.settings.oauthOidcEnabled === 'boolean'
            ? settingsRes.settings.oauthOidcEnabled
            : (prev?.oauthOidcEnabled ?? false),
        }));
      }
      if ('success' in reportsRes && reportsRes.success) setAdminReports(reportsRes.reports);
      if ('success' in auditRes && auditRes.success) setAdminAuditLogs(auditRes.logs);
      if ('success' in overviewRes && overviewRes.success) setAdminOverview(overviewRes.stats);
    } catch (error) {
      console.error('Fetch admin data error:', error);
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  const handleToggleBan = async (userId: string) => {
    if (!currentUser) return;
    const res = await toggleBanUser(userId);
    if ('success' in res && res.success) fetchAdminData();
    else alert('error' in res ? res.error : 'Request failed.');
  };

  const handleUpdateUserBadges = async (userId: string, badge: string | null | undefined, isVerified: boolean) => {
    if (!currentUser) return;
    const res = await updateUserBadges(userId, badge ?? null, isVerified);
    if ('success' in res && res.success) fetchAdminData();
    else alert('error' in res ? res.error : 'Request failed.');
  };

  const renderBadgeIcon = (badge: string | null | undefined) => {
    switch (badge) {
      case 'Support': return <div title="Support"><Headset className="w-3 h-3 text-blue-400" /></div>;
      case 'Seller': return <div title="Seller"><ShoppingBag className="w-3 h-3 text-orange-400" /></div>;
      case 'Technical': return <div title="Technical"><Wrench className="w-3 h-3 text-zinc-400" /></div>;
      case 'Ads': return <div title="Ads"><Megaphone className="w-3 h-3 text-purple-400" /></div>;
      default: return null;
    }
  };

  const getUserDisplayName = (user: ChatUser | null | undefined) => {
    if (!user) return 'Unknown user';
    return user.displayName?.trim() || user.username;
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !adminSettings) return;
    const res = await updateAdminSettings(adminSettings);
    if ('success' in res && res.success) alert('Settings updated successfully');
    else alert('error' in res ? res.error : 'Request failed.');
  };

  const handleExportData = async () => {
    if (!currentUser) return;
    const res = await exportSystemData();
    if ('success' in res && res.success) {
      const blob = new Blob([res.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elahe_export_${new Date().toISOString()}.json`;
      a.click();
    } else alert('error' in res ? res.error : 'Failed to create community.');
  };

  const handleResolveReport = async (reportId: string, status: 'RESOLVED' | 'DISMISSED') => {
    if (!currentUser) return;
    const res = await resolveReport(reportId, status);
    if ('success' in res && res.success) fetchAdminData();
    else alert('error' in res ? res.error : 'Request failed.');
  };

  const openRecipientProfileModal = async () => {
    if (!selectedRecipient?.id) return;
    const result = await getPublicUserProfile(selectedRecipient.id);
    if (result.success && result.user) {
      setRecipientProfile(result.user);
      setIsProfileModalOpen(true);
      return;
    }
    setRecipientProfile(selectedRecipient);
    setIsProfileModalOpen(true);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Typing indicator
  useEffect(() => {
    if (!socket || !currentUser || !input.trim() || (!selectedRecipient && !selectedGroup)) {
      if (socket && currentUser && (selectedRecipient || selectedGroup)) {
        socket.emit('typing', {
          recipientId: selectedRecipient?.id,
          groupId: selectedGroup?.id,
          isTyping: false,
        });
      }
      return;
    }

    socket.emit('typing', {
      recipientId: selectedRecipient?.id,
      groupId: selectedGroup?.id,
      isTyping: true,
    });

    const timeout = setTimeout(() => {
      socket.emit('typing', {
        recipientId: selectedRecipient?.id,
        groupId: selectedGroup?.id,
        isTyping: false,
      });
    }, 3000);

    return () => clearTimeout(timeout);
  }, [input, socket, currentUser, selectedRecipient, selectedGroup]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentUser) return;
    if (!selectedRecipient && !selectedGroup) return;

    let ciphertext = input;
    let nonce = '';

    if (selectedRecipient) {
      const prepared = await prepareDirectMessagePayload({
        plaintext: input,
        sessionKey,
        encryptMessageFn: encryptMessage,
      });
      if (!prepared.ok) {
        setComposeWarning(prepared.warning);
        return;
      }
      ciphertext = prepared.ciphertext;
      nonce = prepared.nonce;
    }

    const tempId = `${Date.now()}`;
    const queued: PendingQueueItem = {
      tempId,
      recipientId: selectedRecipient?.id,
      groupId: selectedGroup?.id,
      ciphertext,
      nonce,
      plaintext: input,
      type: 0,
      replyToId: replyTarget?.id,
    };

    setMessages((prev) => [...prev, {
      id: tempId,
      tempId,
      text: input,
      sender: 'me',
      encrypted: !!nonce,
      status: isOnline && socket ? 'SENT' : 'QUEUED',
      replyToId: replyTarget?.id ?? null,
    }]);

    if (isOnline && socket) {
      emitQueuedMessage(queued);
    } else {
      persistPendingQueue([...pendingQueueRef.current, queued]);
    }

    setInput('');
    setReplyTarget(null);
    setComposeWarning(null);
    if (currentConversationId) {
      const storageKey = buildDraftStorageKey(currentUser.id, selectedRecipient?.id, selectedGroup?.id);
      if (storageKey) localStorage.removeItem(storageKey);
      fetchWithCsrf('/api/drafts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: selectedRecipient?.id, groupId: selectedGroup?.id }),
      }, csrfToken).catch((error) => {
        if (error instanceof HttpAuthError && error.status === 403) {
          setComposeWarning('Your session expired. Refresh the page and try again.');
        }
      });
      setDraftState('idle');
    }
  };

  const handleSecureAttachmentDownload = useCallback(async (message: ChatMessage) => {
    if (!message.text) {
      setComposeWarning('This file cannot be downloaded right now. Try again from the original message.');
      return;
    }
    const payload = parseSecureAttachmentFromLegacyMessage(message.text);
    if (!payload) {
      setComposeWarning('This file cannot be downloaded right now. Try again from the original message.');
      return;
    }
    const fileId = payload.downloadUrl.split('/').pop()?.split('?')[0];
    if (!fileId) {
      setComposeWarning('This file cannot be downloaded right now. Try again from the original message.');
      return;
    }
    const token = attachmentTokensRef.current[fileId];
    if (!token) {
      setComposeWarning('This secure file token is no longer available. Ask for a new file upload.');
      return;
    }
    const response = await fetch(`/api/upload-secure/${fileId}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'x-download-token': token },
    });
    if (!response.ok) {
      setComposeWarning('Could not download securely. Refresh the page and try again.');
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = message.fileName || payload.originalFileName || 'attachment.bin';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    setComposeWarning(null);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || (!selectedRecipient && !selectedGroup)) return;

    if (selectedGroup) {
      setComposeWarning('Secure file sending is available in direct chats only for now.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (selectedRecipient && !sessionKey) {
      setComposeWarning(E2EE_UNAVAILABLE_WARNING);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    const recipientId = selectedRecipient ? selectedRecipient.id : undefined;
    const groupId: string | undefined = undefined;
    const conversationId = buildConversationId(currentUser.id, recipientId, groupId);

    try {
      if (!sessionKey) {
        setComposeWarning('Secure file sending needs direct-chat protection to finish first.');
        return;
      }
      const composed = await createSecureAttachmentMessage({
        file,
        conversationKey: sessionKey,
        conversationId,
        originalMimeType: file.type || 'application/octet-stream',
      });
      if (!composed?.success || !composed?.message) {
        setComposeWarning(typeof composed?.error === 'string' ? composed.error : 'Could not upload file securely. Please try again.');
        return;
      }
      const messagePayload = composed.message as {
        type: number;
        ciphertext: string;
        nonce: string;
        fileName?: string | null;
        fileSize?: number | null;
      };
      if (messagePayload.type !== 2) {
        setComposeWarning('Could not prepare this file securely. Please try another file.');
        return;
      }

      const securePayload = parseSecureAttachmentFromLegacyMessage(messagePayload.ciphertext);
      const fileId = securePayload?.downloadUrl.split('/').pop()?.split('?')[0];
      if (fileId && typeof composed.downloadToken === 'string' && composed.downloadToken) {
        attachmentTokensRef.current[fileId] = composed.downloadToken;
      }

      const tempId = `${Date.now()}`;
      const queued: PendingQueueItem = {
        tempId,
        recipientId,
        groupId,
        ciphertext: messagePayload.ciphertext,
        nonce: messagePayload.nonce || '',
        plaintext: `Sent a file: ${messagePayload.fileName || file.name}`,
        type: messagePayload.type,
        fileName: messagePayload.fileName || file.name,
        fileSize: messagePayload.fileSize || file.size,
      };

      setMessages((prev) => [...prev, {
        id: tempId,
        tempId,
        text: messagePayload.ciphertext,
        sender: 'me',
        fileName: messagePayload.fileName || file.name,
        fileSize: messagePayload.fileSize || file.size,
        type: messagePayload.type,
        encrypted: true,
        status: isOnline && socket ? 'SENT' : 'QUEUED',
      }]);

      if (isOnline && socket) emitQueuedMessage(queued);
      else persistPendingQueue([...pendingQueueRef.current, queued]);
      setComposeWarning(null);
    } catch (error) {
      console.error('Upload error:', error);
      setComposeWarning('Could not upload file securely. Please try again.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRetryMessage = (message: ChatMessage) => {
    if (!message.tempId || message.sender !== 'me') return;
    const queued = pendingQueueRef.current.find((item) => item.tempId === message.tempId);
    if (!queued) return;
    updateLocalMessageStatus(message.tempId, isOnline && socket ? 'SENT' : 'QUEUED', { error: undefined });
    if (isOnline && socket) {
      emitQueuedMessage(queued);
      return;
    }
    persistPendingQueue([...pendingQueueRef.current.filter((item) => item.tempId !== queued.tempId), queued]);
  };

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const delay = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchUsers(searchQuery);
      if ('success' in result && result.success) setSearchResults(result.users || []);
      setIsSearching(false);
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  const handleAddContact = async (user: any) => {
    if (!currentUser) return;
    const res = await addContact(user.id);
    if ('success' in res && res.success) {
      loadContacts();
      setSelectedRecipient(user);
      setSelectedGroup(null);
      setSearchQuery('');
      setSearchResults([]);
      setMobileShowChat(true);
    }
  };

  const handleSelectContact = (contact: ContactUser) => {
    setSelectedRecipient(contact);
    setSelectedGroup(null);
    setMessages([]);
    setSearchQuery('');
    setSearchResults([]);
    setMobileShowChat(true);
  };

  const handleSelectGroup = (group: Community) => {
    setSelectedGroup(group);
    setSelectedRecipient(null);
    setMessages([]);
    setMobileShowChat(true);
  };

  const handleMobileBack = () => {
    setMobileShowChat(false);
    setSelectedRecipient(null);
    setSelectedGroup(null);
  };

  const handleCreateGroup = async () => {
    if (!currentUser || !newGroupName.trim()) return;
    const res = await createCommunity(newGroupName, newGroupType, newGroupDesc);
    if ('success' in res && res.success) {
      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupDesc('');
      loadCommunities();
    } else alert('error' in res ? res.error : 'Request failed.');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    // Clear session on the server and redirect to login
    try {
      await fetchWithCsrf('/api/session', { method: 'DELETE' }, csrfToken);
    } catch {
      // ignore
    }
    router.push('/auth/login');
  };


  useEffect(() => {
    if (!activeCall?.startedAt) return;
    const t = setInterval(() => setCallSeconds(Math.floor((Date.now() - activeCall.startedAt!) / 1000)), 1000);
    return () => clearInterval(t);
  }, [activeCall?.startedAt]);

  const startCall = async (type: CallType) => {
    if (!socket || !selectedRecipient?.id || !currentUser?.id) return;
    const callId = `${Date.now()}-${currentUser.id}`;
    socket.emit('call:initiate', { callId, toUserId: selectedRecipient.id, fromUserId: currentUser.id, type });
    callStateRef.current.ring(callId, selectedRecipient.id, type);
    setActiveCall({ callId, peerUserId: selectedRecipient.id, type, state: 'ringing', startedAt: null });
  };

  const acceptIncomingCall = () => {
    if (!socket || !incomingCall || !currentUser?.id) return;
    socket.emit('call:accept', { ...incomingCall, fromUserId: incomingCall.fromUserId, toUserId: currentUser.id });
    setIncomingCall(null);
  };

  const rejectIncomingCall = () => {
    if (!socket || !incomingCall || !currentUser?.id) return;
    socket.emit('call:reject', { ...incomingCall, fromUserId: incomingCall.fromUserId, toUserId: currentUser.id });
    setIncomingCall(null);
  };

  const endActiveCall = () => {
    if (!socket || !activeCall || !currentUser?.id) return;
    socket.emit('call:end', { callId: activeCall.callId, fromUserId: currentUser.id, toUserId: activeCall.peerUserId, type: activeCall.type });
    peerManagerRef.current?.cleanup();
    peerManagerRef.current = null;
    stopMediaStream(localCallStreamRef.current);
    localCallStreamRef.current = null;
    setActiveCall(null);
    setCallSeconds(0);
  };

  if (!currentUser) return null;

  const chatTarget = selectedRecipient || selectedGroup;
  const groups = communities.filter(c => c.type === 'GROUP');
  const channels = communities.filter(c => c.type === 'CHANNEL');

  // ── Shared sub-components ──────────────────────



  const fetchThreadById = async (rootMessageId: string) => {
    const res = await fetch(`/api/messages/thread/${rootMessageId}`, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    if (!data?.success) return;
    const actorId = currentUserIdRef.current;
    const mapped: ChatMessage[] = [data.root, ...(data.messages || [])].map((msg: any) => ({
      id: msg.id,
      text: msg.ciphertext || '',
      sender: msg.senderId === actorId ? 'me' : 'them',
      senderId: msg.senderId,
      type: msg.type,
      createdAt: msg.createdAt ? new Date(msg.createdAt).toISOString() : undefined,
      encrypted: !!msg.nonce,
      replyToId: msg.replyToId || null,
      forwardedFrom: msg.forwardedFrom || null,
    }));
    setThreadRoot(mapped[0] || null);
    setThreadMessages(mapped.slice(1));
    setShowThreadView(true);
  };

  const fetchThread = async (root: ChatMessage) => {
    await fetchThreadById(root.id);
  };

  const replyCountByRoot = messages.reduce<Record<string, number>>((acc, msg) => {
    if (!msg.replyToId) return acc;
    acc[msg.replyToId] = (acc[msg.replyToId] || 0) + 1;
    return acc;
  }, {});

  const openForwardPicker = (msg: ChatMessage) => {
    setForwardMessage(msg);
    setShowForwardPicker(true);
  };

  const handleForwardTarget = (target: { recipientId?: string; groupId?: string }) => {
    if (!socket || !forwardMessage) return;
    socket.emit('message:forward', {
      messageId: forwardMessage.id,
      recipientId: target.recipientId,
      groupId: target.groupId,
    });
    setShowForwardPicker(false);
    setForwardMessage(null);
  };

  const renderSearchBar = () => (
    <div className="p-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
        <input
          type="text"
          placeholder="Search by username or numeric ID"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-gold transition-colors"
        />
      </div>
    </div>
  );

  const renderSearchResults = () => (
    searchQuery ? (
      isSearching ? (
        <div className="p-4 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-zinc-500" /></div>
      ) : searchResults.length === 0 ? (
        <div className="p-4 text-center text-xs text-zinc-500">No matching users yet</div>
      ) : (
        searchResults.map((user) => (
          <div key={user.id} className="p-3 flex items-center gap-3 hover:bg-zinc-800/50 cursor-pointer transition-colors border-b border-zinc-800/50">
            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden relative shrink-0">
              {user.profilePhoto ? (
                isDataUri(user.profilePhoto) ? (
                  <img src={user.profilePhoto} alt={getUserDisplayName(user)} className="w-full h-full object-cover" />
                ) : (
                  <Image src={user.profilePhoto} alt={getUserDisplayName(user)} fill sizes="40px" className="object-cover" unoptimized />
                )
              ) : (
                <User className="w-5 h-5 text-zinc-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="font-medium text-sm truncate">{getUserDisplayName(user)}</p>
                {user.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" />}
                {renderBadgeIcon(user.badge)}
              </div>
              <p className="text-[10px] text-zinc-500">@{user.username}</p>
            </div>
            <button
              onClick={() => handleAddContact(user)}
              className="p-1.5 bg-brand-gold/10 text-brand-gold rounded-lg hover:bg-brand-gold/20 transition-colors shrink-0"
              title="Add to contacts"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>
        ))
      )
    ) : null
  );

  const renderContactsList = () => (
    contacts.length === 0 ? (
      <div className="p-8 text-center text-zinc-500">
        <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-xs">Search to add your first contact</p>
      </div>
    ) : (
      contacts.map((contact) => (
        <div
          key={contact.id}
          onClick={() => handleSelectContact(contact)}
          className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-zinc-800/30 ${
            selectedRecipient?.id === contact.id ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/30'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden relative shrink-0">
            {contact.profilePhoto ? (
              isDataUri(contact.profilePhoto) ? (
                <img src={contact.profilePhoto} alt={getUserDisplayName(contact)} className="w-full h-full object-cover" />
              ) : (
                <Image src={contact.profilePhoto} alt={getUserDisplayName(contact)} fill sizes="40px" className="object-cover" unoptimized />
              )
            ) : (
              <User className="w-5 h-5 text-zinc-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="font-medium text-sm truncate">{getUserDisplayName(contact)}</p>
              {contact.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" />}
              {renderBadgeIcon(contact.badge)}
            </div>
            <p className="text-[10px] text-zinc-500">ID: {contact.numericId}</p>
            {onlineUsers[contact.id] ? <p className="text-[10px] text-emerald-400">Online</p> : null}
          </div>
        </div>
      ))
    )
  );

  const renderCommunityList = (list: Community[], emptyIcon: React.ReactNode, emptyText: string) => (
    list.length === 0 ? (
      <div className="p-8 text-center text-zinc-500">
        {emptyIcon}
        <p className="text-xs mt-2">{emptyText}</p>
      </div>
    ) : (
      list.map((group) => (
        <div
          key={group.id}
          onClick={() => handleSelectGroup(group)}
          className={`p-3 flex items-center gap-3 cursor-pointer transition-colors border-b border-zinc-800/30 ${
            selectedGroup?.id === group.id ? 'bg-zinc-800/70' : 'hover:bg-zinc-800/30'
          }`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            group.type === 'CHANNEL' ? 'bg-blue-500/20' : 'bg-emerald-500/20'
          }`}>
            {group.type === 'CHANNEL' ? (
              <Megaphone className="w-5 h-5 text-blue-400" />
            ) : (
              <Users className="w-5 h-5 text-emerald-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{group.name}</p>
            <p className="text-[10px] text-zinc-500">
              {group.memberCount} members
            </p>
          </div>
        </div>
      ))
    )
  );

  const renderChatView = () => (
    chatTarget ? (
      <>
        {/* Chat Header */}
        <div className="p-3 md:p-4 border-b border-zinc-800 flex items-center gap-3 bg-zinc-900/30">
          {/* Back button for mobile */}
          <button
            onClick={handleMobileBack}
            className="md:hidden p-1.5 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden relative shrink-0">
            {selectedRecipient ? (
              selectedRecipient.profilePhoto ? (
                isDataUri(selectedRecipient.profilePhoto) ? (
                  <img src={selectedRecipient.profilePhoto} alt={getUserDisplayName(selectedRecipient)} className="w-full h-full object-cover" />
                ) : (
                  <Image src={selectedRecipient.profilePhoto} alt={getUserDisplayName(selectedRecipient)} fill sizes="40px" className="object-cover" unoptimized />
                )
              ) : (
                <User className="w-5 h-5 text-zinc-400" />
              )
            ) : selectedGroup?.type === 'CHANNEL' ? (
              <Megaphone className="w-5 h-5 text-blue-400" />
            ) : (
              <Users className="w-5 h-5 text-emerald-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              {selectedRecipient ? (
                <button onClick={openRecipientProfileModal} className="font-medium hover:text-brand-gold transition-colors truncate">
                  {getUserDisplayName(selectedRecipient)}
                </button>
              ) : (
                <p className="font-medium truncate">{selectedGroup?.name}</p>
              )}
              {selectedGroup ? (
                selectedGroup.e2eeEnabled ? (
                  <span title="Group end-to-end encryption active">
                    <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                  </span>
                ) : (
                  <span title="Group messages are not yet end-to-end encrypted">
                    <ShieldOff className="w-4 h-4 text-zinc-400 shrink-0" />
                  </span>
                )
              ) : recipientE2eeEnrolled ? (
                <span title="End-to-end encrypted">
                  <Lock className="w-4 h-4 text-emerald-500 shrink-0" />
                </span>
              ) : (
                <span title="Encryption keys not yet exchanged">
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                </span>
              )}
              {(selectedRecipient?.isVerified || isContactLocallyVerified) && <BadgeCheck className="w-4 h-4 text-blue-500 shrink-0" />}
              {renderBadgeIcon(selectedRecipient?.badge)}
            </div>
            <ConversationStatus
              isOnline={selectedRecipient ? Boolean(onlineUsers[selectedRecipient.id]) : isOnline}
              isTyping={isOtherUserTyping}
              hasSessionKey={Boolean(sessionKey)}
              recipientNumericId={selectedRecipient?.numericId}
              memberCount={selectedGroup?.memberCount}
              isGroup={Boolean(selectedGroup)}
            />
            {selectedRecipient && !onlineUsers[selectedRecipient.id] && lastSeenByUser[selectedRecipient.id] ? <p className="text-[10px] text-[var(--text-muted)]">Last seen {new Date(lastSeenByUser[selectedRecipient.id]).toLocaleString()}</p> : null}
          </div>
          {selectedRecipient ? (
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => void startCall('voice')} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300" title="Voice call"><Phone className="w-4 h-4" /></button>
              <button type="button" onClick={() => void startCall('video')} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300" title="Video call"><Video className="w-4 h-4" /></button>
            </div>
          ) : null}
          <LanguageSelector className="hidden md:inline-flex" />
          <ThemeToggleButton />
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3">
          <ConversationSecurityBanner
            isDirect={Boolean(selectedRecipient)}
            hasSessionKey={Boolean(sessionKey)}
            memberCount={selectedGroup?.memberCount}
          />
          {loadingMessages ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : messages.length === 0 ? (
            <ChatEmptyState hasDirectSecurity={Boolean(selectedRecipient && sessionKey)} />
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div
                  dir={getTextDirection(msg.text)}
                  className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-3 md:px-4 py-2 ${
                    msg.sender === 'me'
                      ? 'bg-brand-blue text-white rounded-br-none'
                      : 'bg-zinc-800 text-zinc-100 rounded-bl-none'
                  }`}
                >
                  {msg.type === 99 ? (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/20 px-3 py-2 text-xs text-amber-100">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-amber-300" />
                      <p>Security keys for this contact have changed. Verify their identity.</p>
                    </div>
                  ) : msg.type === 2 ? (
                    <div className="flex items-center gap-3 bg-zinc-900/50 p-2 md:p-3 rounded-xl border border-zinc-800">
                      <div className="p-2 bg-brand-gold/10 rounded-lg">
                        <FileIcon className="w-5 h-5 md:w-6 md:h-6 text-brand-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{msg.fileName}</p>
                        <p className="text-[10px] text-zinc-500">{msg.fileSize ? (msg.fileSize / 1024).toFixed(1) : 0} KB</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSecureAttachmentDownload(msg)}
                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-brand-gold"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      {msg.forwardedFrom ? <p className="text-[10px] opacity-70 mb-1">Forwarded from {msg.forwardedFrom}</p> : null}
                      {msg.replyToId ? <p className="text-[10px] opacity-70 mb-1">Reply in thread</p> : null}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 opacity-60 flex-wrap">
                    <button type="button" onClick={() => setReplyTarget(msg)} className="text-[9px] inline-flex items-center gap-1"><Reply className="w-3 h-3" />Reply</button>
                    <button type="button" onClick={() => openForwardPicker(msg)} className="text-[9px] inline-flex items-center gap-1"><Forward className="w-3 h-3" />Forward</button>
                    {msg.encrypted && (
                      <div className="flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        <span className="text-[9px]">encrypted</span>
                      </div>
                    )}
                    {msg.sender === 'me' && msg.status && <span className="text-[9px]">{renderDeliveryLabel(msg.status)}</span>}
                    {msg.sender === 'me' && msg.status === 'FAILED' && (
                      <button type="button" onClick={() => handleRetryMessage(msg)} className="text-[9px] underline underline-offset-2">Retry</button>
                    )}
                  </div>
                </div>
                {replyCountByRoot[msg.id] ? (
                  <button type="button" onClick={() => void fetchThread(msg)} className="mt-1 text-[10px] text-zinc-400 hover:text-zinc-200">View Thread ({replyCountByRoot[msg.id]} replies)</button>
                ) : null}
              </div>
            ))
          )}
          {isOtherUserTyping && (
            <div className="flex justify-start">
              <div className="bg-zinc-800 text-zinc-400 rounded-2xl px-4 py-2 rounded-bl-none flex gap-2 items-center">
                <span className="text-xs">Typing…</span>
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce"></span>
              </div>
            </div>
          )}
        </div>

        {/* Message Input */}
        <div className="p-2 md:p-4 bg-zinc-900/50 border-t border-zinc-800">
          <DraftAndConnectionStatus isOnline={isOnline} draftState={draftState} />
          {composeWarning && (
            <div className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {composeWarning}
            </div>
          )}
          {replyTarget ? (
            <div className="mb-2 flex items-start justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs">
              <div>
                <p className="text-zinc-400">Replying to message</p>
                <p className="truncate max-w-[40ch]">{replyTarget.text}</p>
              </div>
              <button type="button" onClick={() => setReplyTarget(null)}><XCircle className="w-4 h-4" /></button>
            </div>
          ) : null}
          <form onSubmit={sendMessage} className="flex gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="p-2.5 md:p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-400 hover:text-brand-gold transition-colors disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (composeWarning) setComposeWarning(null);
              }}
              dir={getTextDirection(input)}
              placeholder={sessionKey ? 'Write a protected message…' : 'Write a message…'}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-sm focus:outline-none focus:border-brand-gold transition-colors"
            />
            <button type="submit" className="bg-brand-gold hover:bg-brand-gold/90 text-zinc-950 p-2.5 md:p-3 rounded-xl transition-colors flex items-center justify-center">
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>

        {incomingCall ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-center">
              <p className="text-sm mb-3">Incoming {incomingCall.type} call</p>
              <div className="flex justify-center gap-3">
                <button type="button" onClick={acceptIncomingCall} className="rounded-full bg-emerald-600 p-3"><Phone className="w-5 h-5" /></button>
                <button type="button" onClick={rejectIncomingCall} className="rounded-full bg-rose-600 p-3"><PhoneOff className="w-5 h-5" /></button>
              </div>
            </div>
          </div>
        ) : null}

        {activeCall ? (
          <div className="absolute bottom-4 left-1/2 z-20 w-[min(95%,520px)] -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-950/95 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-300">
              <span>{activeCall.type} call • {callSeconds}s</span>
              <span>{activeCall.state}</span>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => {
                const stream = localCallStreamRef.current;
                if (!stream) return;
                const next = !localMuted;
                stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
                setLocalMuted(next);
              }} className="rounded-full bg-zinc-800 p-3">{localMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}</button>
              {activeCall.type === 'video' ? <button type="button" onClick={() => {
                const stream = localCallStreamRef.current;
                if (!stream) return;
                const next = !videoEnabled;
                stream.getVideoTracks().forEach((track) => { track.enabled = next; });
                setVideoEnabled(next);
              }} className="rounded-full bg-zinc-800 p-3">{videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}</button> : null}
              <button type="button" onClick={endActiveCall} className="rounded-full bg-rose-600 p-3"><PhoneOff className="w-4 h-4" /></button>
            </div>
          </div>
        ) : null}

        {showThreadView && threadRoot ? (
          <div className="absolute inset-0 z-20 bg-black/70 p-4">
            <div className="mx-auto flex h-full max-w-2xl flex-col rounded-xl border border-zinc-700 bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-700 p-3">
                <p className="text-sm font-medium">Thread</p>
                <button type="button" onClick={() => setShowThreadView(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
                <div className="rounded-lg bg-zinc-800 p-2">{threadRoot.text}</div>
                {threadMessages.map((threadMsg) => (<div key={threadMsg.id} className="rounded-lg bg-zinc-800/70 p-2">{threadMsg.text}</div>))}
              </div>
              <div className="border-t border-zinc-700 p-3">
                <button type="button" onClick={() => {
                  setReplyTarget(threadRoot);
                  setShowThreadView(false);
                }} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs">Reply in thread</button>
              </div>
            </div>
          </div>
        ) : null}

        {showForwardPicker ? (
          <div className="absolute inset-0 z-20 bg-black/70 p-4">
            <div className="mx-auto max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Forward message</p>
                <button type="button" onClick={() => setShowForwardPicker(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {contacts.map((contact) => (
                  <button key={contact.id} type="button" onClick={() => handleForwardTarget({ recipientId: contact.id })} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800">{getUserDisplayName(contact)}</button>
                ))}
                {communities.map((community) => (
                  <button key={community.id} type="button" onClick={() => handleForwardTarget({ groupId: community.id })} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-800">#{community.name}</button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <audio ref={remoteAudioRef} autoPlay className="hidden" />
      </>
    ) : (
      /* No chat selected — only visible on desktop */
      <div className="flex-1 hidden md:flex flex-col items-center justify-center text-center p-8 space-y-6">
        <div className="w-24 h-24 relative opacity-20">
          <Image src="/logo.png" alt="Logo" fill className="object-contain" unoptimized />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-zinc-400">Welcome to your inbox</h2>
          <p className="text-zinc-500 max-w-sm">Search and add a contact, or create a group/channel to begin chatting.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Lock className="w-4 h-4" />
            <span>Direct chats protected</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Shield className="w-4 h-4" />
            <span>Privacy-first design</span>
          </div>
        </div>
      </div>
    )
  );

  const renderAdminPanel = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 md:p-6 border-b border-zinc-800 bg-zinc-900/30">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-brand-gold">System Management</h2>
          <button onClick={() => setActiveView('chat')} className="px-3 md:px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs md:text-sm font-medium transition-colors">
            Back to Chat
          </button>
        </div>
        <div className="flex gap-2 md:gap-4 overflow-x-auto no-scrollbar border-b border-zinc-800">
          {(['overview', 'users', 'reports', 'settings', 'data', 'audit'] as const).map((tab) => (
            <button key={tab} onClick={() => setAdminTab(tab)}
              className={`pb-2 px-1 text-xs md:text-sm font-medium transition-colors relative whitespace-nowrap ${adminTab === tab ? 'text-brand-gold' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {adminTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-gold" />}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoadingAdmin ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-gold" /></div>
        ) : adminTab === 'overview' && adminOverview ? (
          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: 'Total Users', value: adminOverview.users.total, color: 'brand-gold' },
              { label: 'New Today', value: adminOverview.users.today, color: 'emerald-500' },
              { label: 'New This Month', value: adminOverview.users.month, color: 'blue-500' },
              { label: 'New This Year', value: adminOverview.users.year, color: 'purple-500' },
            ].map((stat) => (
              <div key={stat.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 md:p-6 text-center">
                <p className="text-2xl md:text-3xl font-bold text-white mb-1">{stat.value}</p>
                <p className="text-[10px] md:text-xs text-zinc-500 uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : adminTab === 'users' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {adminUsers.map((user) => (
              <div key={user.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0"><User className="w-5 h-5 text-zinc-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-medium truncate">{user.username}</p>
                      {user.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500" />}
                      {renderBadgeIcon(user.badge)}
                    </div>
                    <p className="text-[10px] text-zinc-500">ID: {user.numericId}</p>
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${user.role === 'ADMIN' ? 'bg-brand-gold/20 text-brand-gold' : 'bg-zinc-800 text-zinc-400'}`}>
                    {user.role}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <span className={`text-[10px] ${user.isBanned ? 'text-red-500' : 'text-emerald-500'}`}>
                    {user.isBanned ? 'Banned' : 'Active'}
                  </span>
                  {user.role !== 'ADMIN' && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <select value={user.badge || ''} onChange={(e) => handleUpdateUserBadges(user.id, e.target.value || null, user.isVerified)}
                        className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-400 focus:outline-none focus:border-brand-gold">
                        <option value="">No Badge</option>
                        <option value="Support">Support</option>
                        <option value="Seller">Seller</option>
                        <option value="Technical">Technical</option>
                        <option value="Ads">Ads</option>
                      </select>
                      <button onClick={() => handleUpdateUserBadges(user.id, user.badge, !user.isVerified)}
                        className={`p-1 rounded transition-colors ${user.isVerified ? 'bg-blue-500/20 text-blue-500' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                        title="Toggle Verified"><BadgeCheck className="w-3 h-3" /></button>
                      <button onClick={() => handleToggleBan(user.id)}
                        className={`text-[10px] px-3 py-1 rounded-lg transition-colors ${user.isBanned ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                        {user.isBanned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : adminTab === 'settings' && adminSettings ? (
          <form onSubmit={handleUpdateSettings} className="max-w-2xl space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {adminSettingToggles.map(({ label, key, desc }) => (
                <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                  <div><p className="text-sm font-medium">{label}</p><p className="text-[10px] text-zinc-500">{desc}</p></div>
                  <button type="button" onClick={() => setAdminSettings({ ...adminSettings, [key]: !adminSettings[key] })}
                    className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${adminSettings[key] ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${adminSettings[key] ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              ))}
            </div>
            <button type="submit" className="bg-brand-gold text-zinc-950 px-6 py-2 rounded-xl font-bold hover:bg-brand-gold/90 transition-colors">
              Save System Settings
            </button>
          </form>
        ) : adminTab === 'audit' ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[600px]">
              <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800">
                <tr><th className="px-4 md:px-6 py-4 font-medium">Time</th><th className="px-4 md:px-6 py-4 font-medium">Action</th><th className="px-4 md:px-6 py-4 font-medium">Admin</th><th className="px-4 md:px-6 py-4 font-medium">IP</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {adminAuditLogs.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-zinc-500 italic">No audit logs found</td></tr>
                ) : adminAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/30">
                    <td className="px-4 md:px-6 py-4 text-zinc-400 whitespace-nowrap text-xs md:text-sm">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-4 md:px-6 py-4"><span className={`px-2 py-1 rounded-md text-[10px] font-bold ${log.action.includes('SUCCESS') ? 'bg-emerald-500/10 text-emerald-400' : log.action.includes('FAILED') ? 'bg-red-500/10 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>{log.action}</span></td>
                    <td className="px-4 md:px-6 py-4 text-zinc-300 text-xs md:text-sm">{log.admin?.username || '-'}</td>
                    <td className="px-4 md:px-6 py-4 text-zinc-500 font-mono text-xs">{log.ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : adminTab === 'reports' ? (
          <div className="space-y-3">
            {adminReports.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-8 text-center text-zinc-500">
                No pending reports.
              </div>
            ) : adminReports.map((report) => (
              <div key={report.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{report.reason}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(report.createdAt).toLocaleString()} • Report ID: {report.id}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-1 text-[10px] font-semibold ${
                    report.status === 'PENDING' ? 'bg-amber-500/20 text-amber-300' : report.status === 'RESOLVED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-300'
                  }`}>{report.status}</span>
                </div>
                {report.status === 'PENDING' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleResolveReport(report.id, 'RESOLVED')} className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20">
                      Mark Resolved
                    </button>
                    <button type="button" onClick={() => handleResolveReport(report.id, 'DISMISSED')} className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-600">
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : adminTab === 'data' ? (
          <div className="max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h3 className="text-sm font-semibold text-zinc-100">System Data Export</h3>
            <p className="mt-2 text-xs text-zinc-500">
              Download an administrative snapshot for audits and migration workflows.
            </p>
            <button type="button" onClick={handleExportData} className="mt-4 rounded-xl bg-brand-gold px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-brand-gold/90">
              Export Data (JSON)
            </button>
          </div>
        ) : (
          <div className="text-center py-20 text-zinc-500"><p>Select a tab to view data.</p></div>
        )}
      </div>
    </div>
  );

  // Mobile Settings Panel
  const renderMobileSettings = () => (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center overflow-hidden relative">
            {currentUser.profilePhoto ? (
              isDataUri(currentUser.profilePhoto) ? (
                <img src={currentUser.profilePhoto} alt={getUserDisplayName(currentUser)} className="w-full h-full object-cover" />
              ) : (
                <Image src={currentUser.profilePhoto} alt={getUserDisplayName(currentUser)} fill sizes="56px" className="object-cover" unoptimized />
              )
            ) : (
              <User className="w-6 h-6 text-emerald-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-base font-semibold truncate">{getUserDisplayName(currentUser)}</p>
              {currentUser.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500" />}
              {renderBadgeIcon(currentUser.badge)}
            </div>
            <p className="text-xs text-zinc-500">@{currentUser.username}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-[10px] text-zinc-500">ID: {currentUser.numericId}</p>
              <button onClick={() => copyToClipboard(currentUser.numericId)} className="p-0.5 hover:bg-zinc-800 rounded transition-colors" title="Copy ID">
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-zinc-500" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
          <LanguageSelector />
          <ThemeToggleButton />
        </div>
        <Link href="/chat/profile" className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/50 transition-colors">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <User className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-medium">Profile & Account</p>
            <p className="text-[10px] text-zinc-500">Edit profile, 2FA, security settings</p>
          </div>
        </Link>
        {currentUser.role === 'ADMIN' && (
          <button
            onClick={() => { setActiveView('admin'); setAdminTab('overview'); }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/50 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-brand-gold" />
            </div>
            <div>
              <p className="text-sm font-medium">Admin Panel</p>
              <p className="text-[10px] text-zinc-500">Manage users, settings, reports</p>
            </div>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/50 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
            <LogOut className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-red-400">Log Out</p>
            <p className="text-[10px] text-zinc-500">Sign out of your account</p>
          </div>
        </button>
      </div>
    </div>
  );

  // ── Main Layout ──────────────────────────────────

  return (
    <div className="flex h-[100dvh] bg-zinc-950 text-zinc-50 font-sans">

      {/* ===== DESKTOP: Sidebar (hidden on mobile) ===== */}
      <div className="hidden md:flex w-80 border-r border-zinc-800 flex-col bg-zinc-900/50">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-brand-gold flex items-center gap-2">
            <div className="w-6 h-6 relative">
              <Image src="/logo.png" alt="Logo" fill sizes="24px" className="object-contain" unoptimized />
            </div>
            Elahe Messenger
          </h2>
          <div className="flex items-center gap-1">
            {currentUser.role === 'ADMIN' && (
              <button
                onClick={() => { setActiveView(activeView === 'admin' ? 'chat' : 'admin'); setAdminTab('overview'); }}
                className={`p-2 rounded-lg transition-colors ${activeView === 'admin' ? 'bg-brand-gold text-zinc-950' : 'hover:bg-zinc-800 text-zinc-400'}`}
                title="Admin Panel"
              >
                <Shield className="w-5 h-5" />
              </button>
            )}
            <Link href="/chat/profile" className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
              <Settings className="w-5 h-5 text-zinc-400" />
            </Link>
            <button onClick={handleLogout} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-red-400">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setSidebarTab('contacts')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${sidebarTab === 'contacts' ? 'text-brand-gold border-b-2 border-brand-gold' : 'text-zinc-500'}`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Contacts
            </div>
          </button>
          <button
            onClick={() => setSidebarTab('groups')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${sidebarTab === 'groups' ? 'text-brand-gold border-b-2 border-brand-gold' : 'text-zinc-500'}`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Groups & Channels
            </div>
          </button>
        </div>

        {/* Search */}
        {renderSearchBar()}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {searchQuery ? renderSearchResults() : sidebarTab === 'contacts' ? (
            renderContactsList()
          ) : (
            <>
              <div className="p-3">
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="w-full py-2 bg-brand-gold/10 text-brand-gold rounded-xl text-xs font-medium hover:bg-brand-gold/20 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Create group or channel
                </button>
              </div>
              {renderCommunityList(communities, <Users className="w-8 h-8 mx-auto opacity-30" />, 'No groups or channels yet. Create one to get started.')}
            </>
          )}
        </div>

        {/* Current User Info */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center overflow-hidden relative">
              {currentUser.profilePhoto ? (
                isDataUri(currentUser.profilePhoto) ? (
                  <img src={currentUser.profilePhoto} alt={getUserDisplayName(currentUser)} className="w-full h-full object-cover" />
                ) : (
                  <Image src={currentUser.profilePhoto} alt={getUserDisplayName(currentUser)} fill sizes="32px" className="object-cover" unoptimized />
                )
              ) : (
                <User className="w-4 h-4 text-emerald-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium truncate">{getUserDisplayName(currentUser)}</p>
                {currentUser.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500" />}
                {renderBadgeIcon(currentUser.badge)}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-zinc-500">ID: {currentUser.numericId}</p>
                <button onClick={() => copyToClipboard(currentUser.numericId)} className="p-0.5 hover:bg-zinc-800 rounded transition-colors" title="Copy ID">
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-zinc-500" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== DESKTOP: Main Area ===== */}
      <div className="hidden md:flex flex-1 flex-col bg-zinc-950">
        {activeView === 'chat' ? renderChatView() : renderAdminPanel()}
      </div>

      {/* ===== MOBILE LAYOUT (md:hidden) ===== */}
      <div className="flex md:hidden flex-1 flex-col bg-zinc-950">
        {/* If admin view is active on mobile */}
        {activeView === 'admin' ? (
          renderAdminPanel()
        ) : mobileShowChat && chatTarget ? (
          /* Mobile: show full-screen chat */
          <div className="flex flex-col h-full">
            {renderChatView()}
          </div>
        ) : (
          /* Mobile: show tab content + bottom navbar */
          <div className="flex flex-col h-full">
            {/* Mobile Header */}
            <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
              <h2 className="text-lg font-bold text-brand-gold flex items-center gap-2">
                <div className="w-5 h-5 relative">
                  <Image src="/logo.png" alt="Logo" fill sizes="20px" className="object-contain" unoptimized />
                </div>
                Elahe Messenger
              </h2>
              <div className="flex items-center gap-1">
                {mobileTab !== 'settings' && (
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
                    title="Create Group/Channel"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Mobile Search (for chats, groups, channels) */}
            {mobileTab !== 'settings' && renderSearchBar()}

            {/* Mobile Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {searchQuery ? renderSearchResults() : mobileTab === 'chats' ? (
                renderContactsList()
              ) : mobileTab === 'groups' ? (
                <>
                  <div className="p-3">
                    <button
                      onClick={() => { setNewGroupType('GROUP'); setShowCreateGroup(true); }}
                      className="w-full py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-medium hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Create Group
                    </button>
                  </div>
                  {renderCommunityList(groups, <Users className="w-8 h-8 mx-auto opacity-30" />, 'No groups yet. Create one for team chat.')}
                </>
              ) : mobileTab === 'channels' ? (
                <>
                  <div className="p-3">
                    <button
                      onClick={() => { setNewGroupType('CHANNEL'); setShowCreateGroup(true); }}
                      className="w-full py-2 bg-blue-500/10 text-blue-400 rounded-xl text-xs font-medium hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> Create Channel
                    </button>
                  </div>
                  {renderCommunityList(channels, <Megaphone className="w-8 h-8 mx-auto opacity-30" />, 'No channels yet. Create one for announcements.')}
                </>
              ) : mobileTab === 'settings' ? (
                renderMobileSettings()
              ) : null}
            </div>

            {/* Mobile Bottom Nav */}
            <nav className="border-t border-zinc-800 bg-zinc-900/90 backdrop-blur-sm flex safe-area-pb">
              {([
                { key: 'chats' as MobileTab, icon: MessageSquare, label: 'Chats' },
                { key: 'groups' as MobileTab, icon: Users, label: 'Groups' },
                { key: 'channels' as MobileTab, icon: Megaphone, label: 'Channels' },
                { key: 'settings' as MobileTab, icon: Settings, label: 'Settings' },
              ]).map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => { setMobileTab(key); setSearchQuery(''); setSearchResults([]); }}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
                    mobileTab === key ? 'text-brand-gold' : 'text-zinc-500'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}
      </div>

      {/* ===== MODALS (shared desktop + mobile) ===== */}

      {/* Create Group/Channel Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setShowCreateGroup(false)}>
          <div className="w-full md:max-w-md bg-zinc-900 border-t md:border border-zinc-800 rounded-t-2xl md:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-300">Create New</p>
              <button onClick={() => setShowCreateGroup(false)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 md:p-6 space-y-4">
              <div className="flex gap-2">
                <button onClick={() => setNewGroupType('GROUP')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${newGroupType === 'GROUP' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'}`}>
                  <Users className="w-4 h-4 inline mr-1" /> Group
                </button>
                <button onClick={() => setNewGroupType('CHANNEL')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${newGroupType === 'CHANNEL' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-zinc-800 text-zinc-400'}`}>
                  <Megaphone className="w-4 h-4 inline mr-1" /> Channel
                </button>
              </div>
              <input type="text" placeholder={`${newGroupType === 'CHANNEL' ? 'Channel' : 'Group'} name`} value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-gold transition-colors" />
              <textarea placeholder="Description (optional)" value={newGroupDesc}
                onChange={(e) => setNewGroupDesc(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-gold transition-colors h-20 resize-none" />
              <button onClick={handleCreateGroup} disabled={!newGroupName.trim()}
                className="w-full bg-brand-gold text-zinc-950 py-2.5 rounded-xl font-bold hover:bg-brand-gold/90 disabled:opacity-50 transition-colors">
                Create {newGroupType === 'CHANNEL' ? 'Channel' : 'Group'}
              </button>
            </div>
            {/* Safe area padding for mobile */}
            <div className="h-safe-area-b md:h-0" />
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {isProfileModalOpen && recipientProfile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4" onClick={() => setIsProfileModalOpen(false)}>
          <div className="w-full md:max-w-sm bg-zinc-900 border-t md:border border-zinc-800 rounded-t-2xl md:rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <p className="text-sm text-zinc-300">User Profile</p>
              <button onClick={() => setIsProfileModalOpen(false)} className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 flex flex-col items-center text-center gap-3">
              <div className="w-24 h-24 rounded-full bg-zinc-800 relative overflow-hidden flex items-center justify-center">
                {recipientProfile.profilePhoto ? (
                  isDataUri(recipientProfile.profilePhoto) ? (
                    <img src={recipientProfile.profilePhoto} alt={getUserDisplayName(recipientProfile)} className="w-full h-full object-cover" />
                  ) : (
                    <Image src={recipientProfile.profilePhoto} alt={getUserDisplayName(recipientProfile)} fill sizes="96px" className="object-cover" unoptimized />
                  )
                ) : (
                  <User className="w-8 h-8 text-zinc-500" />
                )}
              </div>
              <div className="flex items-center gap-1">
                <h4 className="text-lg font-semibold">{getUserDisplayName(recipientProfile)}</h4>
                {recipientProfile.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500" />}
                {renderBadgeIcon(recipientProfile.badge)}
              </div>
              <p className="text-xs text-zinc-500">@{recipientProfile.username}</p>
              <p className="text-sm text-zinc-300 min-h-10">{recipientProfile.bio?.trim() || 'No bio yet'}</p>
            </div>
            {/* Safe area padding for mobile */}
            <div className="h-safe-area-b md:h-0" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading chat…</div>}>
      <ChatDashboardContent />
    </Suspense>
  );
}

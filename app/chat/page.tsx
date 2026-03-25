'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import io from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import Link from 'next/link';
import Image from 'next/image';
import {
  Send, Search, User, Settings, Shield, LogOut, Paperclip, File as FileIcon,
  Download, Loader2, Copy, Check, Server, BadgeCheck, Wrench, Megaphone,
  ShoppingBag, Headset, X, Plus, Users, Hash, UserPlus, MessageSquare,
  ChevronLeft, Lock,
} from 'lucide-react';
import { getTextDirection } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
// Import session‑independent actions (search, public key lookup) from the new auth‑session module.
import { searchUsers, getUserPublicKeys } from '@/app/actions/auth-session.actions';
// Import profile actions that infer the user from the session.
import {
  getUserProfile as getOwnUserProfile,
  updateUserProfile,
  getPublicUserProfile,
} from '@/app/actions/profile.actions';
// Import contacts actions that derive the caller from the session.
import { getContacts, addContact, removeContact } from '@/app/actions/contacts.actions';
// Import community and message actions that derive the caller from the session.
import {
  getUserCommunities,
  createCommunity,
  joinGroupByInvite,
  addMemberToGroup,
  removeMemberFromGroup,
  getGroupMembers,
  leaveGroup,
  getMessageHistory,
} from '@/app/actions/community.actions';
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
import ChatShell from './ChatShell';
import type { ChatMessage, ContactUser, Community, MobileTab } from './chat-types';
import {
  encryptMessage, decryptMessage, getOrCreateSessionKey, getIdentityPrivateKey,
} from '@/lib/crypto';

// Import shared type definitions to replace use of `any`.
import type { ChatUser, Report, AdminSettings, AuditLog, SocketMessagePayload } from '@/lib/types';

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
  // Mobile-specific state
  const [mobileTab, setMobileTab] = useState<MobileTab>('chats');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  usePushNotifications(currentUser?.id);

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

        const newSocket: Socket = io();
        newSocket.on('connect', () => {
          setSocket(newSocket);
          newSocket.emit('join', user.id);
        });

        newSocket.on('receiveMessage', async (data: SocketMessagePayload) => {
          if (data._self) return; // Skip self-echo for group messages

          let text = data.ciphertext || data.messagePayload || '';

          // Try to decrypt if we have a session key
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
            text,
            sender: data.senderId === user.id ? 'me' : 'them',
            senderId: data.senderId,
            type: data.type || 0,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            fileSize: data.fileSize,
            createdAt: data.createdAt,
            encrypted: !!data.nonce,
          }]);
          setIsOtherUserTyping(false);
        });

        newSocket.on('messageSent', (data: any) => {
          // Message confirmed persisted
        });

        newSocket.on('userTyping', (data: any) => {
          if (data.senderId !== user.id) {
            setIsOtherUserTyping(data.isTyping);
          }
        });

        return () => { newSocket.disconnect(); };
      } catch (err) {
        console.error('Failed to initialize session:', err);
        router.push('/auth/login');
      }
    };

    init();
  }, [router]);

  // Load contacts & communities
  useEffect(() => {
    if (!currentUser?.id) return;
    loadContacts();
    loadCommunities();
  }, [currentUser?.id]);

  const loadContacts = async () => {
    // Do not call if no session yet
    if (!currentUser?.id) return;
    const res = await getContacts();
    if (res.success) setContacts(res.contacts || []);
  };

  const loadCommunities = async () => {
    if (!currentUser?.id) return;
    const res = await getUserCommunities();
    if (res.success) setCommunities(res.communities || []);
  };

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

      if (res.success && res.messages) {
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
          });
        }
        setMessages(decryptedMessages);
      }
      setLoadingMessages(false);
    };

    loadHistory();
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
        if (!recipientPubKey || recipientPubKey === 'default_admin_key') {
          const keysRes = await getUserPublicKeys(selectedRecipient.id);
          if (keysRes.success && keysRes.keys) {
            recipientPubKey = keysRes.keys.identityKeyPublic;
          }
        }

        if (recipientPubKey && recipientPubKey !== 'default_admin_key') {
          const key = await getOrCreateSessionKey(privKey, recipientPubKey, selectedRecipient.id);
          setSessionKey(key);
        }
      } catch (err) {
        console.error('Failed to establish E2EE session:', err);
      }
    };

    setupE2EE();
  }, [selectedRecipient?.id, currentUser?.id]);

  // Join group socket room
  useEffect(() => {
    if (!socket || !selectedGroup?.id) return;
    socket.emit('joinGroup', selectedGroup.id);
  }, [socket, selectedGroup?.id]);

  // Admin data
  useEffect(() => {
    if (activeView === 'admin' && currentUser?.role === 'ADMIN') {
      fetchAdminData();
    }
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
      if (usersRes.success) setAdminUsers(usersRes.users);
      if (settingsRes.success) setAdminSettings(settingsRes.settings);
      if (reportsRes.success) setAdminReports(reportsRes.reports);
      if (auditRes.success) setAdminAuditLogs(auditRes.logs);
      if (overviewRes.success) setAdminOverview(overviewRes.stats);
    } catch (error) {
      console.error('Fetch admin data error:', error);
    } finally {
      setIsLoadingAdmin(false);
    }
  };

  const handleToggleBan = async (userId: string) => {
    if (!currentUser) return;
    const res = await toggleBanUser(userId);
    if (res.success) fetchAdminData();
    else alert(res.error);
  };

  const handleUpdateUserBadges = async (userId: string, badge: string | null, isVerified: boolean) => {
    if (!currentUser) return;
    const res = await updateUserBadges(userId, badge, isVerified);
    if (res.success) fetchAdminData();
    else alert(res.error);
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

  const handleUpdateSettings = async () => {
    if (!currentUser || !adminSettings) return;
    const res = await updateAdminSettings(adminSettings);
    if (res.success) alert('Settings updated successfully');
    else alert(res.error);
  };

  const handleExportData = async () => {
    if (!currentUser) return;
    const res = await exportSystemData();
    if (res.success) {
      const blob = new Blob([res.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kingchat_export_${new Date().toISOString()}.json`;
      a.click();
    } else alert(res.error);
  };

  const handleResolveReport = async (reportId: string, status: 'RESOLVED' | 'DISMISSED') => {
    if (!currentUser) return;
    const res = await resolveReport(reportId, status);
    if (res.success) fetchAdminData();
    else alert(res.error);
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
    if (!input.trim() || !socket || !currentUser) return;
    if (!selectedRecipient && !selectedGroup) return;

    let ciphertext = input;
    let nonce = '';

    // Encrypt for 1:1 conversations
    if (selectedRecipient && sessionKey) {
      try {
        const encrypted = await encryptMessage(sessionKey, input);
        ciphertext = encrypted.ciphertext;
        nonce = encrypted.nonce;
      } catch (err) {
        console.error('Encryption failed, sending plaintext:', err);
      }
    }

    const tempId = Date.now().toString();

    socket.emit('sendMessage', {
      recipientId: selectedRecipient?.id,
      groupId: selectedGroup?.id,
      ciphertext,
      nonce,
      messagePayload: ciphertext,
      type: 0,
      tempId,
    });

    setMessages((prev) => [...prev, {
      id: tempId,
      text: input,
      sender: 'me',
      encrypted: !!nonce,
    }]);
    setInput('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket || !currentUser || (!selectedRecipient && !selectedGroup)) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const contentType = res.headers.get('content-type');
      let data;
      if (contentType && contentType.includes('application/json')) {
        data = await res.json();
      } else {
        throw new Error('Unexpected server response.');
      }

      if (data.error) { alert(data.error); return; }

      socket.emit('sendMessage', {
        recipientId: selectedRecipient?.id,
        groupId: selectedGroup?.id,
        type: 2,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        ciphertext: `Sent a file: ${data.fileName}`,
        nonce: '',
      });

      setMessages((prev) => [...prev, {
        id: Date.now().toString(),
        text: `Sent a file: ${data.fileName}`,
        sender: 'me',
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        fileSize: data.fileSize,
        type: 2,
      }]);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const delay = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchUsers(searchQuery);
      if (result.success) setSearchResults(result.users || []);
      setIsSearching(false);
    }, 500);
    return () => clearTimeout(delay);
  }, [searchQuery]);

  const handleAddContact = async (user: any) => {
    if (!currentUser) return;
    const res = await addContact(user.id);
    if (res.success) {
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
    if (res.success) {
      setShowCreateGroup(false);
      setNewGroupName('');
      setNewGroupDesc('');
      loadCommunities();
    } else alert(res.error);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogout = async () => {
    // Clear session on the server and redirect to login
    try {
      await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
    } catch {
      // ignore
    }
    router.push('/auth/login');
  };

  if (!currentUser) return null;

  return (
    <ChatShell
      currentUser={currentUser}
      activeView={activeView}
      setActiveView={setActiveView}
      sidebarTab={sidebarTab}
      setSidebarTab={setSidebarTab}
      adminTab={adminTab}
      setAdminTab={setAdminTab}
      adminUsers={adminUsers}
      adminReports={adminReports}
      adminSettings={adminSettings}
      adminAuditLogs={adminAuditLogs}
      adminOverview={adminOverview}
      isLoadingAdmin={isLoadingAdmin}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      searchResults={searchResults}
      isSearching={isSearching}
      contacts={contacts}
      communities={communities}
      selectedRecipient={selectedRecipient}
      selectedGroup={selectedGroup}
      copied={copied}
      isProfileModalOpen={isProfileModalOpen}
      setIsProfileModalOpen={setIsProfileModalOpen}
      recipientProfile={recipientProfile}
      showCreateGroup={showCreateGroup}
      setShowCreateGroup={setShowCreateGroup}
      newGroupName={newGroupName}
      setNewGroupName={setNewGroupName}
      newGroupType={newGroupType}
      setNewGroupType={setNewGroupType}
      newGroupDesc={newGroupDesc}
      setNewGroupDesc={setNewGroupDesc}
      mobileTab={mobileTab}
      setMobileTab={setMobileTab}
      mobileShowChat={mobileShowChat}
      setMobileShowChat={setMobileShowChat}
      sessionKey={sessionKey}
      isOtherUserTyping={isOtherUserTyping}
      loadingMessages={loadingMessages}
      messages={messages}
      scrollRef={scrollRef}
      fileInputRef={fileInputRef}
      input={input}
      isUploading={isUploading}
      onAddContact={handleAddContact}
      onSelectContact={handleSelectContact}
      onSelectGroup={handleSelectGroup}
      onCreateGroup={handleCreateGroup}
      onOpenRecipientProfile={openRecipientProfileModal}
      onInputChange={setInput}
      onSubmit={sendMessage}
      onFileUpload={handleFileUpload}
      onCopyId={copyToClipboard}
      onLogout={handleLogout}
      onToggleBan={handleToggleBan}
      onUpdateUserBadges={handleUpdateUserBadges}
      onSettingsChange={setAdminSettings}
      onSaveSettings={handleUpdateSettings}
    />
  );
}

export default function ChatDashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Loading...</div>}>
      <ChatDashboardContent />
    </Suspense>
  );
}

// Export the chat dashboard content under a distinct name so that it can be
// imported from other modules.  This makes it possible to break the monolithic
// chat page down into smaller components without duplicating the entire file.
export { ChatDashboardContent };

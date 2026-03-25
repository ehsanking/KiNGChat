import type { ChatUser } from '@/lib/types';

export type ChatMessage = {
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
};

export type ContactUser = ChatUser & {
  identityKeyPublic?: string | null;
  signedPreKey?: string | null;
  signedPreKeySig?: string | null;
};

export type Community = {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  type: string;
  isPublic: boolean;
  inviteLink?: string | null;
  memberCount: number;
  myRole: string;
};

export type MobileTab = 'chats' | 'groups' | 'channels' | 'settings';

export type AdminOverview = {
  users: {
    total: number;
    today: number;
    month: number;
    year: number;
  };
};

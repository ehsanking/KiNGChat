import type { DeliveryState, SocketMessagePayload } from '@/lib/contracts/socket';

export type { DeliveryState, SocketMessagePayload };

export type ChatUser = {
  id: string;
  username: string;
  numericId: string;
  displayName?: string | null;
  bio?: string | null;
  profilePhoto?: string | null;
  role: string;
  badge?: string | null;
  isVerified: boolean;
  needsPasswordChange?: boolean;
  isBanned?: boolean;
};

export type Report = {
  id: string;
  reason: string;
  status: string;
  createdAt: string | Date;
  reporterId?: string;
  reportedUserId?: string;
};

export type AdminSettings = {
  id: string;
  isSetupCompleted: boolean;
  isRegistrationEnabled: boolean;
  maxRegistrations?: number | null;
  isCaptchaEnabled: boolean;
  maxAttachmentSize: number;
  allowedFileFormats: string;
  reservedUsernames: string;
  rules?: string | null;
  firebaseConfig?: string | null;
};

export type AuditLog = {
  id: string;
  action: string;
  targetId?: string | null;
  details?: string | null;
  ip?: string | null;
  createdAt: string | Date;
  admin?: { username?: string | null } | null;
};

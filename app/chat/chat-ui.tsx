'use client';

import Image from 'next/image';
import { BadgeCheck, Headset, Megaphone, ShoppingBag, User, Users, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ChatUser } from '@/lib/types';
import type { Community } from './chat-types';

export function getUserDisplayName(user: ChatUser | null | undefined) {
  if (!user) return 'Unknown user';
  return user.displayName?.trim() || user.username;
}

export function renderBadgeIcon(badge: string | null | undefined) {
  switch (badge) {
    case 'Support':
      return <div title="Support"><Headset className="w-3 h-3 text-blue-400" /></div>;
    case 'Seller':
      return <div title="Seller"><ShoppingBag className="w-3 h-3 text-orange-400" /></div>;
    case 'Technical':
      return <div title="Technical"><Wrench className="w-3 h-3 text-zinc-400" /></div>;
    case 'Ads':
      return <div title="Ads"><Megaphone className="w-3 h-3 text-purple-400" /></div>;
    default:
      return null;
  }
}

export function BrandLogo({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <Image src="/logo.png" alt="Elahe Messenger" fill sizes={`${size}px`} className="object-contain" unoptimized />
    </div>
  );
}

export function UserAvatar({
  user,
  size = 40,
  fallbackIcon,
  className = '',
}: {
  user?: Pick<ChatUser, 'profilePhoto' | 'displayName' | 'username'> | null;
  size?: number;
  fallbackIcon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-full bg-zinc-800 flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {user?.profilePhoto ? (
        <Image
          src={user.profilePhoto}
          alt={getUserDisplayName(user as ChatUser)}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      ) : (
        fallbackIcon ?? <User className="w-5 h-5 text-zinc-400" />
      )}
    </div>
  );
}

export function CommunityAvatar({ community, size = 40 }: { community: Community; size?: number }) {
  const baseClass = community.type === 'CHANNEL' ? 'bg-blue-500/20' : 'bg-emerald-500/20';
  const icon = community.type === 'CHANNEL'
    ? <Megaphone className="w-5 h-5 text-blue-400" />
    : <Users className="w-5 h-5 text-emerald-400" />;

  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 ${baseClass}`}
      style={{ width: size, height: size }}
    >
      {icon}
    </div>
  );
}

export function UserNameRow({ user }: { user: ChatUser | null | undefined }) {
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="truncate">{getUserDisplayName(user)}</span>
      {user?.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500 shrink-0" />}
      {renderBadgeIcon(user?.badge)}
    </div>
  );
}

'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Lock, ShieldAlert, ShieldOff } from 'lucide-react';
import { getRecipientE2eeStatus } from '@/app/actions/keys.actions';

export type ConversationPanelProps = {
  title: string;
  recipientId?: string;
  isGroup?: boolean;
  isVerifiedContact?: boolean;
};

type E2EEState = {
  icon: ReactNode;
  label: string;
};

export default function ConversationPanel({
  title,
  recipientId,
  isGroup = false,
  isVerifiedContact = false,
}: ConversationPanelProps) {
  const [dmEnrolled, setDmEnrolled] = useState(false);

  useEffect(() => {
    if (isGroup || !recipientId) {
      setDmEnrolled(false);
      return;
    }

    let active = true;
    getRecipientE2eeStatus(recipientId).then((result) => {
      if (!active) return;
      setDmEnrolled(Boolean(result.enrolled));
    });

    return () => {
      active = false;
    };
  }, [isGroup, recipientId]);

  const e2eeState = useMemo<E2EEState>(() => {
    if (isGroup) {
      return {
        icon: <ShieldOff className="h-4 w-4 text-zinc-400" aria-hidden="true" />,
        label: 'Group messages are not yet end-to-end encrypted',
      };
    }

    if (dmEnrolled) {
      return {
        icon: <Lock className="h-4 w-4 text-emerald-500" aria-hidden="true" />,
        label: 'End-to-end encrypted',
      };
    }

    return {
      icon: <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />,
      label: 'Encryption keys not yet exchanged',
    };
  }, [dmEnrolled, isGroup]);

  return (
    <header className="flex min-w-0 items-center gap-2">
      <h2 className="truncate text-base font-semibold text-zinc-100">{title}</h2>
      <span title={e2eeState.label} className="inline-flex shrink-0 items-center">
        {e2eeState.icon}
      </span>
      {isVerifiedContact ? (
        <span
          title="Verified safety number"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
        >
          <BadgeCheck className="h-3 w-3" aria-hidden="true" />
          Verified
        </span>
      ) : null}
    </header>
  );
}

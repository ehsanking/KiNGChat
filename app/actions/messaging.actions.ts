'use server';

import { cookies } from 'next/headers';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import {
  getMessageHistory as origGetMessageHistory,
  searchUsers as origSearchUsers,
  syncConversationState as origSyncConversationState,
  markConversationDelivered as origMarkConversationDelivered,
  reactToMessage as origReactToMessage,
  editConversationMessage as origEditConversationMessage,
  saveConversationDraft as origSaveConversationDraft,
  listConversationDrafts as origListConversationDrafts,
  deleteConversationDraft as origDeleteConversationDraft,
  searchConversationMessages as origSearchConversationMessages,
} from './auth';

async function getSession() {
  try {
    const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

async function requireSession() {
  const session = await getSession();
  if (!session) return null;
  return session;
}

export async function getMessageHistory(recipientId?: string, groupId?: string, cursor?: string, limit?: number) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origGetMessageHistory(session.userId, recipientId, groupId, cursor, limit);
}

export async function searchUsers(query: string) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origSearchUsers(query);
}

export async function syncConversationState(recipientId?: string, groupId?: string, since?: string, limit?: number) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origSyncConversationState(session.userId, recipientId, groupId, since, limit);
}

export async function markConversationDelivered(messageIds: string[]) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origMarkConversationDelivered(session.userId, messageIds);
}

export async function reactToMessage(messageId: string, emoji: string) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origReactToMessage(session.userId, messageId, emoji);
}

export async function editConversationMessage(messageId: string, ciphertext: string, nonce: string) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origEditConversationMessage(session.userId, messageId, ciphertext, nonce);
}

export async function saveConversationDraft(recipientId?: string, groupId?: string, ciphertext?: string, nonce?: string, clientDraft?: string) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origSaveConversationDraft(session.userId, recipientId, groupId, ciphertext, nonce, clientDraft);
}

export async function listConversationDrafts() {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origListConversationDrafts(session.userId);
}

export async function deleteConversationDraft(recipientId?: string, groupId?: string) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origDeleteConversationDraft(session.userId, recipientId, groupId);
}

export async function searchConversationMessages(query: string, recipientId?: string, groupId?: string, limit?: number) {
  const session = await requireSession();
  if (!session) return { error: 'Unauthorized' };
  return origSearchConversationMessages(session.userId, query, recipientId, groupId, limit);
}

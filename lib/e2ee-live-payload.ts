export type LiveDecryptPayload = {
  senderAgreementPublicKey: string | null;
  senderSigningPublicKey: string | null;
  senderSignedPreKey: string | null;
  senderSignedPreKeySig: string | null;
  e2eeVersion: string;
};

export type SocketMessageEnvelope = {
  id: string;
  senderId: string;
  recipientId?: string | null;
  groupId?: string | null;
  type: number;
  ciphertext: string;
  nonce: string;
  createdAt: string;
  e2ee?: LiveDecryptPayload;
};

export function buildLiveDecryptPayload(payload: Partial<LiveDecryptPayload>): LiveDecryptPayload {
  return {
    senderAgreementPublicKey: payload.senderAgreementPublicKey ?? null,
    senderSigningPublicKey: payload.senderSigningPublicKey ?? null,
    senderSignedPreKey: payload.senderSignedPreKey ?? null,
    senderSignedPreKeySig: payload.senderSignedPreKeySig ?? null,
    e2eeVersion: payload.e2eeVersion ?? 'legacy',
  };
}

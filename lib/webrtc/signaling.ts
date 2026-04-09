import type { Socket } from 'socket.io-client';
import type { CallType } from './call-state';

export type CallSignalEnvelope = {
  callId: string;
  fromUserId: string;
  toUserId: string;
  type: CallType;
};

export type OfferSignal = CallSignalEnvelope & { offer: RTCSessionDescriptionInit };
export type AnswerSignal = CallSignalEnvelope & { answer: RTCSessionDescriptionInit };
export type IceCandidateSignal = CallSignalEnvelope & { candidate: RTCIceCandidateInit };

export function initiateCall(socket: Socket, payload: Omit<CallSignalEnvelope, 'fromUserId'> & { fromUserId?: string }) {
  socket.emit('call:initiate', payload);
}

export function acceptCall(socket: Socket, payload: Pick<CallSignalEnvelope, 'callId' | 'toUserId' | 'fromUserId' | 'type'>) {
  socket.emit('call:accept', payload);
}

export function rejectCall(socket: Socket, payload: Pick<CallSignalEnvelope, 'callId' | 'toUserId' | 'fromUserId' | 'type'> & { reason?: string }) {
  socket.emit('call:reject', payload);
}

export function sendOffer(socket: Socket, payload: OfferSignal) {
  socket.emit('call:offer', payload);
}

export function sendAnswer(socket: Socket, payload: AnswerSignal) {
  socket.emit('call:answer', payload);
}

export function sendIceCandidate(socket: Socket, payload: IceCandidateSignal) {
  socket.emit('call:ice-candidate', payload);
}

export function endCall(socket: Socket, payload: Pick<CallSignalEnvelope, 'callId' | 'toUserId' | 'fromUserId' | 'type'>) {
  socket.emit('call:end', payload);
}

import type { CallType } from './call-state';

export type CallMediaOptions = {
  type: CallType;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
};

export async function getCallMediaStream(options: CallMediaOptions) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('WebRTC media capture is unavailable in this environment.');
  }

  const constraints: MediaStreamConstraints = {
    audio: options.audioEnabled ?? true,
    video: options.type === 'video' ? (options.videoEnabled ?? true) : false,
  };

  return navigator.mediaDevices.getUserMedia(constraints);
}

export function stopMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
}

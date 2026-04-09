import { stopMediaStream } from './media-manager';

export type PeerConnectionConfig = {
  turnUrl?: string;
  turnUsername?: string;
  turnCredential?: string;
};

const defaultIceServers = (config: PeerConnectionConfig): RTCIceServer[] => {
  const servers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (config.turnUrl) {
    servers.push({
      urls: config.turnUrl,
      username: config.turnUsername,
      credential: config.turnCredential,
    });
  }
  return servers;
};

export class PeerConnectionManager {
  private peer: RTCPeerConnection;
  private localStream: MediaStream | null = null;

  constructor(config: PeerConnectionConfig = {}) {
    this.peer = new RTCPeerConnection({
      iceServers: defaultIceServers(config),
      iceTransportPolicy: 'all',
    });
  }

  get connection() {
    return this.peer;
  }

  attachLocalStream(stream: MediaStream) {
    this.localStream = stream;
    for (const track of stream.getTracks()) {
      this.peer.addTrack(track, stream);
    }
  }

  async createOffer() {
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    return offer;
  }

  async createAnswer() {
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    return answer;
  }

  async applyRemoteDescription(description: RTCSessionDescriptionInit) {
    await this.peer.setRemoteDescription(description);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    await this.peer.addIceCandidate(candidate);
  }

  cleanup() {
    stopMediaStream(this.localStream);
    this.localStream = null;
    for (const sender of this.peer.getSenders()) {
      if (sender.track) sender.track.stop();
    }
    this.peer.onicecandidate = null;
    this.peer.ontrack = null;
    this.peer.onconnectionstatechange = null;
    this.peer.close();
  }
}

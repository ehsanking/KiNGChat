export type CallLifecycleState = 'idle' | 'ringing' | 'connected' | 'ended';
export type CallType = 'voice' | 'video';

export type CallState = {
  state: CallLifecycleState;
  callId: string | null;
  peerUserId: string | null;
  type: CallType | null;
  startedAt: number | null;
  endedAt: number | null;
};

export class CallStateMachine {
  private value: CallState = {
    state: 'idle',
    callId: null,
    peerUserId: null,
    type: null,
    startedAt: null,
    endedAt: null,
  };

  snapshot() {
    return { ...this.value };
  }

  ring(callId: string, peerUserId: string, type: CallType) {
    this.value = { state: 'ringing', callId, peerUserId, type, startedAt: null, endedAt: null };
    return this.snapshot();
  }

  connect(startedAt = Date.now()) {
    this.value = { ...this.value, state: 'connected', startedAt, endedAt: null };
    return this.snapshot();
  }

  end(endedAt = Date.now()) {
    this.value = { ...this.value, state: 'ended', endedAt };
    return this.snapshot();
  }

  reset() {
    this.value = { state: 'idle', callId: null, peerUserId: null, type: null, startedAt: null, endedAt: null };
    return this.snapshot();
  }
}

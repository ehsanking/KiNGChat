import { describe, expect, it } from 'vitest';
import { CallStateMachine } from '@/lib/webrtc/call-state';

describe('CallStateMachine', () => {
  it('moves through ringing -> connected -> ended -> idle', () => {
    const machine = new CallStateMachine();
    expect(machine.snapshot().state).toBe('idle');

    machine.ring('call-1', 'user-2', 'voice');
    expect(machine.snapshot().state).toBe('ringing');

    machine.connect(1000);
    expect(machine.snapshot().state).toBe('connected');
    expect(machine.snapshot().startedAt).toBe(1000);

    machine.end(2000);
    expect(machine.snapshot().state).toBe('ended');
    expect(machine.snapshot().endedAt).toBe(2000);

    machine.reset();
    expect(machine.snapshot().state).toBe('idle');
  });
});

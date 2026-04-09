import { describe, expect, it } from 'vitest';
import { stopMediaStream } from '@/lib/webrtc/media-manager';

describe('media manager', () => {
  it('stops all tracks safely', () => {
    let stopped = 0;
    const stream = {
      getTracks() {
        return [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }];
      },
    } as unknown as MediaStream;

    stopMediaStream(stream);
    expect(stopped).toBe(2);
  });

  it('is a no-op for null stream', () => {
    expect(() => stopMediaStream(null)).not.toThrow();
  });
});

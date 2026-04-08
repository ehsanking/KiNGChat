import { describe, expect, it, vi } from 'vitest';
import { AudioRecorder } from '@/lib/audio-recorder';

describe('audio recorder', () => {
  it('handles permission denied', async () => {
    const recorder = new AudioRecorder({
      getUserMedia: vi.fn(async () => { throw new Error('denied'); }),
      MediaRecorderCtor: class {} as unknown as typeof MediaRecorder,
    });
    await expect(recorder.checkPermission()).resolves.toBe('denied');
  });

  it('returns unsupported when APIs are unavailable', async () => {
    const recorder = new AudioRecorder(undefined as never);
    (recorder as unknown as { deps: unknown }).deps = null;
    await expect(recorder.checkPermission()).resolves.toBe('unsupported');
  });
});

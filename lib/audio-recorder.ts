export const MAX_VOICE_MESSAGE_SECONDS = 5 * 60;

export type RecordedVoiceMessage = {
  blob: Blob;
  durationSeconds: number;
  waveform: number[];
};

export type RecorderPermissionResult = 'granted' | 'denied' | 'unsupported';

type MediaDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorderCtor: typeof MediaRecorder;
};

const defaultDeps = (): MediaDeps | null => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return null;
  if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') return null;
  return { getUserMedia: navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices), MediaRecorderCtor: window.MediaRecorder };
};

export class AudioRecorder {
  private deps: MediaDeps | null;
  private chunks: Blob[] = [];
  private waveform: number[] = [];
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private startTs = 0;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps?: MediaDeps) {
    this.deps = deps ?? defaultDeps();
  }

  async checkPermission(): Promise<RecorderPermissionResult> {
    if (!this.deps) return 'unsupported';
    try {
      const stream = await this.deps.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return 'granted';
    } catch {
      return 'denied';
    }
  }

  async start(): Promise<void> {
    if (!this.deps) throw new Error('Audio recording is not supported on this device.');
    this.stream = await this.deps.getUserMedia({ audio: true });
    this.chunks = [];
    this.waveform = [];
    this.startTs = Date.now();

    const recorder = new this.deps.MediaRecorderCtor(this.stream, { mimeType: 'audio/webm;codecs=opus' });
    this.mediaRecorder = recorder;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    recorder.start(250);
    this.sampleTimer = setInterval(() => {
      if (!this.stream) return;
      this.waveform.push(Math.random());
      if (this.waveform.length > MAX_VOICE_MESSAGE_SECONDS * 10) {
        this.waveform = this.waveform.slice(-MAX_VOICE_MESSAGE_SECONDS * 10);
      }
      if ((Date.now() - this.startTs) / 1000 >= MAX_VOICE_MESSAGE_SECONDS) {
        void this.stop();
      }
    }, 100);
  }

  async stop(): Promise<RecordedVoiceMessage> {
    const recorder = this.mediaRecorder;
    if (!recorder) {
      return { blob: new Blob([], { type: 'audio/webm' }), durationSeconds: 0, waveform: [] };
    }

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      if (recorder.state !== 'inactive') recorder.stop();
      else resolve();
    });

    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.mediaRecorder = null;

    const durationSeconds = Math.min(MAX_VOICE_MESSAGE_SECONDS, (Date.now() - this.startTs) / 1000);
    return {
      blob: new Blob(this.chunks, { type: 'audio/webm;codecs=opus' }),
      durationSeconds,
      waveform: this.waveform,
    };
  }
}

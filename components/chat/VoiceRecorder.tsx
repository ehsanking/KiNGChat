"use client";

import { useMemo, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { AudioRecorder, type RecordedVoiceMessage } from '@/lib/audio-recorder';

type VoiceRecorderProps = {
  onRecorded: (recording: RecordedVoiceMessage) => Promise<void> | void;
};

export default function VoiceRecorder({ onRecorded }: VoiceRecorderProps) {
  const recorder = useMemo(() => new AudioRecorder(), []);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
      onClick={async () => {
        if (!recording) {
          setRecording(true);
          setSeconds(0);
          await recorder.start();
          const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
          (window as Window & { __elaheVoiceTimer?: ReturnType<typeof setInterval> }).__elaheVoiceTimer = timer;
          return;
        }

        setRecording(false);
        const timer = (window as Window & { __elaheVoiceTimer?: ReturnType<typeof setInterval> }).__elaheVoiceTimer;
        if (timer) clearInterval(timer);
        const result = await recorder.stop();
        await onRecorded(result);
      }}
      aria-label={recording ? 'Stop voice recording' : 'Record voice message'}
    >
      {recording ? <Square className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4" />}
      <span>{recording ? `Recording ${seconds}s` : 'Voice'}</span>
    </button>
  );
}

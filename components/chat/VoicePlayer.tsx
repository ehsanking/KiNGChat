"use client";

import { useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';

type VoicePlayerProps = {
  fileUrl: string;
  durationSeconds?: number | null;
  waveformData?: string | null;
  onPlayed?: () => void;
};

export default function VoicePlayer({ fileUrl, durationSeconds, waveformData, onPlayed }: VoicePlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const waveform = useMemo(() => {
    try {
      const parsed = JSON.parse(waveformData || '[]');
      return Array.isArray(parsed) ? parsed.slice(0, 40) : [];
    } catch {
      return [];
    }
  }, [waveformData]);

  return (
    <div className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-100">
      <div className="flex items-center gap-2">
        <audio
          src={fileUrl}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            onPlayed?.();
          }}
          controls
          className="hidden"
          id={`voice-${fileUrl}`}
        />
        <button
          type="button"
          className="rounded-md border border-zinc-600 px-2 py-1"
          onClick={() => {
            const audio = document.getElementById(`voice-${fileUrl}`) as HTMLAudioElement | null;
            if (!audio) return;
            audio.playbackRate = speed;
            if (audio.paused) void audio.play(); else audio.pause();
          }}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="flex h-6 items-end gap-0.5" aria-hidden="true">
          {waveform.map((v, i) => <span key={i} className="w-1 rounded-sm bg-brand-gold/80" style={{ height: `${Math.max(10, Math.round((Number(v) || 0) * 20))}px` }} />)}
        </div>
        <span>{durationSeconds ? `${durationSeconds.toFixed(1)}s` : '0.0s'}</span>
        <select
          className="rounded-md border border-zinc-600 bg-zinc-800 px-1 py-0.5"
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
        >
          <option value={1}>1x</option>
          <option value={1.5}>1.5x</option>
          <option value={2}>2x</option>
        </select>
      </div>
    </div>
  );
}

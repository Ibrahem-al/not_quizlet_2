import { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isSoundMuted, setSoundMuted, playSound } from '@/lib/gameSounds';

/** Mute/unmute toggle for the synthesized game sounds. */
export function SoundToggle() {
  const [muted, setMuted] = useState(isSoundMuted);

  return (
    <button
      onClick={() => {
        const next = !muted;
        setSoundMuted(next);
        setMuted(next);
        if (!next) playSound('click');
      }}
      className="flex items-center justify-center w-9 h-9 rounded-lg cursor-pointer transition-colors"
      style={{ background: 'transparent', border: 'none', color: 'var(--color-text-secondary)' }}
      title={muted ? 'Unmute game sounds' : 'Mute game sounds'}
      aria-label={muted ? 'Unmute game sounds' : 'Mute game sounds'}
      aria-pressed={!muted}
    >
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}

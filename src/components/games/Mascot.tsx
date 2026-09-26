import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';

// ============================================================
// Mascot — the shared game character. A friendly blob rendered as
// self-contained SVG (no image assets), with per-game accessories
// and animated moods. Each game gives it a name and a color so the
// character reads as that game's own.
// ============================================================

export type MascotMood = 'idle' | 'happy' | 'sad' | 'worried' | 'celebrate';
export type MascotAccessory = 'hardhat' | 'helmet' | 'tufts' | 'headband' | 'none';

interface MascotProps {
  mood: MascotMood;
  /** Body fill — pick a saturated, friendly color per game. */
  color: string;
  accessory?: MascotAccessory;
  size?: number;
  /** Mirror horizontally (e.g. facing a tower on the left). */
  flip?: boolean;
  className?: string;
}

/** Per-mood body animation. Kept subtle so it loops without distracting. */
function bodyAnimation(mood: MascotMood, reduce: boolean): TargetAndTransition {
  if (reduce) return {};
  switch (mood) {
    case 'happy':
      return { y: [0, -10, 0], transition: { duration: 0.5, times: [0, 0.4, 1] } };
    case 'celebrate':
      return {
        y: [0, -14, 0],
        rotate: [0, -6, 6, 0],
        transition: { duration: 0.7, repeat: Infinity, repeatDelay: 0.15 },
      };
    case 'worried':
      return { x: [0, -2, 2, -2, 0], transition: { duration: 0.35, repeat: Infinity, repeatDelay: 0.4 } };
    case 'sad':
      return { y: 4, rotate: 0, transition: { duration: 0.4 } };
    default:
      return { y: [0, -3, 0], transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } };
  }
}

export function Mascot({ mood, color, accessory = 'none', size = 96, flip = false, className }: MascotProps) {
  const reduce = useReducedMotion() ?? false;
  const starEyes = mood === 'celebrate';
  const sadFace = mood === 'sad';
  const worried = mood === 'worried';
  const bigSmile = mood === 'happy' || mood === 'celebrate';

  return (
    <motion.svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      style={{ overflow: 'visible', transform: flip ? 'scaleX(-1)' : undefined }}
      animate={bodyAnimation(mood, reduce)}
      aria-hidden="true"
    >
      {/* soft ground shadow */}
      <ellipse cx="60" cy="112" rx="30" ry="6" fill="rgba(0,0,0,0.15)" />

      {/* arms behind body */}
      <motion.g
        animate={
          reduce
            ? {}
            : mood === 'celebrate' || mood === 'happy'
              ? { rotate: [0, -18, 0], transition: { duration: 0.6, repeat: mood === 'celebrate' ? Infinity : 0 } }
              : {}
        }
        style={{ originX: '60px', originY: '80px' }}
      >
        <ellipse
          cx="18" cy={bigSmile ? 62 : sadFace ? 88 : 78} rx="9" ry="16"
          fill={color}
          transform={`rotate(${bigSmile ? -35 : sadFace ? 10 : -12} 18 ${bigSmile ? 62 : 78})`}
        />
        <ellipse
          cx="102" cy={bigSmile ? 62 : sadFace ? 88 : 78} rx="9" ry="16"
          fill={color}
          transform={`rotate(${bigSmile ? 35 : sadFace ? -10 : 12} 102 ${bigSmile ? 62 : 78})`}
        />
      </motion.g>

      {/* body */}
      <path
        d="M60 14 C88 14 104 34 104 62 C104 92 86 108 60 108 C34 108 16 92 16 62 C16 34 32 14 60 14 Z"
        fill={color}
      />
      {/* belly highlight */}
      <ellipse cx="60" cy="78" rx="26" ry="20" fill="rgba(255,255,255,0.22)" />

      {/* eyes */}
      {starEyes ? (
        <g fill="#ffd23e" stroke="#e8a500" strokeWidth="1">
          <path d="M44 46 l2.8 5.7 6.2.9 -4.5 4.4 1 6.2 -5.5-2.9 -5.5 2.9 1-6.2 -4.5-4.4 6.2-.9 Z" />
          <path d="M76 46 l2.8 5.7 6.2.9 -4.5 4.4 1 6.2 -5.5-2.9 -5.5 2.9 1-6.2 -4.5-4.4 6.2-.9 Z" />
        </g>
      ) : (
        <g>
          <ellipse cx="44" cy="52" rx="9" ry={sadFace ? 8 : 10.5} fill="#ffffff" />
          <ellipse cx="76" cy="52" rx="9" ry={sadFace ? 8 : 10.5} fill="#ffffff" />
          <circle cx={worried ? 42 : 45} cy="54" r="4.4" fill="#1f2430" />
          <circle cx={worried ? 74 : 77} cy="54" r="4.4" fill="#1f2430" />
          <circle cx={worried ? 43.5 : 46.5} cy="52.5" r="1.4" fill="#ffffff" />
          <circle cx={worried ? 75.5 : 78.5} cy="52.5" r="1.4" fill="#ffffff" />
          {/* blink */}
          <g className="mascot-blink">
            <rect x="34" y="41" width="20" height="22" rx="10" fill={color} />
            <rect x="66" y="41" width="20" height="22" rx="10" fill={color} />
          </g>
          {sadFace && (
            <g stroke={color} strokeWidth="5" strokeLinecap="round" fill="none">
              <path d="M35 44 q9 -5 18 -1" />
              <path d="M67 43 q9 -4 18 1" />
            </g>
          )}
        </g>
      )}

      {/* cheeks */}
      {bigSmile && (
        <g fill="rgba(255,255,255,0.35)">
          <ellipse cx="33" cy="66" rx="6" ry="4" />
          <ellipse cx="87" cy="66" rx="6" ry="4" />
        </g>
      )}

      {/* mouth */}
      {bigSmile ? (
        <path d="M46 74 Q60 90 74 74 Q60 82 46 74 Z" fill="#1f2430" />
      ) : sadFace ? (
        <path d="M48 84 Q60 74 72 84" stroke="#1f2430" strokeWidth="4" strokeLinecap="round" fill="none" />
      ) : worried ? (
        <path d="M48 80 q6 -4 8 0 q6 4 8 0 q6 -4 8 0" stroke="#1f2430" strokeWidth="3.6" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M50 78 Q60 86 70 78" stroke="#1f2430" strokeWidth="4" strokeLinecap="round" fill="none" />
      )}

      {/* sweat drop when worried */}
      {worried && (
        <motion.path
          d="M96 34 q6 8 0 12 q-6 -4 0 -12 Z"
          fill="#7cc4ff"
          animate={reduce ? {} : { y: [0, 6], opacity: [1, 0.4], transition: { duration: 0.9, repeat: Infinity } }}
        />
      )}

      {/* accessories */}
      {accessory === 'hardhat' && (
        <g>
          <path d="M34 26 Q60 4 86 26 L86 30 L34 30 Z" fill="#ffd23e" stroke="#e8a500" strokeWidth="2" />
          <rect x="28" y="28" width="64" height="7" rx="3.5" fill="#ffd23e" stroke="#e8a500" strokeWidth="2" />
          <rect x="55" y="10" width="10" height="10" rx="3" fill="#ffd23e" stroke="#e8a500" strokeWidth="2" />
        </g>
      )}
      {accessory === 'helmet' && (
        <g>
          <path d="M30 32 Q60 2 90 32 L90 36 Q60 28 30 36 Z" fill="#ff5252" stroke="#c62828" strokeWidth="2" />
          <rect x="52" y="8" width="16" height="6" rx="3" fill="#ffffff" opacity="0.85" />
        </g>
      )}
      {accessory === 'tufts' && (
        <g fill={color}>
          <path d="M30 26 Q26 8 42 16 Q36 20 38 28 Z" />
          <path d="M90 26 Q94 8 78 16 Q84 20 82 28 Z" />
          <path d="M52 34 Q60 24 68 34 Q60 30 52 34 Z" fill="#f2b134" />
        </g>
      )}
      {accessory === 'headband' && (
        <g>
          <rect x="26" y="24" width="68" height="9" rx="4.5" fill="#ff5252" />
          <circle cx="60" cy="28" r="4" fill="#ffd23e" />
        </g>
      )}
    </motion.svg>
  );
}

// The blink animation lives in a tiny injected stylesheet so every Mascot
// shares one rule; eyelids are body-colored rects scaled from the top.
const BLINK_CSS = `
.mascot-blink { transform-origin: 60px 44px; transform: scaleY(0); animation: mascot-blink 4.2s infinite; }
@keyframes mascot-blink { 0%, 94%, 100% { transform: scaleY(0); } 96%, 98% { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .mascot-blink { animation: none; } }
`;

if (typeof document !== 'undefined' && !document.getElementById('mascot-blink-style')) {
  const style = document.createElement('style');
  style.id = 'mascot-blink-style';
  style.textContent = BLINK_CSS;
  document.head.appendChild(style);
}

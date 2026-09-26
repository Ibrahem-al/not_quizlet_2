import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, Lock, ScanSearch, X } from 'lucide-react';
import type { ModeProps } from '@/components/modes/registry';
import type { AnswerDirection, Card, QuestionType } from '@/types';
import { fairRepeatCards, normalizeAnswer, shuffleArray, stripHtml } from '@/lib/utils';
import { sanitizeHtml } from '@/lib/sanitize';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { buildGameQuestion, gradeGameAnswer, type GameQuestion } from '@/lib/gameQuestions';
import { submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import { Button } from '@/components/ui/Button';
import { Mascot, type MascotMood } from '@/components/games/Mascot';
import { ScorePopups } from '@/components/games/ScorePopup';
import {
  ChoicePills,
  ComboMeter,
  Countdown,
  EscBanner,
  GameTopBar,
  PlayButton,
  QuestionPanel,
  ResultsPanel,
  ScoreCounter,
  SetupSection,
  type Feedback,
} from '@/components/games/GameKit';
import {
  TILE_COLORS,
  celebrate,
  comboMultiplier,
  formatMultiplier,
  useAnswerKeys,
  useEscToQuit,
  usePopups,
} from '@/components/games/gameLogic';
import './MysteryPictureMode.css';

// Gallery art — fixed colors, independent of the app theme.
const ART = {
  wallInk: '#f4ecd8',
  wallInkSoft: '#c5d3d8',
  brass: '#d9ad55',
  brassEdge: '#9d6d22',
  brassInk: '#3d2a08',
  accent: '#e0703a',
  accentEdge: '#a84d1f',
  mascot: '#7fb86a',
};

const BASE_POINTS = 60;
const WRONG_GUESS_COST = 100;
/** Questions to answer before guessing unlocks after a wrong guess. */
const GUESS_LOCK = 3;

// ============================================================
// Built-in picture library: small illustrated scenes, each with
// look-alike decoys so a half-covered picture stays a real guess.
// ============================================================

type SceneArt = () => ReactNode;

const svgProps = {
  viewBox: '0 0 200 200',
  width: '100%',
  height: '100%',
  preserveAspectRatio: 'xMidYMid slice',
  'aria-hidden': true,
} as const;

const Lighthouse: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#9fd3f0" />
    <circle cx="160" cy="40" r="16" fill="#fff1b8" />
    <path d="M100 58 L20 30 L20 70 Z" fill="#fff6c9" opacity="0.7" />
    <path d="M100 58 L180 88 L180 118 Z" fill="#fff6c9" opacity="0.5" />
    <rect y="150" width="200" height="50" fill="#2e7db5" />
    <path d="M0 158 Q25 150 50 158 T100 158 T150 158 T200 158 V166 H0 Z" fill="#5aa6d6" />
    <path d="M40 178 L70 150 L130 150 L165 178 Z" fill="#6b6259" />
    <path d="M80 150 L86 72 L114 72 L120 150 Z" fill="#fbfbf7" />
    <path d="M84 126 L116 126 L117.5 140 L82.5 140 Z" fill="#d93843" />
    <path d="M85.5 100 L114.5 100 L115.8 113 L84.2 113 Z" fill="#d93843" />
    <path d="M87 78 L113 78 L113.8 88 L86.2 88 Z" fill="#d93843" />
    <rect x="92" y="136" width="16" height="14" rx="7" fill="#4a3b35" />
    <rect x="82" y="66" width="36" height="7" fill="#2b2320" />
    <rect x="89" y="48" width="22" height="18" fill="#ffe27a" stroke="#2b2320" strokeWidth="3" />
    <path d="M85 48 L100 34 L115 48 Z" fill="#d93843" stroke="#2b2320" strokeWidth="2" />
  </svg>
);

const Volcano: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#f7c98f" />
    <circle cx="40" cy="42" r="14" fill="#fff0c2" />
    <circle cx="112" cy="40" r="18" fill="#8f8a86" />
    <circle cx="96" cy="28" r="14" fill="#a39e99" />
    <circle cx="124" cy="22" r="12" fill="#b3aeaa" />
    <path d="M0 170 L70 70 L130 70 L200 170 Z" fill="#6e4a3a" />
    <path d="M70 70 L130 70 L118 86 Q100 80 82 86 Z" fill="#f05a2a" />
    <path d="M86 84 Q90 110 80 130 Q92 118 96 100 Q100 120 104 140 Q108 110 112 86 Z" fill="#ff9b2b" />
    <path d="M100 58 Q96 66 100 72 Q104 66 100 58 Z" fill="#ffcf3d" />
    <path d="M40 130 L60 110 L75 125 Z" fill="#57392c" />
    <path d="M140 118 L155 105 L170 128 Z" fill="#57392c" />
    <rect y="170" width="200" height="30" fill="#4d7a3a" />
    <path d="M0 176 Q50 168 100 176 T200 176 V200 H0 Z" fill="#3f6630" />
  </svg>
);

const Rocket: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#1b2a52" />
    {[
      [20, 30], [50, 70], [170, 40], [150, 110], [30, 140], [180, 160], [70, 20], [130, 20], [20, 90],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2 : 1.3} fill="#fff6c9" />
    ))}
    <circle cx="165" cy="175" r="40" fill="#c77b4a" />
    <circle cx="150" cy="165" r="6" fill="#a8603a" />
    <path d="M100 22 Q124 52 122 120 L78 120 Q76 52 100 22 Z" fill="#f4f4f0" />
    <path d="M100 22 Q112 36 117 52 L83 52 Q88 36 100 22 Z" fill="#d93843" />
    <circle cx="100" cy="78" r="12" fill="#6fc3ea" stroke="#9aa3ad" strokeWidth="4" />
    <path d="M78 96 L58 132 L80 124 Z" fill="#d93843" />
    <path d="M122 96 L142 132 L120 124 Z" fill="#d93843" />
    <rect x="86" y="120" width="28" height="8" fill="#9aa3ad" />
    <path d="M88 128 Q100 176 112 128 Z" fill="#ffb020" />
    <path d="M94 128 Q100 156 106 128 Z" fill="#fff1b8" />
  </svg>
);

const Castle: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#bfe3f5" />
    <ellipse cx="50" cy="40" rx="22" ry="8" fill="#fff" />
    <ellipse cx="150" cy="30" rx="18" ry="7" fill="#fff" />
    <path d="M0 160 Q100 130 200 160 V200 H0 Z" fill="#6cbf73" />
    <rect x="55" y="92" width="90" height="62" fill="#b9b3ab" />
    {[55, 73, 91, 109, 127].map((x) => (
      <rect key={x} x={x} y="84" width="10" height="10" fill="#b9b3ab" />
    ))}
    <rect x="38" y="72" width="26" height="82" fill="#a59e95" />
    <rect x="136" y="72" width="26" height="82" fill="#a59e95" />
    <path d="M34 74 L51 40 L68 74 Z" fill="#d93843" />
    <path d="M132 74 L149 40 L166 74 Z" fill="#d93843" />
    <line x1="51" y1="40" x2="51" y2="26" stroke="#2b2320" strokeWidth="2" />
    <path d="M51 26 L64 30 L51 34 Z" fill="#f2a81d" />
    <line x1="149" y1="40" x2="149" y2="26" stroke="#2b2320" strokeWidth="2" />
    <path d="M149 26 L162 30 L149 34 Z" fill="#f2a81d" />
    <path d="M86 154 L86 128 Q100 112 114 128 L114 154 Z" fill="#5a3b28" />
    <rect x="46" y="96" width="10" height="16" rx="5" fill="#3a3530" />
    <rect x="144" y="96" width="10" height="16" rx="5" fill="#3a3530" />
    <rect x="94" y="100" width="12" height="14" rx="6" fill="#3a3530" />
  </svg>
);

const Whale: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#1f6fa8" />
    <rect width="200" height="70" fill="#8fd0f2" />
    <path d="M0 70 Q25 62 50 70 T100 70 T150 70 T200 70 V80 H0 Z" fill="#3b8cc4" />
    <path d="M88 60 Q84 40 72 34 M88 60 Q90 38 100 30 M88 60 Q96 44 110 42" stroke="#e8f6ff" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M30 120 Q40 72 100 76 Q150 80 160 118 Q176 112 188 96 Q186 124 172 132 Q180 146 190 154 Q170 150 160 134 Q140 170 80 164 Q34 160 30 120 Z" fill="#4a6f8f" />
    <path d="M40 132 Q70 160 130 152 Q110 168 72 162 Q46 156 40 132 Z" fill="#dbe7ee" />
    {[60, 72, 84, 96, 108].map((x) => (
      <line key={x} x1={x} y1={146 + (x - 60) / 8} x2={x + 6} y2={158} stroke="#a9bccb" strokeWidth="2" />
    ))}
    <circle cx="62" cy="116" r="5" fill="#fff" />
    <circle cx="63" cy="117" r="2.6" fill="#1a1f2b" />
    <path d="M90 136 Q100 150 118 140 Q104 142 90 136 Z" fill="#35536d" />
    <circle cx="150" cy="186" r="3" fill="#8fd0f2" />
    <circle cx="30" cy="180" r="2" fill="#8fd0f2" />
  </svg>
);

const Balloon: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#a8dcf5" />
    <ellipse cx="40" cy="150" rx="26" ry="9" fill="#fff" />
    <ellipse cx="165" cy="60" rx="22" ry="8" fill="#fff" />
    <path d="M0 185 Q60 170 120 182 T200 178 V200 H0 Z" fill="#6cbf73" />
    <path d="M100 20 C58 20 46 60 60 92 C70 112 86 124 92 136 L108 136 C114 124 130 112 140 92 C154 60 142 20 100 20 Z" fill="#f2a81d" />
    <path d="M100 20 C84 22 76 60 84 92 C88 110 92 124 94 136 L106 136 C108 124 112 110 116 92 C124 60 116 22 100 20 Z" fill="#d93843" />
    <path d="M100 20 C95 30 94 70 97 100 L99 136 L101 136 L103 100 C106 70 105 30 100 20 Z" fill="#fbfbf7" />
    <path d="M52 70 Q100 82 148 70" stroke="#0b74d6" strokeWidth="5" fill="none" />
    <line x1="92" y1="136" x2="90" y2="152" stroke="#5a3b28" strokeWidth="2" />
    <line x1="108" y1="136" x2="110" y2="152" stroke="#5a3b28" strokeWidth="2" />
    <rect x="86" y="150" width="28" height="18" rx="3" fill="#a8703a" />
    <path d="M86 156 H114 M86 162 H114" stroke="#7d5027" strokeWidth="1.5" />
  </svg>
);

const Cactus: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#ffd9a0" />
    <circle cx="150" cy="50" r="22" fill="#ff9b3d" />
    <path d="M0 120 L40 96 L70 112 L110 90 L150 110 L200 96 V200 H0 Z" fill="#e6a86b" />
    <rect y="150" width="200" height="50" fill="#f0c88a" />
    <path d="M86 170 L86 60 Q100 40 114 60 L114 170 Z" fill="#3f9a57" />
    <path d="M86 118 L64 118 Q52 118 52 104 L52 80 Q60 70 68 80 L68 102 L86 102 Z" fill="#3f9a57" />
    <path d="M114 100 L134 100 Q146 100 146 86 L146 68 Q138 58 130 68 L130 84 L114 84 Z" fill="#3f9a57" />
    <path d="M94 66 V166 M106 66 V166" stroke="#2f7a44" strokeWidth="2.5" />
    <circle cx="100" cy="50" r="7" fill="#e86f8a" />
    <circle cx="100" cy="50" r="3" fill="#ffd23e" />
    <ellipse cx="100" cy="172" rx="40" ry="6" fill="#d9a766" />
    <circle cx="40" cy="178" r="6" fill="#b88a55" />
    <circle cx="165" cy="182" r="4" fill="#b88a55" />
  </svg>
);

const Robot: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#3fb8a9" />
    <rect y="168" width="200" height="32" fill="#2d8a7e" />
    <line x1="100" y1="22" x2="100" y2="40" stroke="#4a4f5a" strokeWidth="4" />
    <circle cx="100" cy="20" r="7" fill="#e5484d" />
    <rect x="66" y="40" width="68" height="52" rx="12" fill="#c9d1d9" />
    <rect x="74" y="52" width="52" height="24" rx="10" fill="#1d2433" />
    <circle cx="89" cy="64" r="6" fill="#7df0ff" />
    <circle cx="111" cy="64" r="6" fill="#7df0ff" />
    <rect x="88" y="82" width="24" height="4" rx="2" fill="#6d7684" />
    <rect x="58" y="96" width="84" height="66" rx="10" fill="#aeb8c3" />
    <rect x="80" y="110" width="40" height="28" rx="4" fill="#f2a81d" />
    <circle cx="90" cy="148" r="4" fill="#e5484d" />
    <circle cx="110" cy="148" r="4" fill="#23875a" />
    <rect x="36" y="100" width="16" height="48" rx="8" fill="#8c97a3" />
    <rect x="148" y="100" width="16" height="48" rx="8" fill="#8c97a3" />
    <rect x="72" y="162" width="20" height="14" fill="#6d7684" />
    <rect x="108" y="162" width="20" height="14" fill="#6d7684" />
  </svg>
);

const Sailboat: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#ffd8b0" />
    <circle cx="48" cy="108" r="22" fill="#ff8a4c" />
    <rect y="120" width="200" height="80" fill="#2e7db5" />
    <path d="M0 132 Q20 126 40 132 T80 132 T120 132 T160 132 T200 132 V140 H0 Z" fill="#5aa6d6" />
    <line x1="112" y1="26" x2="112" y2="134" stroke="#5a3b28" strokeWidth="4" />
    <path d="M116 30 L116 124 L168 124 Z" fill="#fbfbf7" />
    <path d="M108 40 L108 124 L66 124 Z" fill="#d93843" />
    <path d="M112 26 L128 30 L112 34 Z" fill="#f2a81d" />
    <path d="M56 130 L170 130 L154 152 L72 152 Z" fill="#7a4a2a" />
    <path d="M60 136 L166 136" stroke="#fbfbf7" strokeWidth="3" />
    <path d="M20 170 Q30 166 40 170 M140 180 Q150 176 160 180 M90 186 Q100 182 110 186" stroke="#8fc7ea" strokeWidth="3" fill="none" strokeLinecap="round" />
  </svg>
);

const Owl: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#2d2a5a" />
    <circle cx="156" cy="42" r="20" fill="#fff1b8" />
    <circle cx="164" cy="36" r="18" fill="#2d2a5a" />
    {[
      [30, 30], [70, 18], [110, 40], [40, 80], [180, 110], [20, 130],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="1.6" fill="#fff6c9" />
    ))}
    <path d="M0 162 Q100 150 200 164 L200 176 Q100 164 0 174 Z" fill="#6b4a2e" />
    <path d="M62 150 Q56 100 70 76 L64 50 L84 66 Q100 60 116 66 L136 50 L130 76 Q144 100 138 150 Q100 170 62 150 Z" fill="#9b6b43" />
    <path d="M78 118 Q100 104 122 118 Q124 146 100 154 Q76 146 78 118 Z" fill="#e4c79a" />
    {[88, 100, 112].map((x) => (
      <path key={x} d={`M${x - 4} 128 Q${x} 134 ${x + 4} 128`} stroke="#b08a5a" strokeWidth="2" fill="none" />
    ))}
    <circle cx="84" cy="90" r="15" fill="#fff6dd" />
    <circle cx="116" cy="90" r="15" fill="#fff6dd" />
    <circle cx="84" cy="90" r="7" fill="#1a1f2b" />
    <circle cx="116" cy="90" r="7" fill="#1a1f2b" />
    <circle cx="86" cy="88" r="2" fill="#fff" />
    <circle cx="118" cy="88" r="2" fill="#fff" />
    <path d="M100 98 L94 106 L100 112 L106 106 Z" fill="#f2a81d" />
    <path d="M84 156 L80 164 M92 158 L90 166 M108 158 L110 166 M116 156 L120 164" stroke="#f2a81d" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

const Windmill: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#c8e8f7" />
    <ellipse cx="160" cy="40" rx="20" ry="7" fill="#fff" />
    <path d="M0 150 Q60 130 120 146 T200 140 V200 H0 Z" fill="#8cc56a" />
    <rect y="170" width="200" height="30" fill="#e8c14a" />
    {[10, 30, 50, 70, 130, 150, 170, 190].map((x) => (
      <path key={x} d={`M${x} 170 L${x} 162`} stroke="#6aa04a" strokeWidth="3" />
    ))}
    <path d="M78 160 L86 78 L114 78 L122 160 Z" fill="#b5694a" />
    <path d="M82 80 L100 58 L118 80 Z" fill="#5a3b28" />
    <rect x="93" y="136" width="14" height="24" rx="6" fill="#4a2e1e" />
    <g transform="rotate(20 100 76)">
      <rect x="96" y="14" width="8" height="62" fill="#f4ecd8" stroke="#7a5a3a" strokeWidth="2" />
      <rect x="96" y="76" width="8" height="62" fill="#f4ecd8" stroke="#7a5a3a" strokeWidth="2" />
      <rect x="38" y="72" width="62" height="8" fill="#f4ecd8" stroke="#7a5a3a" strokeWidth="2" />
      <rect x="100" y="72" width="62" height="8" fill="#f4ecd8" stroke="#7a5a3a" strokeWidth="2" />
    </g>
    <circle cx="100" cy="76" r="6" fill="#4a2e1e" />
  </svg>
);

const Penguin: SceneArt = () => (
  <svg {...svgProps}>
    <rect width="200" height="200" fill="#bfe6f7" />
    <path d="M0 120 L40 80 L70 104 L120 70 L160 100 L200 84 V200 H0 Z" fill="#e8f5fb" />
    <rect y="160" width="200" height="40" fill="#f4fbff" />
    <ellipse cx="100" cy="112" rx="40" ry="56" fill="#1d2433" />
    <ellipse cx="100" cy="124" rx="28" ry="42" fill="#fbfbf7" />
    <circle cx="100" cy="70" r="30" fill="#1d2433" />
    <path d="M80 72 Q100 56 120 72 Q120 92 100 96 Q80 92 80 72 Z" fill="#fbfbf7" />
    <circle cx="91" cy="74" r="4" fill="#1d2433" />
    <circle cx="109" cy="74" r="4" fill="#1d2433" />
    <path d="M94 84 L106 84 L100 92 Z" fill="#f2a81d" />
    <path d="M60 100 Q48 130 58 150 Q66 130 66 110 Z" fill="#1d2433" />
    <path d="M140 100 Q152 130 142 150 Q134 130 134 110 Z" fill="#1d2433" />
    <ellipse cx="88" cy="168" rx="12" ry="5" fill="#f2a81d" />
    <ellipse cx="112" cy="168" rx="12" ry="5" fill="#f2a81d" />
  </svg>
);

interface LibraryPicture {
  id: string;
  name: string;
  decoys: string[];
  Art: SceneArt;
}

const LIBRARY: LibraryPicture[] = [
  { id: 'lighthouse', name: 'Lighthouse', decoys: ['Windmill', 'Clock tower', 'Water tower'], Art: Lighthouse },
  { id: 'volcano', name: 'Volcano', decoys: ['Mountain', 'Geyser', 'Campfire'], Art: Volcano },
  { id: 'rocket', name: 'Rocket', decoys: ['Satellite', 'Space station', 'Airplane'], Art: Rocket },
  { id: 'castle', name: 'Castle', decoys: ['Palace', 'Cathedral', 'Fort'], Art: Castle },
  { id: 'whale', name: 'Whale', decoys: ['Dolphin', 'Shark', 'Submarine'], Art: Whale },
  { id: 'balloon', name: 'Hot-air balloon', decoys: ['Blimp', 'Parachute', 'Kite'], Art: Balloon },
  { id: 'cactus', name: 'Cactus', decoys: ['Palm tree', 'Pineapple', 'Aloe plant'], Art: Cactus },
  { id: 'robot', name: 'Robot', decoys: ['Astronaut', 'Vending machine', 'Deep-sea diver'], Art: Robot },
  { id: 'sailboat', name: 'Sailboat', decoys: ['Canoe', 'Pirate ship', 'Ferry'], Art: Sailboat },
  { id: 'owl', name: 'Owl', decoys: ['Parrot', 'Eagle', 'Bat'], Art: Owl },
  { id: 'windmill', name: 'Windmill', decoys: ['Lighthouse', 'Barn', 'Wind turbine'], Art: Windmill },
  { id: 'penguin', name: 'Penguin', decoys: ['Puffin', 'Seal', 'Snowman'], Art: Penguin },
];

// ---------- Pictures from the set ----------

interface SetPicture {
  cardId: string;
  name: string;
  src: string;
}

const SAFE_SRC = /^(data:image\/|https?:\/\/|blob:|\/)/i;

function firstImageSrc(html: string): string | null {
  if (!html || !html.includes('<img')) return null;
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html');
  const src = doc.querySelector('img')?.getAttribute('src') ?? '';
  return SAFE_SRC.test(src) ? src : null;
}

/** Cards that can be the hidden picture: a text term plus an image somewhere. */
function findSetPictures(cards: Card[]): { pictures: SetPicture[]; names: string[] } {
  const names = [...new Set(cards.map((c) => stripHtml(c.term)).filter((t) => t.length > 0 && t.length <= 60))];
  const pictures: SetPicture[] = [];
  for (const card of cards) {
    const name = stripHtml(card.term);
    if (!name || name.length > 60) continue;
    const src =
      firstImageSrc(card.definition) ??
      firstImageSrc(card.term) ??
      (card.imageData && SAFE_SRC.test(card.imageData) ? card.imageData : null);
    if (src) pictures.push({ cardId: card.id, name, src });
  }
  return { pictures, names };
}

// ---------- Game model ----------

type Source = 'library' | 'set';

interface Picture {
  name: string;
  options: string[];
  art: ReactNode;
  /** Card whose questions would give the answer away. */
  cardId?: string;
}

interface GameConfig {
  tiles: 9 | 16 | 25;
  source: Source;
  questionTypes: QuestionType[];
  direction: AnswerDirection;
}

type Phase = 'config' | 'countdown' | 'game' | 'reveal' | 'done';

function buildQuestions(pool: Card[], all: Card[], groups: Map<string, Card[]>, cfg: GameConfig, offset: number): GameQuestion[] {
  return fairRepeatCards(pool, Math.max(20, pool.length)).map((card, i) =>
    buildGameQuestion(card, all, groups, cfg.questionTypes[(offset + i) % cfg.questionTypes.length], cfg.direction, offset + i),
  );
}

// ---------- Setup ----------

function ConfigScreen({
  canUseSet,
  onStart,
  onExit,
}: {
  canUseSet: boolean;
  onStart: (config: GameConfig) => void;
  onExit: () => void;
}) {
  const [tiles, setTiles] = useState<9 | 16 | 25>(16);
  const [source, setSource] = useState<Source>('library');
  const [types, setTypes] = useState<QuestionType[]>(['multiple-choice', 'true-false', 'written']);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const toggleType = (t: QuestionType) =>
    setTypes((prev) => (prev.includes(t) ? (prev.length > 1 ? prev.filter((x) => x !== t) : prev) : [...prev, t]));

  return (
    <div className="mp-wall min-h-[calc(100dvh-8rem)] px-4 py-8">
      <div className="max-w-xl mx-auto">
        <GameTopBar onExit={onExit} tone="dark" />
        <div className="mt-5 rounded-3xl overflow-hidden" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }}>
          <div className="flex items-center gap-4 p-5" style={{ background: '#223743' }}>
            <div className="mp-frame shrink-0" style={{ padding: 7 }}>
              <div className="mp-canvas grid grid-cols-3 gap-px" style={{ width: 66, height: 66, background: '#8e6a3a' }}>
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} style={{ background: i === 4 ? '#9fd3f0' : '#d8b784' }} />
                ))}
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="text-3xl font-extrabold" style={{ color: ART.wallInk, fontFamily: 'var(--font-display)' }}>
                Mystery Picture
              </h2>
              <p className="text-sm font-semibold" style={{ color: ART.wallInkSoft }}>
                Each right answer lifts a tile. Name the picture early for a big bonus.
              </p>
            </div>
          </div>
          <div className="p-6 flex flex-col gap-6" style={{ background: 'var(--color-surface)' }}>
            {canUseSet && (
              <SetupSection label="Picture">
                <ChoicePills
                  options={[
                    { value: 'library', label: 'Surprise painting' },
                    { value: 'set', label: 'A picture from this set' },
                  ]}
                  isSelected={(v) => v === source}
                  onToggle={setSource}
                  accent={ART.accent}
                />
              </SetupSection>
            )}
            <SetupSection label="Tiles">
              <ChoicePills
                options={[
                  { value: 9, label: '3 by 3' },
                  { value: 16, label: '4 by 4' },
                  { value: 25, label: '5 by 5' },
                ]}
                isSelected={(v) => v === tiles}
                onToggle={setTiles}
                accent={ART.accent}
              />
            </SetupSection>
            <SetupSection label="Question types">
              <ChoicePills
                options={[
                  { value: 'multiple-choice', label: 'Multiple choice' },
                  { value: 'true-false', label: 'True or false' },
                  { value: 'written', label: 'Written' },
                ]}
                isSelected={(v) => types.includes(v)}
                onToggle={toggleType}
                accent={ART.accent}
              />
            </SetupSection>
            <SetupSection label="Answer with">
              <ChoicePills
                options={[
                  { value: 'term-to-def', label: 'Definitions' },
                  { value: 'def-to-term', label: 'Terms' },
                  { value: 'both', label: 'Both' },
                ]}
                isSelected={(v) => v === direction}
                onToggle={setDirection}
                accent={ART.accent}
              />
            </SetupSection>
            <PlayButton color={ART.accent} onClick={() => onStart({ tiles, source: canUseSet ? source : 'library', questionTypes: types, direction })}>
              Start uncovering
            </PlayButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Scene ----------

function tileVariants(reduce: boolean): Variants {
  return {
    gone: (delay: number) =>
      reduce
        ? { opacity: 0, transition: { duration: 0.2, delay: delay / 3 } }
        : { rotateY: 100, rotateX: 18, y: 30, opacity: 0, transition: { duration: 0.55, ease: [0.4, 0, 0.7, 0.2], delay } },
  };
}

function Easel({
  picture,
  tiles,
  covered,
  revealed,
  mood,
  popups,
  onPopupDone,
}: {
  picture: Picture;
  tiles: number;
  covered: Set<number>;
  revealed: boolean;
  mood: MascotMood;
  popups: ReturnType<typeof usePopups>['popups'];
  onPopupDone: (id: number) => void;
}) {
  const reduce = !!useReducedMotion();
  const side = Math.round(Math.sqrt(tiles));
  return (
    <div className="relative flex flex-col items-center">
      <div className="mp-light" style={{ opacity: revealed ? 1 : 0.35 }} aria-hidden />
      <div className="mp-frame w-full" style={{ maxWidth: 360 }}>
        <div className="mp-canvas aspect-square w-full" role="img" aria-label={revealed ? `The picture: ${picture.name}` : `Hidden picture, ${covered.size} of ${tiles} tiles still covering it`}>
          <div className="absolute inset-0">{picture.art}</div>
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${side}, 1fr)`, gridTemplateRows: `repeat(${side}, 1fr)`, perspective: 600 }}
          >
            {Array.from({ length: tiles }, (_, i) => {
              const r = Math.floor(i / side);
              const c = i % side;
              return (
                <div key={i} className="relative">
                  {/* `custom` reaches exiting tiles, so the final reveal can ripple across the canvas. */}
                  <AnimatePresence custom={revealed ? (r + c) * 0.07 : 0}>
                    {covered.has(i) && (
                      <motion.div
                        className="mp-tile"
                        initial={false}
                        variants={tileVariants(reduce)}
                        exit="gone"
                        style={{ transformOrigin: 'left center' }}
                      >
                        <span className="text-xs font-extrabold tabular-nums opacity-60" style={{ fontFamily: 'var(--font-display)' }}>
                          {i + 1}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
          <ScorePopups popups={popups} onDone={onPopupDone} />
        </div>
      </div>
      <div className="relative mt-3 flex items-end gap-2 w-full justify-center" style={{ maxWidth: 360 }}>
        <div
          key={revealed ? 'named' : 'unknown'}
          className={revealed ? 'mp-plate-in' : undefined}
          style={{
            minWidth: 150,
            padding: '6px 14px',
            borderRadius: 6,
            textAlign: 'center',
            background: `linear-gradient(180deg, #f0cf7c, ${ART.brass})`,
            boxShadow: `inset 0 -3px 0 ${ART.brassEdge}, 0 4px 10px rgba(0,0,0,0.35)`,
            color: ART.brassInk,
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
          }}
          aria-live="polite"
        >
          {revealed ? picture.name : 'Untitled'}
        </div>
        <div className="absolute right-0 -bottom-1 hidden sm:block">
          <Mascot mood={mood} color={ART.mascot} accessory="tufts" size={58} />
        </div>
      </div>
    </div>
  );
}

function GuessPanel({
  options,
  onPick,
  onCancel,
}: {
  options: string[];
  onPick: (option: string) => void;
  onCancel: () => void;
}) {
  const reduce = !!useReducedMotion();
  return (
    <div>
      <p className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
        Guess the picture
      </p>
      <h3 className="text-2xl font-bold leading-snug mb-5" style={{ color: 'var(--color-text)' }}>
        What's under the tiles?
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {options.map((option, i) => {
          const c = TILE_COLORS[i % TILE_COLORS.length];
          return (
            <motion.button
              key={option}
              type="button"
              onClick={() => onPick(option)}
              whileHover={reduce ? undefined : { y: -3 }}
              whileTap={reduce ? undefined : { y: 2, scale: 0.98 }}
              className="flex items-center gap-3 text-left min-h-[60px] pl-3 pr-4 py-3 rounded-2xl cursor-pointer font-semibold focus-visible:outline-3 focus-visible:outline-offset-2"
              style={{ background: c.bg, color: c.text, border: 'none', boxShadow: `inset 0 -5px 0 ${c.edge}`, outlineColor: 'var(--color-primary)' }}
            >
              <span
                className="flex items-center justify-center w-7 h-7 rounded-lg text-sm font-extrabold shrink-0"
                style={{ background: 'rgba(0,0,0,0.18)', fontFamily: 'var(--font-display)' }}
                aria-hidden
              >
                {i + 1}
              </span>
              <span className="text-base leading-snug min-w-0 break-words">{option}</span>
            </motion.button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          A wrong guess costs {WRONG_GUESS_COST} points and locks guessing for {GUESS_LOCK} questions.
        </p>
        <Button variant="ghost" onClick={onCancel}>
          Not yet
        </Button>
      </div>
    </div>
  );
}

// ---------- Game ----------

export default function MysteryPictureMode({ cards, setId, exitUrl }: ModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);
  const setPictures = useMemo(() => findSetPictures(cards), [cards]);
  const canUseSet = setPictures.pictures.length > 0 && setPictures.names.length >= 4;

  const [phase, setPhase] = useState<Phase>('config');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [picture, setPicture] = useState<Picture | null>(null);
  const [pool, setPool] = useState<Card[]>([]);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [asked, setAsked] = useState(0);
  const [covered, setCovered] = useState<Set<number>>(new Set());

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [mood, setMood] = useState<MascotMood>('idle');

  const [guessing, setGuessing] = useState(false);
  const [guessLock, setGuessLock] = useState(0);
  const [wrongGuesses, setWrongGuesses] = useState(0);
  const [lockPulse, setLockPulse] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ guessed: boolean; coveredShare: number; bonus: number } | null>(null);
  const [best, setBest] = useState<ReturnType<typeof submitScore> | undefined>();
  const { popups, push, remove } = usePopups();

  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const playing = phase === 'game';
  const escArmed = useEscToQuit(phase !== 'config', playing, exit);
  const question = questions[index] ?? null;
  const tiles = config?.tiles ?? 16;

  useEffect(() => {
    if (phase === 'reveal' && outcome?.guessed) return celebrate(['#d9ad55', '#e0703a', '#7fb86a', '#f4ecd8']);
  }, [phase, outcome]);

  const start = (cfg: GameConfig) => {
    clearTimers();
    let pic: Picture;
    let questionPool = cards;
    if (cfg.source === 'set' && canUseSet) {
      const chosen = shuffleArray(setPictures.pictures)[0];
      const decoys = shuffleArray(setPictures.names.filter((n) => normalizeAnswer(n) !== normalizeAnswer(chosen.name))).slice(0, 3);
      pic = {
        name: chosen.name,
        options: shuffleArray([chosen.name, ...decoys]),
        art: <img src={chosen.src} alt="" className="w-full h-full object-cover" draggable={false} />,
        cardId: chosen.cardId,
      };
      // Keep the picture's own card out of the questions so they don't name it.
      if (cards.length > 2) questionPool = cards.filter((c) => c.id !== chosen.cardId);
    } else {
      const chosen = shuffleArray(LIBRARY)[0];
      pic = { name: chosen.name, options: shuffleArray([chosen.name, ...chosen.decoys]), art: <chosen.Art /> };
    }
    setConfig(cfg);
    setPicture(pic);
    setPool(questionPool);
    setQuestions(buildQuestions(questionPool, cards, groups, cfg, 0));
    setIndex(0);
    setAsked(1);
    setCovered(new Set(Array.from({ length: cfg.tiles }, (_, i) => i)));
    setScore(0);
    scoreRef.current = 0;
    setStreak(0);
    setMaxStreak(0);
    setCorrect(0);
    setAnswered(0);
    setFeedback(null);
    setSelected(null);
    setLastPoints(null);
    setMood('idle');
    setGuessing(false);
    setGuessLock(0);
    setWrongGuesses(0);
    setNotice(null);
    setOutcome(null);
    setBest(undefined);
    setPhase('countdown');
  };

  const endRound = (guessed: boolean, finalScore: number, coveredCount: number, bonus: number) => {
    if (!config) return;
    clearTimers();
    setGuessing(false);
    setOutcome({ guessed, coveredShare: coveredCount / config.tiles, bonus });
    setBest(submitScore('mystery-picture', setId, finalScore, `${config.source}-${config.tiles}`));
    setMood(guessed ? 'celebrate' : 'happy');
    setCovered(new Set());
    setPhase('reveal');
    playSound(guessed ? 'win' : 'match');
  };

  const advance = () => {
    if (!config) return;
    let next = index + 1;
    if (next >= questions.length) {
      const tail = questions.slice(-10);
      setQuestions([...tail, ...buildQuestions(pool, cards, groups, config, asked)]);
      next = tail.length;
    }
    setIndex(next);
    setAsked((a) => a + 1);
    setFeedback(null);
    setSelected(null);
    setLastPoints(null);
    setMood('idle');
  };

  const answer = (isRight: boolean) => {
    if (!config || feedback || !playing) return;
    setAnswered((a) => a + 1);
    setGuessLock((l) => Math.max(0, l - 1));
    setNotice(null);
    if (isRight) {
      const nextStreak = streak + 1;
      const mult = comboMultiplier(nextStreak);
      if (mult > comboMultiplier(streak)) {
        playSound('combo');
        push({ text: `${formatMultiplier(mult)} combo!`, color: '#ffc53d', x: 30, y: 16 });
      }
      const points = Math.round(BASE_POINTS * mult);
      const newScore = score + points;
      setScore(newScore);
      scoreRef.current = newScore;
      setStreak(nextStreak);
      setMaxStreak((m) => Math.max(m, nextStreak));
      setCorrect((c) => c + 1);
      setLastPoints(points);
      setFeedback('correct');
      setMood('happy');
      playSound('correct');
      later(() => playSound('flip'), 120);

      const left = [...covered];
      const gone = left[Math.floor(Math.random() * left.length)];
      const nextCovered = new Set(left.filter((i) => i !== gone));
      setCovered(nextCovered);
      const side = Math.round(Math.sqrt(config.tiles));
      push({ text: `+${points}`, color: '#fff', x: ((gone % side) + 0.3) / side * 100, y: (Math.floor(gone / side) + 0.3) / side * 100 });

      if (nextCovered.size === 0) {
        later(() => endRound(false, scoreRef.current, 0, 0), reduce ? 400 : 900);
      } else {
        later(() => advance(), reduce ? 500 : 950);
      }
    } else {
      playSound('wrong');
      setStreak(0);
      setFeedback('wrong');
      setLastPoints(null);
      setMood('sad');
    }
  };

  const onWritten = (text: string) => question && answer(gradeGameAnswer(question, { written: text }));
  const onOption = (option: string) => {
    if (!question || feedback) return;
    setSelected(option);
    answer(gradeGameAnswer(question, { option }));
  };
  const onTrueFalse = (tf: boolean) => question && answer(gradeGameAnswer(question, { tf }));
  useAnswerKeys(question, playing && !feedback && !guessing, onOption, onTrueFalse);

  const openGuess = () => {
    if (!playing) return;
    if (guessLock > 0) {
      setLockPulse((p) => p + 1);
      playSound('wrong');
      return;
    }
    playSound('click');
    setGuessing(true);
  };

  const makeGuess = (option: string) => {
    if (!picture || !config || !playing) return;
    if (normalizeAnswer(option) === normalizeAnswer(picture.name)) {
      const share = covered.size / config.tiles;
      const bonus = Math.round(100 + 900 * share);
      const newScore = score + bonus;
      setScore(newScore);
      scoreRef.current = newScore;
      push({ text: `+${bonus}`, color: '#ffe27a', x: 40, y: 40 });
      endRound(true, newScore, covered.size, bonus);
    } else {
      const newScore = Math.max(0, score - WRONG_GUESS_COST);
      setScore(newScore);
      scoreRef.current = newScore;
      setWrongGuesses((w) => w + 1);
      setGuessLock(GUESS_LOCK);
      setGuessing(false);
      setMood('sad');
      setNotice(`Not ${option.toLowerCase().startsWith('the ') ? option : `the ${option.toLowerCase()}`}. Guessing unlocks after ${GUESS_LOCK} more questions.`);
      playSound('wrong');
      push({ text: `-${WRONG_GUESS_COST}`, color: '#ff8a80', x: 40, y: 40 });
    }
  };

  // Keyboard: G opens the guess, 1–4 pick while guessing, Enter moves on after a miss.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (guessing && picture) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= picture.options.length) {
          e.preventDefault();
          makeGuess(picture.options[n - 1]);
        }
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        openGuess();
      } else if (e.key === 'Enter' && feedback === 'wrong') {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ----- Render -----

  if (phase === 'config') return <ConfigScreen canUseSet={canUseSet} onStart={start} onExit={exit} />;
  if (!picture || !config) return null;

  if (phase === 'done' && outcome) {
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const stars = outcome.guessed
      ? 1 + (outcome.coveredShare >= 0.4 ? 1 : 0) + (accuracy >= 75 ? 1 : 0)
      : accuracy >= 75 ? 1 : 0;
    const tilesLifted = config.tiles - Math.round(outcome.coveredShare * config.tiles);
    return (
      <div className="mp-wall relative min-h-[calc(100dvh-8rem)] flex items-center px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood={stars > 0 ? 'celebrate' : 'sad'} color={ART.mascot} accessory="tufts" size={112} />}
          title={outcome.guessed ? `It was the ${picture.name.toLowerCase()}` : 'Every tile lifted'}
          subtitle={
            outcome.guessed
              ? `Named with ${Math.round(outcome.coveredShare * 100)}% still covered, for a ${outcome.bonus} point bonus.`
              : `The picture was ${picture.name.toLowerCase()}. Try naming it sooner next time.`
          }
          stars={stars}
          score={score}
          best={best}
          stats={[
            { label: 'Accuracy', value: `${accuracy}%` },
            { label: 'Tiles lifted', value: `${tilesLifted}/${config.tiles}` },
            { label: 'Best streak', value: maxStreak },
            { label: 'Wrong guesses', value: wrongGuesses },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => start(config)}>New picture</Button>
              <Button variant="outline" onClick={() => setPhase('config')}>Change settings</Button>
              <Button variant="ghost" onClick={exit}>Exit</Button>
            </>
          }
        />
      </div>
    );
  }

  const revealed = phase === 'reveal';

  return (
    <div className="mp-wall min-h-[calc(100dvh-8rem)] px-3 sm:px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && <Countdown accent={ART.brass} onDone={() => setPhase('game')} />}
      <div className="max-w-5xl mx-auto">
        <GameTopBar onExit={exit} tone="dark">
          <ComboMeter streak={streak} tone="dark" />
          <ScoreCounter value={score} tone="dark" />
        </GameTopBar>

        <div className="mt-4 flex flex-col md:flex-row gap-5 md:gap-8 items-center md:items-start">
          <div className="w-full max-w-[300px] md:max-w-none md:w-[360px] shrink-0">
            <Easel
              picture={picture}
              tiles={tiles}
              covered={covered}
              revealed={revealed}
              mood={mood}
              popups={popups}
              onPopupDone={remove}
            />
          </div>

          <div className="flex-1 min-w-0 w-full">
            {revealed ? (
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : 0.9 }}
                className="rounded-3xl p-6 text-center"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  {outcome?.guessed ? 'You named it' : 'All tiles lifted'}
                </p>
                <h3 className="mt-1 text-3xl font-extrabold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-display)' }}>
                  {picture.name}
                </h3>
                {outcome?.guessed && (
                  <p className="mt-2 font-bold tabular-nums" style={{ color: 'var(--color-success)' }}>
                    +{outcome.bonus} early-guess bonus
                  </p>
                )}
                <div className="mt-5 flex justify-center">
                  <Button variant="primary" onClick={() => setPhase('done')} autoFocus>
                    See results
                  </Button>
                </div>
              </motion.div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: ART.wallInkSoft }}>
                    Question {asked}, {covered.size} of {tiles} tiles left
                  </span>
                  <button
                    key={lockPulse}
                    type="button"
                    onClick={openGuess}
                    disabled={!playing || guessing}
                    className={`flex items-center gap-1.5 h-11 px-4 rounded-xl font-extrabold cursor-pointer disabled:cursor-not-allowed focus-visible:outline-3 focus-visible:outline-offset-2 ${lockPulse > 0 && guessLock > 0 ? 'mp-locked' : ''}`}
                    style={{
                      background: guessLock > 0 ? '#5d6f78' : ART.brass,
                      color: guessLock > 0 ? '#e3eaee' : ART.brassInk,
                      border: 'none',
                      boxShadow: `inset 0 -5px 0 ${guessLock > 0 ? '#44535b' : ART.brassEdge}`,
                      fontFamily: 'var(--font-display)',
                      outlineColor: ART.brass,
                      opacity: guessing ? 0.6 : 1,
                    }}
                    aria-label={guessLock > 0 ? `Guessing locked for ${guessLock} more questions` : 'Guess the picture (G)'}
                  >
                    {guessLock > 0 ? <Lock size={16} /> : <ScanSearch size={18} />}
                    {guessLock > 0 ? `Locked, ${guessLock} to go` : 'Guess the picture'}
                  </button>
                </div>
                {notice && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: 'rgba(0,0,0,0.25)', color: '#ffd1c9' }} role="status">
                    <X size={16} className="shrink-0" /> {notice}
                  </div>
                )}
                <AnimatePresence mode="wait">
                  {guessing ? (
                    <motion.div
                      key="guess"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-3xl p-5 sm:p-6"
                      style={{ background: 'var(--color-surface)', border: `2px solid ${ART.brass}`, boxShadow: 'var(--shadow-card)' }}
                    >
                      <GuessPanel options={picture.options} onPick={makeGuess} onCancel={() => setGuessing(false)} />
                    </motion.div>
                  ) : (
                    question && (
                      <motion.div
                        key={`q-${asked}`}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, x: -30 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                        className="rounded-3xl p-5 sm:p-6"
                        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
                      >
                        <QuestionPanel
                          question={question}
                          feedback={feedback}
                          selectedOption={selected}
                          disabled={!playing}
                          onWritten={onWritten}
                          onOption={onOption}
                          onTrueFalse={onTrueFalse}
                          points={lastPoints}
                          footer={
                            feedback === 'wrong' ? (
                              <Button variant="primary" className="w-full mt-3" onClick={advance}>
                                Next question
                              </Button>
                            ) : feedback === 'correct' ? (
                              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                                <Check size={14} /> A tile flips away
                              </p>
                            ) : null
                          }
                        />
                      </motion.div>
                    )
                  )}
                </AnimatePresence>
                <p className="hidden md:block mt-3 text-xs" style={{ color: ART.wallInkSoft }}>
                  Press G to guess the picture at any time.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

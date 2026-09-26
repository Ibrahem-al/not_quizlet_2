import type { Card, StudyMode } from '@/types';
import { lazyWithPreload } from '@/lib/lazyWithPreload';

// Every study mode and game is its own chunk. The three study pages (own
// sets, shared set, shared folder) share this registry, so opening one game
// no longer downloads Flashcards + Learn + Match + Test alongside it.

export interface ModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

export const MODE_COMPONENTS = {
  flashcards: lazyWithPreload(() => import('@/components/modes/FlashcardMode')),
  learn: lazyWithPreload(() => import('@/components/modes/LearnMode')),
  match: lazyWithPreload(() => import('@/components/modes/MatchMode')),
  test: lazyWithPreload(() => import('@/components/modes/TestMode')),
  spinner: lazyWithPreload(() => import('@/components/modes/games/SpinnerMode')),
  'block-builder': lazyWithPreload(() => import('@/components/modes/games/BlockBuilderMode')),
  'memory-card-flip': lazyWithPreload(() => import('@/components/modes/games/MemoryCardFlipMode')),
  'race-to-finish': lazyWithPreload(() => import('@/components/modes/games/RaceToFinishMode')),
  'meteor-defense': lazyWithPreload(() => import('@/components/modes/games/MeteorDefenseMode')),
  'crossword': lazyWithPreload(() => import('@/components/modes/games/CrosswordMode')),
  'letter-lock': lazyWithPreload(() => import('@/components/modes/games/LetterLockMode')),
  'boss-battle': lazyWithPreload(() => import('@/components/modes/games/BossBattleMode')),
  'swipe-blitz': lazyWithPreload(() => import('@/components/modes/games/SwipeBlitzMode')),
  'fishing-pond': lazyWithPreload(() => import('@/components/modes/games/FishingPondMode')),
  'mystery-picture': lazyWithPreload(() => import('@/components/modes/games/MysteryPictureMode')),
  'escape-room': lazyWithPreload(() => import('@/components/modes/games/EscapeRoomMode')),
} satisfies Record<StudyMode, unknown>;

export const MIN_CARDS: Record<StudyMode, number> = {
  flashcards: 1,
  learn: 2,
  match: 2,
  test: 2,
  spinner: 2,
  'block-builder': 2,
  'memory-card-flip': 4,
  'race-to-finish': 2,
  'meteor-defense': 2,
  'crossword': 3,
  'letter-lock': 2,
  'boss-battle': 3,
  'swipe-blitz': 3,
  'fishing-pond': 3,
  'mystery-picture': 3,
  'escape-room': 4,
};

export function isStudyMode(mode: string | undefined): mode is StudyMode {
  return !!mode && mode in MODE_COMPONENTS;
}

/** Fetch a mode's chunk ahead of navigation (hover/focus on its button). */
export function preloadMode(mode: string): void {
  if (isStudyMode(mode)) void MODE_COMPONENTS[mode].preload();
}

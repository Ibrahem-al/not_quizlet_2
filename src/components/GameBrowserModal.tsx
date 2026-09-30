import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Disc, Box, Layers, Flag, Rocket, Grid3x3, KeyRound, Swords, ArrowLeftRight, Fish, ImageIcon, DoorOpen } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { preloadMode, MIN_CARDS } from '@/components/modes/registry';
import type { StudyMode } from '@/types';

interface GameBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  setId: string;
  cardCount: number;
  onNavigate?: (url: string) => void;
}

interface GameEntry {
  id: StudyMode;
  name: string;
  icon: React.ReactNode;
  description: string;
  category: string;
  /** Trial games shown with a "New" badge while you decide which to keep. */
  isNew?: boolean;
}

const GAMES: GameEntry[] = [
  {
    id: 'spinner',
    name: 'Spinner',
    icon: <Disc size={28} />,
    description: 'Spin the wheel and answer random cards',
    category: 'Quick Play',
  },
  {
    id: 'block-builder',
    name: 'Block Builder',
    icon: <Box size={28} />,
    description: 'Build towers by answering correctly',
    category: 'Challenge',
  },
  {
    id: 'memory-card-flip',
    name: 'Memory Card Flip',
    icon: <Layers size={28} />,
    description: 'Match terms with their definitions',
    category: 'Classic',
  },
  {
    id: 'race-to-finish',
    name: 'Race to Finish',
    icon: <Flag size={28} />,
    description: 'Race a bot or friends up the track by answering questions',
    category: 'Multiplayer',
  },
  { id: 'meteor-defense', name: 'Meteor Defense', icon: <Rocket size={28} />, description: 'Type answers to blast falling meteors', category: 'Typing', isNew: true },
  { id: 'crossword', name: 'Crossword', icon: <Grid3x3 size={28} />, description: 'Solve a crossword built from your cards', category: 'Puzzle', isNew: true },
  { id: 'letter-lock', name: 'Letter Lock', icon: <KeyRound size={28} />, description: 'Unlock the term with as few letters as you can', category: 'Spelling', isNew: true },
  { id: 'boss-battle', name: 'Boss Battle', icon: <Swords size={28} />, description: 'Right answers attack, missed cards fight back', category: 'Adventure', isNew: true },
  { id: 'swipe-blitz', name: 'Swipe Blitz', icon: <ArrowLeftRight size={28} />, description: '60 seconds: swipe pairs as right or wrong', category: 'Speed', isNew: true },
  { id: 'fishing-pond', name: 'Fishing Pond', icon: <Fish size={28} />, description: 'Hook the definition that matches your term', category: 'Arcade', isNew: true },
  { id: 'mystery-picture', name: 'Mystery Picture', icon: <ImageIcon size={28} />, description: 'Uncover a hidden picture one answer at a time', category: 'Puzzle', isNew: true },
  { id: 'escape-room', name: 'Escape Room', icon: <DoorOpen size={28} />, description: 'Crack the locks before the clock runs out', category: 'Adventure', isNew: true },
];

export function GameBrowserModal({
  isOpen,
  onClose,
  setId,
  cardCount,
  onNavigate,
}: GameBrowserModalProps) {
  const navigate = useNavigate();

  const handleSelect = useCallback(
    (gameId: string) => {
      onClose();
      const url = `/sets/${setId}/study/${gameId}`;
      if (onNavigate) {
        onNavigate(url);
      } else {
        navigate(url);
      }
    },
    [navigate, setId, onClose, onNavigate],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choose a Game" size="lg">
      {/* Container query (rem thresholds follow the text size): 2 columns on a
          phone at default size, 1 column once the text is large */}
      <div className="@container">
        <div className="grid grid-cols-1 @min-[17rem]:grid-cols-2 @min-[34rem]:grid-cols-3 gap-3">
          {GAMES.map((game) => {
            const minCards = MIN_CARDS[game.id];
            const disabled = cardCount < minCards;
            return (
              <button
                key={game.id}
                type="button"
                onClick={() => {
                  if (!disabled) handleSelect(game.id);
                }}
                disabled={disabled}
                className={cn(
                  'flex flex-col items-start gap-2 p-4 rounded-lg text-left transition-colors cursor-pointer min-w-0',
                  disabled && 'opacity-40 cursor-not-allowed',
                )}
                style={{
                  background: 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                }}
                onFocus={() => preloadMode(game.id)}
                onMouseEnter={(e) => {
                  preloadMode(game.id);
                  if (!disabled) {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.background = 'var(--color-primary-light)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.background = 'var(--color-muted)';
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-1 w-full">
                  <span style={{ color: 'var(--color-primary)' }}>{game.icon}</span>
                  <span className="flex flex-wrap gap-1">
                    {game.isNew && <Badge variant="success">New</Badge>}
                    <Badge variant="info">{game.category}</Badge>
                  </span>
                </div>
                <div>
                  <div
                    className="font-semibold text-sm"
                    style={{ color: 'var(--color-text)' }}
                  >
                    {game.name}
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    {game.description}
                  </div>
                </div>
                {disabled && (
                  <div
                    className="text-xs"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    Requires at least {minCards} cards
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Disc, Box, Layers, Flag } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

interface GameBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  setId: string;
  cardCount: number;
  onNavigate?: (url: string) => void;
}

interface GameEntry {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  category: string;
  minCards: number;
}

const GAMES: GameEntry[] = [
  {
    id: 'spinner',
    name: 'Spinner',
    icon: <Disc size={28} />,
    description: 'Spin the wheel and answer random cards',
    category: 'Quick Play',
    minCards: 2,
  },
  {
    id: 'block-builder',
    name: 'Block Builder',
    icon: <Box size={28} />,
    description: 'Build towers by answering correctly',
    category: 'Challenge',
    minCards: 4,
  },
  {
    id: 'memory-card-flip',
    name: 'Memory Card Flip',
    icon: <Layers size={28} />,
    description: 'Match terms with their definitions',
    category: 'Classic',
    minCards: 2,
  },
  {
    id: 'race-to-finish',
    name: 'Race to Finish',
    icon: <Flag size={28} />,
    description: 'Race against the clock to answer all cards',
    category: 'Timed',
    minCards: 4,
  },
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
      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((game) => {
          const disabled = cardCount < game.minCards;
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => {
                if (!disabled) handleSelect(game.id);
              }}
              disabled={disabled}
              className={cn(
                'flex flex-col items-start gap-2 p-4 rounded-lg text-left transition-colors cursor-pointer',
                disabled && 'opacity-40 cursor-not-allowed',
              )}
              style={{
                background: 'var(--color-muted)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
              }}
              onMouseEnter={(e) => {
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
              <div className="flex items-center justify-between w-full">
                <span style={{ color: 'var(--color-primary)' }}>{game.icon}</span>
                <Badge variant="info">{game.category}</Badge>
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
                  Requires at least {game.minCards} cards
                </div>
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

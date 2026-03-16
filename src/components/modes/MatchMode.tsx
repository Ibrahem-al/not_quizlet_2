import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, stripHtml, normalizeAnswer, formatTime } from '@/lib/utils';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface MatchModeProps {
  cards: Card[];
  setId: string;
}

interface Tile {
  id: string;
  cardId: string;
  content: string;
  side: 'term' | 'definition';
  matched: boolean;
}

function MatchMode({ cards, setId }: MatchModeProps) {
  const navigate = useNavigate();

  const pairCards = cards.slice(0, 8);
  const groups = buildEquivalenceGroups(pairCards);

  const [tiles, setTiles] = useState<Tile[]>(() => {
    const tilePairs: Tile[] = [];
    for (const card of pairCards) {
      tilePairs.push({
        id: `term-${card.id}`,
        cardId: card.id,
        content: card.term,
        side: 'term',
        matched: false,
      });
      tilePairs.push({
        id: `def-${card.id}`,
        cardId: card.id,
        content: card.definition,
        side: 'definition',
        matched: false,
      });
    }
    return shuffleArray(tilePairs);
  });

  const [selectedTile, setSelectedTile] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [mismatchIds, setMismatchIds] = useState<Set<string>>(new Set());
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    if (timerRunning && !gameComplete) {
      intervalRef.current = setInterval(() => {
        setTimer((t) => t + 0.1);
      }, 100);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning, gameComplete]);

  // Confetti on complete
  useEffect(() => {
    if (gameComplete) {
      import('canvas-confetti').then((mod) => {
        const confetti = mod.default;
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
        });
      }).catch(() => {
        // canvas-confetti not available, skip
      });
    }
  }, [gameComplete]);

  const isMatch = useCallback(
    (tile1: Tile, tile2: Tile) => {
      // Must be different sides
      if (tile1.side === tile2.side) return false;

      // Direct match
      if (tile1.cardId === tile2.cardId) return true;

      // Equivalence-aware match
      const termTile = tile1.side === 'term' ? tile1 : tile2;
      const defTile = tile1.side === 'definition' ? tile1 : tile2;

      const termCard = pairCards.find((c) => c.id === termTile.cardId);
      if (!termCard) return false;

      const normalizedDef = normalizeAnswer(defTile.content);
      const key = normalizeAnswer(termCard.term);
      const group = groups.get(key) ?? [termCard];

      return group.some((c) => normalizeAnswer(c.definition) === normalizedDef);
    },
    [pairCards, groups],
  );

  const handleTileClick = useCallback(
    (tileId: string) => {
      if (gameComplete) return;

      const tile = tiles.find((t) => t.id === tileId);
      if (!tile || tile.matched) return;

      // Start timer on first interaction
      if (!timerRunning) setTimerRunning(true);

      if (!selectedTile) {
        setSelectedTile(tileId);
        return;
      }

      if (selectedTile === tileId) {
        setSelectedTile(null);
        return;
      }

      const firstTile = tiles.find((t) => t.id === selectedTile);
      if (!firstTile) {
        setSelectedTile(tileId);
        return;
      }

      if (isMatch(firstTile, tile)) {
        // Match found
        const newMatched = matchedPairs + 1;
        setMatchedPairs(newMatched);
        setTiles((prev) =>
          prev.map((t) =>
            t.id === firstTile.id || t.id === tile.id ? { ...t, matched: true } : t,
          ),
        );
        setSelectedTile(null);

        if (newMatched >= pairCards.length) {
          setGameComplete(true);
          setTimerRunning(false);
        }
      } else {
        // Mismatch
        setMismatchIds(new Set([firstTile.id, tile.id]));
        setTimeout(() => {
          setMismatchIds(new Set());
          setSelectedTile(null);
        }, 600);
      }
    },
    [gameComplete, tiles, selectedTile, timerRunning, isMatch, matchedPairs, pairCards.length],
  );

  const handleRestart = useCallback(() => {
    const tilePairs: Tile[] = [];
    for (const card of pairCards) {
      tilePairs.push({
        id: `term-${card.id}`,
        cardId: card.id,
        content: card.term,
        side: 'term',
        matched: false,
      });
      tilePairs.push({
        id: `def-${card.id}`,
        cardId: card.id,
        content: card.definition,
        side: 'definition',
        matched: false,
      });
    }
    setTiles(shuffleArray(tilePairs));
    setSelectedTile(null);
    setMatchedPairs(0);
    setMismatchIds(new Set());
    setTimer(0);
    setTimerRunning(false);
    setGameComplete(false);
  }, [pairCards]);

  if (gameComplete) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <h2
            className="text-2xl font-bold mb-2"
            style={{ color: 'var(--color-text)' }}
          >
            All Matched!
          </h2>
          <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            Completed in {formatTime(timer)}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="primary" onClick={handleRestart}>
              Play Again
            </Button>
            <Button variant="outline" onClick={() => navigate(`/sets/${setId}`)}>
              Exit
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/sets/${setId}`)}>
          Exit
        </Button>
        <span
          className="text-sm font-medium font-mono"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {formatTime(timer)}
        </span>
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {matchedPairs} / {pairCards.length} pairs
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <AnimatePresence>
          {tiles.map((tile) => {
            if (tile.matched) {
              return (
                <motion.div
                  key={tile.id}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.3 }}
                  className="h-28 rounded-xl"
                  style={{ background: 'var(--color-muted)', opacity: 0.3 }}
                />
              );
            }

            const isSelected = selectedTile === tile.id;
            const isMismatch = mismatchIds.has(tile.id);

            return (
              <motion.button
                key={tile.id}
                layout
                onClick={() => handleTileClick(tile.id)}
                animate={
                  isMismatch
                    ? { x: [0, -6, 6, -6, 6, 0] }
                    : {}
                }
                transition={isMismatch ? { duration: 0.4 } : { type: 'spring', stiffness: 300, damping: 25 }}
                whileTap={{ scale: 0.95 }}
                className="h-28 flex items-center justify-center p-3 rounded-xl cursor-pointer transition-shadow overflow-hidden text-sm"
                style={{
                  background: isSelected
                    ? 'var(--color-primary-light)'
                    : isMismatch
                      ? 'var(--color-danger-light)'
                      : 'var(--color-surface)',
                  border: `2px solid ${
                    isSelected
                      ? 'var(--color-primary)'
                      : isMismatch
                        ? 'var(--color-danger)'
                        : 'var(--color-border)'
                  }`,
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-xs)',
                  color: 'var(--color-text)',
                }}
              >
                <StudyContent html={tile.content} />
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default MatchMode;

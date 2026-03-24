import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, normalizeAnswer, formatTime, fairRepeatCards } from '@/lib/utils';
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
  originalCardId: string;
  content: string;
  side: 'term' | 'definition';
  matched: boolean;
}

function DraggableDroppableTile({
  tile,
  isOver,
  activeDragId,
}: {
  tile: Tile;
  isOver: boolean;
  activeDragId: string | null;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: tile.id });
  const { setNodeRef: setDropRef } = useDroppable({ id: tile.id });

  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef],
  );

  if (tile.matched) {
    return (
      <motion.div
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.3 }}
        className="match-tile h-28 rounded-xl"
        style={{ background: 'var(--color-muted)', opacity: 0.3 }}
      />
    );
  }

  const isBeingDragged = isDragging;
  const isDropTarget = isOver && activeDragId !== tile.id;

  return (
    <motion.div
      ref={setRefs}
      {...listeners}
      {...attributes}
      layout
      whileTap={{ scale: 0.95 }}
      className="match-tile h-28 flex items-center justify-center p-3 rounded-xl cursor-grab active:cursor-grabbing touch-none overflow-hidden text-base transition-shadow"
      style={{
        background: isDropTarget
          ? 'var(--color-primary-light)'
          : 'var(--color-surface)',
        border: `2px solid ${isDropTarget ? 'var(--color-primary)' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: isDropTarget ? 'var(--shadow-md)' : 'var(--shadow-xs)',
        opacity: isBeingDragged ? 0.3 : 1,
        color: 'var(--color-text)',
        transform: isDropTarget ? 'scale(1.03)' : undefined,
      }}
    >
      <StudyContent html={tile.content} />
    </motion.div>
  );
}

function MatchMode({ cards, setId }: MatchModeProps) {
  const navigate = useNavigate();

  const [pairCount, setPairCount] = useState(Math.min(6, cards.length));
  const [phase, setPhase] = useState<'setup' | 'playing' | 'complete'>('setup');

  // These are set when the game starts
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const groups = useMemo(() => buildEquivalenceGroups(selectedCards), [selectedCards]);

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [mismatchFlash, setMismatchFlash] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  const startGame = useCallback(() => {
    const picked = fairRepeatCards(cards, pairCount);
    setSelectedCards(picked);

    const tilePairs: Tile[] = [];
    picked.forEach((card, i) => {
      const uid = `${card.id}-${i}`;
      tilePairs.push({ id: `term-${uid}`, cardId: uid, originalCardId: card.id, content: card.term, side: 'term', matched: false });
      tilePairs.push({ id: `def-${uid}`, cardId: uid, originalCardId: card.id, content: card.definition, side: 'definition', matched: false });
    });
    setTiles(shuffleArray(tilePairs));
    setMatchedPairs(0);
    setActiveDragId(null);
    setOverId(null);
    setMismatchFlash(false);
    setTimer(0);
    setTimerRunning(false);
    setPhase('playing');
  }, [cards, pairCount]);

  // Timer
  useEffect(() => {
    if (timerRunning && phase === 'playing') {
      intervalRef.current = setInterval(() => setTimer((t) => t + 0.1), 100);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning, phase]);

  // Confetti on complete
  useEffect(() => {
    if (phase === 'complete') {
      import('canvas-confetti').then((mod) => {
        mod.default({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      }).catch(() => {});
    }
  }, [phase]);

  const isMatch = useCallback(
    (tile1: Tile, tile2: Tile) => {
      if (tile1.side === tile2.side) return false;
      if (tile1.cardId === tile2.cardId) return true;

      const termTile = tile1.side === 'term' ? tile1 : tile2;
      const defTile = tile1.side === 'definition' ? tile1 : tile2;

      const termCard = selectedCards.find((c) => c.id === termTile.originalCardId);
      if (!termCard) return false;

      const normalizedDef = normalizeAnswer(defTile.content);
      const key = normalizeAnswer(termCard.term);
      const group = groups.get(key) ?? [termCard];
      return group.some((c) => normalizeAnswer(c.definition) === normalizedDef);
    },
    [selectedCards, groups],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveDragId(event.active.id as string);
      if (!timerRunning) setTimerRunning(true);
    },
    [timerRunning],
  );

  const handleDragOver = useCallback((event: { over: { id: string } | null }) => {
    setOverId((event.over?.id as string) ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      setOverId(null);

      if (!over || active.id === over.id) return;

      const draggedTile = tiles.find((t) => t.id === active.id);
      const droppedOnTile = tiles.find((t) => t.id === over.id);
      if (!draggedTile || !droppedOnTile || draggedTile.matched || droppedOnTile.matched) return;

      if (isMatch(draggedTile, droppedOnTile)) {
        const newMatched = matchedPairs + 1;
        setMatchedPairs(newMatched);
        setTiles((prev) =>
          prev.map((t) =>
            t.id === draggedTile.id || t.id === droppedOnTile.id ? { ...t, matched: true } : t,
          ),
        );
        if (newMatched >= selectedCards.length) {
          setTimerRunning(false);
          setPhase('complete');
        }
      } else {
        setMismatchFlash(true);
        setTimeout(() => setMismatchFlash(false), 600);
      }
    },
    [tiles, isMatch, matchedPairs, selectedCards.length],
  );

  const activeTile = tiles.find((t) => t.id === activeDragId);

  // Setup screen
  if (phase === 'setup') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--color-text)' }}>
          Match
        </h2>

        <div
          className="rounded-2xl p-6 space-y-6"
          style={{
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <div>
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              Number of Pairs
            </label>
            <div className="flex items-center gap-4 justify-center">
              <button
                onClick={() => setPairCount((c) => Math.max(2, c - 1))}
                className="w-10 h-10 rounded-lg text-xl font-bold cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                -
              </button>
              <span className="text-3xl font-bold w-12 text-center" style={{ color: 'var(--color-primary)' }}>
                {pairCount}
              </span>
              <button
                onClick={() => setPairCount((c) => c + 1)}
                className="w-10 h-10 rounded-lg text-xl font-bold cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  color: 'var(--color-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                +
              </button>
            </div>
            <p className="text-sm text-center mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {pairCount * 2} tiles total — randomly selected from {cards.length} cards
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="primary" className="flex-1" onClick={startGame}>
              Start Game
            </Button>
            <Button variant="outline" onClick={() => navigate(`/sets/${setId}`)}>
              Exit
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Complete screen
  if (phase === 'complete') {
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
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            All Matched!
          </h2>
          <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            Completed in {formatTime(timer)}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="primary" onClick={startGame}>Play Again</Button>
            <Button variant="outline" onClick={() => setPhase('setup')}>Change Settings</Button>
            <Button variant="ghost" onClick={() => navigate(`/sets/${setId}`)}>Exit</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Playing screen
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/sets/${setId}`)}>
          Exit
        </Button>
        <span className="text-sm font-medium font-mono" style={{ color: 'var(--color-text-secondary)' }}>
          {formatTime(timer)}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {matchedPairs} / {selectedCards.length} pairs
        </span>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <AnimatePresence>
            {tiles.map((tile) => (
              <DraggableDroppableTile
                key={tile.id}
                tile={tile}
                isOver={overId === tile.id}
                activeDragId={activeDragId}
              />
            ))}
          </AnimatePresence>
        </div>

        <DragOverlay>
          {activeTile ? (
            <div
              className="match-tile h-28 flex items-center justify-center p-3 rounded-xl overflow-hidden text-base shadow-xl"
              style={{
                background: 'var(--color-primary-light)',
                border: '2px solid var(--color-primary)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--color-text)',
              }}
            >
              <StudyContent html={activeTile.content} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <AnimatePresence>
        {mismatchFlash && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--color-danger)', color: '#ffffff' }}
          >
            Not a match — try again!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MatchMode;

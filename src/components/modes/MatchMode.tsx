import { useState, useEffect, useCallback, useRef } from 'react';
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
import { shuffleArray, normalizeAnswer, formatTime } from '@/lib/utils';
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

  // Combine both refs
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

  const pairCards = cards.slice(0, 8);
  const groups = buildEquivalenceGroups(pairCards);

  const [tiles, setTiles] = useState<Tile[]>(() => {
    const tilePairs: Tile[] = [];
    for (const card of pairCards) {
      tilePairs.push({ id: `term-${card.id}`, cardId: card.id, content: card.term, side: 'term', matched: false });
      tilePairs.push({ id: `def-${card.id}`, cardId: card.id, content: card.definition, side: 'definition', matched: false });
    }
    return shuffleArray(tilePairs);
  });

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [mismatchFlash, setMismatchFlash] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  useEffect(() => {
    if (timerRunning && !gameComplete) {
      intervalRef.current = setInterval(() => setTimer((t) => t + 0.1), 100);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning, gameComplete]);

  useEffect(() => {
    if (gameComplete) {
      import('canvas-confetti').then((mod) => {
        mod.default({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      }).catch(() => {});
    }
  }, [gameComplete]);

  const isMatch = useCallback(
    (tile1: Tile, tile2: Tile) => {
      if (tile1.side === tile2.side) return false;
      if (tile1.cardId === tile2.cardId) return true;

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
        if (newMatched >= pairCards.length) {
          setGameComplete(true);
          setTimerRunning(false);
        }
      } else {
        setMismatchFlash(true);
        setTimeout(() => setMismatchFlash(false), 600);
      }
    },
    [tiles, isMatch, matchedPairs, pairCards.length],
  );

  const handleRestart = useCallback(() => {
    const tilePairs: Tile[] = [];
    for (const card of pairCards) {
      tilePairs.push({ id: `term-${card.id}`, cardId: card.id, content: card.term, side: 'term', matched: false });
      tilePairs.push({ id: `def-${card.id}`, cardId: card.id, content: card.definition, side: 'definition', matched: false });
    }
    setTiles(shuffleArray(tilePairs));
    setActiveDragId(null);
    setOverId(null);
    setMatchedPairs(0);
    setMismatchFlash(false);
    setTimer(0);
    setTimerRunning(false);
    setGameComplete(false);
  }, [pairCards]);

  const activeTile = tiles.find((t) => t.id === activeDragId);

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
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            All Matched!
          </h2>
          <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            Completed in {formatTime(timer)}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="primary" onClick={handleRestart}>Play Again</Button>
            <Button variant="outline" onClick={() => navigate(`/sets/${setId}`)}>Exit</Button>
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
        <span className="text-sm font-medium font-mono" style={{ color: 'var(--color-text-secondary)' }}>
          {formatTime(timer)}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {matchedPairs} / {pairCards.length} pairs
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

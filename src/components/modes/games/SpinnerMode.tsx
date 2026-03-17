import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { stripHtml, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface SpinnerModeProps {
  cards: Card[];
  setId: string;
}

function SpinnerMode({ cards, setId }: SpinnerModeProps) {
  const navigate = useNavigate();

  const [remainingCards, setRemainingCards] = useState<Card[]>(() => [...cards]);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRotationRef = useRef(0);

  const totalCards = [...cards].length;

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  const handleSpin = useCallback(() => {
    if (isSpinning || remainingCards.length === 0) return;

    const count = remainingCards.length;
    const segmentAngle = 360 / count;

    // Pick a random segment
    const randomIndex = Math.floor(Math.random() * count);
    // Landing angle: center of the chosen segment, measured from top (pointer at top = 0deg)
    // Segment i spans from i*segmentAngle to (i+1)*segmentAngle
    // The pointer is at top (0deg). After rotation, the segment under the pointer
    // is the one whose center aligns with 360 - rotation%360
    const landingAngle = 360 - (randomIndex * segmentAngle + segmentAngle / 2);

    // Add 5-8 full bonus rotations
    const bonusRotations = (5 + Math.floor(Math.random() * 4)) * 360;
    const totalRotation = prevRotationRef.current + bonusRotations + landingAngle + (360 - (prevRotationRef.current % 360));

    setIsSpinning(true);
    setRotationDeg(totalRotation);
    prevRotationRef.current = totalRotation;

    spinTimeoutRef.current = setTimeout(() => {
      setIsSpinning(false);
      setSelectedCard(remainingCards[randomIndex]);
      setIsFlipped(false);
    }, 4000);
  }, [isSpinning, remainingCards]);

  const handleGotIt = useCallback(() => {
    if (!selectedCard) return;
    setRemainingCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
    setDoneCount((d) => d + 1);
    setSelectedCard(null);
  }, [selectedCard]);

  const handleSkip = useCallback(() => {
    setSkippedCount((s) => s + 1);
    setSelectedCard(null);
  }, []);

  const handleReset = useCallback(() => {
    setRemainingCards([...cards]);
    setDoneCount(0);
    setSkippedCount(0);
    setRotationDeg(0);
    prevRotationRef.current = 0;
    setSelectedCard(null);
  }, [cards]);

  // All done
  if (remainingCards.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'var(--color-surface)',
            boxShadow: 'var(--shadow-card)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <h2
            className="text-2xl font-bold mb-4"
            style={{ color: 'var(--color-text)' }}
          >
            All Done!
          </h2>
          <p className="text-lg mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            You completed all {totalCards} cards
          </p>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
            {skippedCount > 0 && `Skipped ${skippedCount} time(s) along the way`}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="primary" onClick={handleReset}>
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

  const count = remainingCards.length;
  const segmentAngle = 360 / count;
  const wheelSize = 360;
  const wheelRadius = 170;
  const centerX = wheelSize / 2;
  const centerY = wheelSize / 2;

  // Build SVG segments
  const segments = remainingCards.map((card, i) => {
    const startAngle = (i * segmentAngle - 90) * (Math.PI / 180);
    const endAngle = ((i + 1) * segmentAngle - 90) * (Math.PI / 180);

    const x1 = centerX + wheelRadius * Math.cos(startAngle);
    const y1 = centerY + wheelRadius * Math.sin(startAngle);
    const x2 = centerX + wheelRadius * Math.cos(endAngle);
    const y2 = centerY + wheelRadius * Math.sin(endAngle);

    const largeArc = segmentAngle > 180 ? 1 : 0;

    const pathD =
      count === 1
        ? `M ${centerX} ${centerY - wheelRadius} A ${wheelRadius} ${wheelRadius} 0 1 1 ${centerX - 0.01} ${centerY - wheelRadius} Z`
        : `M ${centerX} ${centerY} L ${x1} ${y1} A ${wheelRadius} ${wheelRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    const hue = Math.round((i * 360) / count);
    const color = `hsl(${hue}, 70%, 60%)`;

    // Label position (midpoint of arc)
    const midAngle = ((i + 0.5) * segmentAngle - 90) * (Math.PI / 180);
    const labelRadius = wheelRadius * 0.65;
    const labelX = centerX + labelRadius * Math.cos(midAngle);
    const labelY = centerY + labelRadius * Math.sin(midAngle);
    const labelRotation = (i + 0.5) * segmentAngle;

    const term = stripHtml(card.term);
    // Adjust truncation based on segment size
    const maxChars = count <= 4 ? 24 : count <= 8 ? 18 : 12;
    const truncated = term.length > maxChars ? term.slice(0, maxChars - 2) + '..' : term;
    const fontSize = count <= 4 ? 14 : count <= 8 ? 12 : 10;

    return (
      <g key={card.id}>
        <path d={pathD} fill={color} stroke="#fff" strokeWidth="2" />
        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(${labelRotation}, ${labelX}, ${labelY})`}
          fill="#fff"
          fontSize={fontSize}
          fontWeight="600"
          fontFamily="var(--font-sans)"
          style={{ pointerEvents: 'none' }}
        >
          {truncated}
        </text>
      </g>
    );
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/sets/${setId}`)}>
          Exit
        </Button>
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
          {doneCount} / {totalCards} done
          {skippedCount > 0 && ` (${skippedCount} skipped)`}
        </span>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          Reset
        </Button>
      </div>

      {/* Wheel */}
      <div className="flex flex-col items-center">
        {/* Pointer triangle */}
        <svg width="30" height="20" viewBox="0 0 30 20" className="mb-[-4px] z-10 relative">
          <polygon points="0,0 30,0 15,20" fill="#fff" stroke="var(--color-text)" strokeWidth="2" />
        </svg>

        <svg
          width={wheelSize}
          height={wheelSize}
          viewBox={`0 0 ${wheelSize} ${wheelSize}`}
          style={{
            willChange: isSpinning ? 'transform' : 'auto',
            transform: `rotate(${rotationDeg}deg)`,
            transition: isSpinning
              ? 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)'
              : 'none',
          }}
        >
          {segments}
          {/* Center circle */}
          <circle cx={centerX} cy={centerY} r="22" fill="var(--color-surface)" stroke="#fff" strokeWidth="3" />
        </svg>

        {/* Spin button */}
        <Button
          variant="primary"
          size="lg"
          className="mt-4"
          onClick={handleSpin}
          disabled={isSpinning}
        >
          {isSpinning ? 'Spinning...' : 'SPIN!'}
        </Button>
      </div>

      {/* Modal overlay for selected card */}
      <AnimatePresence>
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.5)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
              style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              {/* Flipcard */}
              <div
                className="relative cursor-pointer select-none"
                style={{ perspective: 1000, minHeight: 240 }}
                onClick={() => setIsFlipped((f) => !f)}
              >
                <div style={{ transformStyle: 'preserve-3d', position: 'relative', minHeight: 240 }}>
                  {/* Front */}
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center p-8 rounded-t-2xl"
                    style={{
                      background: 'var(--color-surface)',
                      backfaceVisibility: 'hidden',
                      minHeight: 240,
                    }}
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                  >
                    <div className="text-center w-full">
                      <div
                        className="text-xs uppercase tracking-wider mb-4 font-medium"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        Term (click to flip)
                      </div>
                      <StudyContent html={selectedCard.term} className="text-2xl font-semibold" />
                    </div>
                  </motion.div>

                  {/* Back */}
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center p-8 rounded-t-2xl"
                    style={{
                      background: 'var(--color-surface)',
                      backfaceVisibility: 'hidden',
                      minHeight: 240,
                    }}
                    animate={{ rotateY: isFlipped ? 0 : -180 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                  >
                    <div className="text-center w-full">
                      <div
                        className="text-xs uppercase tracking-wider mb-4 font-medium"
                        style={{ color: 'var(--color-text-tertiary)' }}
                      >
                        Definition
                      </div>
                      <StudyContent html={selectedCard.definition} className="text-xl" />
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 p-4">
                <Button variant="primary" className="flex-1" onClick={handleGotIt}>
                  Got it
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleSkip}>
                  Skip
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SpinnerMode;

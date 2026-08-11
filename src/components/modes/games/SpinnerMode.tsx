import { useState, useCallback, useRef, useEffect, useId } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { Card } from '@/types';
import { useNavigate } from 'react-router-dom';
import { stripHtml, cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';
import { playSound } from '@/lib/gameSounds';
import { SoundToggle } from '@/components/SoundToggle';

interface SpinnerModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

/** Extract first base64 image src from HTML content */
function extractImageSrc(html: string): string | null {
  const match = html.match(/<img[^>]+src="(data:[^"]+)"/);
  return match ? match[1] : null;
}

/** Returns true if the card side contains an <img> tag */
function hasImage(html: string): boolean {
  return /<img\s/.test(html);
}

/**
 * Pick the best label side for a spinner segment.
 * Priority: side with image-only content > term > definition
 */
function getDisplaySide(card: Card): { html: string; imageSrc: string | null; text: string } {
  const termImg = hasImage(card.term);
  const defImg = hasImage(card.definition);
  const termText = stripHtml(card.term);
  const defText = stripHtml(card.definition);

  // Prefer the side that is image-only (has image, no text)
  if (termImg && !termText) {
    return { html: card.term, imageSrc: extractImageSrc(card.term), text: '' };
  }
  if (defImg && !defText) {
    return { html: card.definition, imageSrc: extractImageSrc(card.definition), text: '' };
  }
  // Otherwise prefer whichever side has an image
  if (termImg) {
    return { html: card.term, imageSrc: extractImageSrc(card.term), text: termText };
  }
  if (defImg) {
    return { html: card.definition, imageSrc: extractImageSrc(card.definition), text: defText };
  }
  // No images — show term text; fall back to the definition only when the
  // term strips to empty text (previously the definition could never appear).
  if (termText) {
    return { html: card.term, imageSrc: null, text: termText };
  }
  return { html: card.definition, imageSrc: null, text: defText };
}

/** Max segments drawn on the wheel; larger sets are randomly sampled each spin. */
const WHEEL_MAX_SEGMENTS = 24;

/** Random sample of up to WHEEL_MAX_SEGMENTS cards (Fisher-Yates partial shuffle). */
function sampleWheelCards(pool: Card[]): Card[] {
  if (pool.length <= WHEEL_MAX_SEGMENTS) return pool;
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, WHEEL_MAX_SEGMENTS);
}

/** Token-derived segment hue: rotate around the indigo brand hue for a cohesive wheel. */
function segmentColor(i: number, count: number): string {
  const hue = Math.round((i * 360) / count + 239) % 360;
  const light = i % 2 === 0 ? 60 : 53;
  return `hsl(${hue}deg 68% ${light}%)`;
}

/** Soft animated aurora background — GPU-friendly (transform/opacity only). */
function Aurora({ reduce }: { reduce: boolean }) {
  const blobs = [
    { color: 'var(--color-primary)', className: 'w-72 h-72 -top-16 -left-10' },
    { color: 'var(--color-success)', className: 'w-80 h-80 top-1/3 -right-16' },
    { color: 'var(--color-warning)', className: 'w-64 h-64 -bottom-10 left-1/4' },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={cn('absolute rounded-full', b.className)}
          style={{ background: b.color, opacity: 0.14, filter: 'blur(64px)', willChange: 'transform' }}
          animate={
            reduce
              ? undefined
              : { x: [0, 28, -18, 0], y: [0, -24, 18, 0], scale: [1, 1.14, 0.94, 1] }
          }
          transition={
            reduce
              ? undefined
              : { duration: 15 + i * 3, repeat: Infinity, ease: 'easeInOut', delay: i * 1.4 }
          }
        />
      ))}
    </div>
  );
}

/** Rounded stat pill used in the header. */
function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="flex flex-col items-center px-4 py-1.5"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-light)',
        borderRadius: 'var(--radius-full)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <span className="text-sm font-bold tabular-nums leading-none" style={{ color: accent ?? 'var(--color-text)' }}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
        {label}
      </span>
    </div>
  );
}

function SpinnerMode({ cards, setId, exitUrl }: SpinnerModeProps) {
  const navigate = useNavigate();
  const reduce = useReducedMotion() ?? false;
  const exitTo = exitUrl ?? `/sets/${setId}`;
  // Instance-unique prefix for SVG clipPath ids (multiple wheels can coexist).
  const clipIdPrefix = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const [remainingCards, setRemainingCards] = useState<Card[]>(() => [...cards]);
  // Cards actually drawn on the wheel (random sample of 24 when the set is large).
  const [wheelCards, setWheelCards] = useState<Card[]>(() => sampleWheelCards(cards));
  const [rotationDeg, setRotationDeg] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [landedIndex, setLandedIndex] = useState<number | null>(null);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRotationRef = useRef(0);
  // Cooldown: the card skipped in the previous modal can't land on the very next spin.
  const lastSkippedIdRef = useRef<string | null>(null);
  // Pending settle callback for the in-flight spin (lets a wheel tap fast-forward it).
  const settleRef = useRef<(() => void) | null>(null);

  const totalCards = cards.length;

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  // Celebrate when every card has been completed.
  useEffect(() => {
    if (remainingCards.length === 0 && totalCards > 0) {
      playSound('win');
      if (reduce) return;
      const t1 = setTimeout(() => {
        confetti({ particleCount: 90, spread: 65, startVelocity: 45, origin: { x: 0.3, y: 0.5 } });
        confetti({ particleCount: 90, spread: 65, startVelocity: 45, origin: { x: 0.7, y: 0.5 } });
      }, 150);
      return () => clearTimeout(t1);
    }
  }, [remainingCards.length, totalCards, reduce]);

  // Close the selected-card modal with Escape (does not exit the game).
  useEffect(() => {
    if (!selectedCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCard]);

  const handleSpin = useCallback(() => {
    // spinTimeoutRef is non-null during the post-land pause while the modal
    // open is pending — spinning then would pop the previous card's modal
    // over the new spin, so the button stays inert for that beat.
    if (isSpinning || spinTimeoutRef.current !== null || remainingCards.length === 0) return;

    // Re-sample the wheel every spin so all cards cycle through large sets.
    const spinWheel = sampleWheelCards(remainingCards);
    setWheelCards(spinWheel);

    const count = spinWheel.length;
    const segmentAngle = 360 / count;

    // Skip cooldown: with more than 1 card remaining, never land on the card
    // that was skipped in the previous modal.
    let candidates = spinWheel.map((_, i) => i);
    if (remainingCards.length > 1 && lastSkippedIdRef.current !== null) {
      const filtered = candidates.filter((i) => spinWheel[i].id !== lastSkippedIdRef.current);
      if (filtered.length > 0) candidates = filtered;
    }
    lastSkippedIdRef.current = null;
    const randomIndex = candidates[Math.floor(Math.random() * candidates.length)];
    const landingAngle = 360 - (randomIndex * segmentAngle + segmentAngle / 2);

    // Add 5-8 full bonus rotations
    const bonusRotations = (5 + Math.floor(Math.random() * 4)) * 360;
    const totalRotation = prevRotationRef.current + bonusRotations + landingAngle + (360 - (prevRotationRef.current % 360));

    setLandedIndex(null);
    setIsSpinning(true);
    setRotationDeg(totalRotation);
    prevRotationRef.current = totalRotation;
    playSound('spin');

    const settle = () => {
      settleRef.current = null;
      setIsSpinning(false);
      setLandedIndex(randomIndex);
      playSound('land');
      // Brief pause so the landed-segment pulse can read before the modal opens.
      spinTimeoutRef.current = setTimeout(() => {
        spinTimeoutRef.current = null;
        setSelectedCard(spinWheel[randomIndex]);
        setIsFlipped(false);
      }, reduce ? 150 : 550);
    };

    settleRef.current = settle;
    if (reduce) {
      // Skip the long decelerating animation for reduced motion.
      spinTimeoutRef.current = setTimeout(settle, 300);
    } else {
      spinTimeoutRef.current = setTimeout(settle, 2800);
    }
  }, [isSpinning, remainingCards, reduce]);

  // Tap/click on the wheel while spinning fast-forwards to the final rotation.
  const handleFastForward = useCallback(() => {
    const settle = settleRef.current;
    if (!settle) return;
    if (spinTimeoutRef.current) {
      clearTimeout(spinTimeoutRef.current);
      spinTimeoutRef.current = null;
    }
    // Nudge the target so framer-motion re-animates; with isSpinning false the
    // transition is duration 0, snapping the wheel to its final rotation.
    setRotationDeg((r) => r + 0.001);
    settle();
  }, []);

  const handleGotIt = useCallback(() => {
    if (!selectedCard) return;
    playSound('correct');
    setRemainingCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
    setWheelCards((prev) => prev.filter((c) => c.id !== selectedCard.id));
    setDoneCount((d) => d + 1);
    setSelectedCard(null);
    setLandedIndex(null);
  }, [selectedCard]);

  const handleSkip = useCallback(() => {
    if (selectedCard) lastSkippedIdRef.current = selectedCard.id;
    setSkippedCount((s) => s + 1);
    setSelectedCard(null);
    setLandedIndex(null);
  }, [selectedCard]);

  const handleReset = useCallback(() => {
    // L9: clear any pending spin timeout and reset spinning state so a stale
    // callback from a pre-reset spin can't fire after a fresh start.
    if (spinTimeoutRef.current) {
      clearTimeout(spinTimeoutRef.current);
      spinTimeoutRef.current = null;
    }
    settleRef.current = null;
    lastSkippedIdRef.current = null;
    setIsSpinning(false);
    setRemainingCards([...cards]);
    setWheelCards(sampleWheelCards(cards));
    setDoneCount(0);
    setSkippedCount(0);
    setRotationDeg(0);
    prevRotationRef.current = 0;
    setSelectedCard(null);
    setLandedIndex(null);
  }, [cards]);

  const containerVariants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 18 },
    show: {
      opacity: 1,
      y: 0,
      transition: reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 240, damping: 22 },
    },
  };

  // All done
  if (remainingCards.length === 0) {
    return (
      <div className="relative min-h-[70vh]">
        <Aurora reduce={reduce} />
        <div className="relative max-w-2xl mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, scale: reduce ? 1 : 0.92, y: reduce ? 0 : 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 220, damping: 20 }}
            className="p-8 text-center"
            style={{
              background: 'var(--color-surface)',
              boxShadow: 'var(--shadow-modal)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border-light)',
            }}
          >
            <motion.div
              className="text-6xl mb-4"
              initial={{ scale: reduce ? 1 : 0, rotate: reduce ? 0 : -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
            >
              🎉
            </motion.div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
              All Done!
            </h2>
            <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
              You spun through all {totalCards} cards
            </p>

            <div className="flex items-center justify-center gap-3 mb-8">
              <StatChip label="Completed" value={`${totalCards}`} accent="var(--color-success)" />
              <StatChip label="Spins" value={`${totalCards + skippedCount}`} />
              {skippedCount > 0 && (
                <StatChip label="Skipped" value={`${skippedCount}`} accent="var(--color-warning)" />
              )}
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="primary" onClick={handleReset}>
                Play Again
              </Button>
              <Button variant="outline" onClick={() => navigate(exitTo)}>
                Exit
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const count = wheelCards.length;
  const segmentAngle = 360 / count;
  const wheelSize = 360;
  const wheelRadius = 170;
  const centerX = wheelSize / 2;
  const centerY = wheelSize / 2;

  // Build SVG segments
  const segments = wheelCards.map((card, i) => {
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

    const color = segmentColor(i, count);
    const isLanded = i === landedIndex;

    // Label position (midpoint of arc)
    const midAngle = ((i + 0.5) * segmentAngle - 90) * (Math.PI / 180);
    const labelRadius = wheelRadius * 0.65;
    const labelX = centerX + labelRadius * Math.cos(midAngle);
    const labelY = centerY + labelRadius * Math.sin(midAngle);
    const labelRotation = (i + 0.5) * segmentAngle;

    const display = getDisplaySide(card);

    // Image dimensions based on segment count
    const imgSize = count <= 4 ? 50 : count <= 8 ? 36 : 26;
    const fontSize = count <= 4 ? 14 : count <= 8 ? 12 : 10;
    const maxChars = count <= 4 ? 24 : count <= 8 ? 18 : 12;
    const truncated = display.text.length > maxChars
      ? display.text.slice(0, maxChars - 2) + '..'
      : display.text;

    // Unique clip path id for this segment's image (instance-unique via useId)
    const clipId = `${clipIdPrefix}-clip-seg-${i}`;

    return (
      <motion.g
        key={card.id}
        style={{
          filter: isLanded ? 'brightness(1.12) saturate(1.1)' : undefined,
          transformBox: 'view-box',
          transformOrigin: `${centerX}px ${centerY}px`,
        }}
        animate={isLanded && !reduce ? { scale: [1, 1.07, 1] } : { scale: 1 }}
        transition={isLanded && !reduce ? { duration: 0.45, ease: 'easeOut' } : { duration: 0 }}
      >
        <path
          d={pathD}
          fill={color}
          stroke={isLanded ? '#ffffff' : 'rgba(255,255,255,0.85)'}
          strokeWidth={isLanded ? 4 : 2}
          strokeLinejoin="round"
        />
        {display.imageSrc ? (
          <>
            <defs>
              <clipPath id={clipId}>
                <circle cx={labelX} cy={labelY} r={imgSize / 2} />
              </clipPath>
            </defs>
            <image
              href={display.imageSrc}
              x={labelX - imgSize / 2}
              y={labelY - imgSize / 2}
              width={imgSize}
              height={imgSize}
              clipPath={`url(#${clipId})`}
              transform={`rotate(${labelRotation}, ${labelX}, ${labelY})`}
              preserveAspectRatio="xMidYMid slice"
              style={{ pointerEvents: 'none' }}
            />
          </>
        ) : (
          <text
            x={labelX}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${labelRotation}, ${labelX}, ${labelY})`}
            fill="#ffffff"
            fontSize={fontSize}
            fontWeight="600"
            fontFamily="var(--font-sans)"
            style={{ pointerEvents: 'none' }}
          >
            {truncated}
          </text>
        )}
      </motion.g>
    );
  });

  const progress = totalCards > 0 ? doneCount / totalCards : 0;

  return (
    <div className="relative min-h-[70vh]">
      <Aurora reduce={reduce} />

      <motion.div
        className="relative max-w-2xl mx-auto px-4 py-8"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-5">
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(exitTo)}>
              Exit
            </Button>
            <div className="flex items-center gap-2">
              <StatChip label="Done" value={`${doneCount}/${totalCards}`} accent="var(--color-success)" />
              <StatChip label="Left" value={`${remainingCards.length}`} accent="var(--color-primary)" />
              {skippedCount > 0 && (
                <StatChip label="Skipped" value={`${skippedCount}`} accent="var(--color-warning)" />
              )}
            </div>
            <div className="flex items-center gap-1">
              <SoundToggle />
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Reset
              </Button>
            </div>
          </div>

          {/* Progress bar (transform-based for perf) */}
          <div
            className="h-1.5 w-full overflow-hidden"
            style={{ background: 'var(--color-muted)', borderRadius: 'var(--radius-full)' }}
            aria-hidden="true"
          >
            <motion.div
              className="h-full origin-left"
              style={{ background: 'var(--color-primary)', borderRadius: 'var(--radius-full)' }}
              initial={false}
              animate={{ scaleX: progress }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 30 }}
            />
          </div>
        </motion.div>

        {/* Wheel */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          {/* Pointer triangle (nudges/ticks while spinning) */}
          <motion.svg
            width="34"
            height="24"
            viewBox="0 0 34 24"
            className="mb-[-6px] z-10 relative"
            style={{ transformOrigin: '17px 0px', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.3))' }}
            animate={isSpinning && !reduce ? { rotate: [0, -13, 0] } : { rotate: 0 }}
            transition={isSpinning && !reduce ? { duration: 0.11, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          >
            <polygon
              points="4,0 30,0 17,22"
              fill="var(--color-primary)"
              stroke="var(--color-surface)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </motion.svg>

          {/* Wheel + glow ring (tap during a spin to fast-forward to the result) */}
          <div
            className="relative flex items-center justify-center w-full max-w-[360px]"
            onClick={handleFastForward}
            style={{ cursor: isSpinning ? 'pointer' : 'default' }}
            title={isSpinning ? 'Tap to skip the spin' : undefined}
          >
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{ inset: '-4px' }}
              animate={{
                boxShadow: isSpinning
                  ? '0 0 44px 4px var(--color-primary-ring)'
                  : landedIndex !== null
                    ? '0 0 52px 6px var(--color-primary-ring)'
                    : '0 0 22px 0px var(--color-primary-ring)',
              }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
            <motion.svg
              width={wheelSize}
              height={wheelSize}
              viewBox={`0 0 ${wheelSize} ${wheelSize}`}
              className="w-full h-auto relative"
              animate={{ rotate: rotationDeg }}
              transition={
                isSpinning && !reduce
                  ? { duration: 2.8, ease: [0.17, 0.67, 0.12, 0.99] }
                  : { duration: 0 }
              }
              style={{ willChange: isSpinning ? 'transform' : 'auto' }}
            >
              {/* Outer rim */}
              <circle
                cx={centerX}
                cy={centerY}
                r={wheelRadius + 3}
                fill="none"
                stroke="var(--color-surface)"
                strokeWidth="6"
                opacity="0.9"
              />
              {segments}
              {/* Center hub */}
              <circle cx={centerX} cy={centerY} r="26" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="4" />
              <circle cx={centerX} cy={centerY} r="9" fill="var(--color-primary)" />
            </motion.svg>
          </div>

          {/* Sampled-wheel caption */}
          {count < remainingCards.length && (
            <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
              {count} of {remainingCards.length} on the wheel
            </p>
          )}

          {/* Spin button */}
          <Button
            variant="primary"
            size="lg"
            className="mt-6 min-w-[160px]"
            onClick={handleSpin}
            disabled={isSpinning}
          >
            {isSpinning ? 'Spinning…' : 'SPIN!'}
          </Button>
        </motion.div>
      </motion.div>

      {/* Modal overlay for selected card */}
      <AnimatePresence>
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
            onClick={() => setSelectedCard(null)}
          >
            <motion.div
              initial={{ scale: reduce ? 1 : 0.9, opacity: 0, y: reduce ? 0 : 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: reduce ? 1 : 0.92, opacity: 0 }}
              transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 300, damping: 26 }}
              className="w-full max-w-md overflow-hidden"
              style={{
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-xl)',
                boxShadow: 'var(--shadow-modal)',
                border: '1px solid var(--color-border-light)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Accent bar */}
              <div
                className="h-1.5 w-full"
                style={{ background: 'linear-gradient(90deg, var(--color-primary), var(--color-success))' }}
              />

              {/* Flipcard */}
              <div
                className="relative cursor-pointer select-none"
                style={{ perspective: 1000, minHeight: 240 }}
                onClick={() => setIsFlipped((f) => !f)}
              >
                <div style={{ transformStyle: 'preserve-3d', position: 'relative', minHeight: 240 }}>
                  {/* Front */}
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center p-8"
                    style={{
                      background: 'var(--color-surface)',
                      backfaceVisibility: 'hidden',
                      minHeight: 240,
                    }}
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 280, damping: 26 }}
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
                    className="absolute inset-0 flex items-center justify-center p-8"
                    style={{
                      background: 'var(--color-surface)',
                      backfaceVisibility: 'hidden',
                      minHeight: 240,
                    }}
                    animate={{ rotateY: isFlipped ? 0 : -180 }}
                    transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 280, damping: 26 }}
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
              <div className="flex gap-3 p-4" style={{ borderTop: '1px solid var(--color-border-light)' }}>
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

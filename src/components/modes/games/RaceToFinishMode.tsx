import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card, QuestionType, AnswerDirection } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, stripHtml, normalizeAnswer, cn } from '@/lib/utils';
import {
  buildEquivalenceGroups,
  getEquivalentAnswers,
  getWrongOptionPool,
  gradeWrittenAnswer,
} from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface RaceToFinishModeProps {
  cards: Card[];
  setId: string;
}

interface RaceConfig {
  playerCount: number;
  pathLength: number;
  direction: AnswerDirection;
  questionTypes: QuestionType[];
}

interface Player {
  id: number;
  emoji: string;
  color: string;
  position: number;
  correctCount: number;
  totalCount: number;
}

interface RaceQuestion {
  card: Card;
  type: QuestionType;
  promptHtml: string;
  correctAnswers: string[];
  options?: string[];
  tfPair?: { term: string; definition: string; isCorrect: boolean };
}

const PLAYER_EMOJIS = ['\uD83D\uDE80', '\uD83D\uDD25', '\uD83C\uDF3F', '\u26A1'];
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b'];

function buildRaceQuestion(
  card: Card,
  cards: Card[],
  groups: Map<string, Card[]>,
  type: QuestionType,
  direction: AnswerDirection,
  questionIndex: number,
): RaceQuestion {
  const isReverse =
    direction === 'def-to-term' ||
    (direction === 'both' && questionIndex % 2 === 1);

  const promptHtml = isReverse ? card.definition : card.term;
  const correctAnswers = isReverse
    ? [card.term]
    : getEquivalentAnswers(card, 'definition', groups);

  if (type === 'multiple-choice') {
    const wrongPool = isReverse
      ? cards.filter((c) => c.id !== card.id).map((c) => c.term)
      : getWrongOptionPool(card, cards, groups);
    const wrongs = shuffleArray(wrongPool).slice(0, 3);
    if (wrongs.length < 1) {
      return { card, type: 'written', promptHtml, correctAnswers };
    }
    const correctDef = isReverse ? card.term : card.definition;
    const options = shuffleArray([correctDef, ...wrongs]);
    return { card, type: 'multiple-choice', promptHtml, correctAnswers, options };
  }

  if (type === 'true-false') {
    const isCorrect = Math.random() > 0.5;
    let shownDef = isReverse ? card.term : card.definition;
    if (!isCorrect) {
      const wrongPool = isReverse
        ? cards.filter((c) => c.id !== card.id).map((c) => c.term)
        : getWrongOptionPool(card, cards, groups);
      if (wrongPool.length > 0) {
        shownDef = shuffleArray(wrongPool)[0];
      }
    }
    return {
      card,
      type: 'true-false',
      promptHtml,
      correctAnswers,
      tfPair: {
        term: isReverse ? card.definition : card.term,
        definition: shownDef,
        isCorrect: isCorrect || correctAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(shownDef)),
      },
    };
  }

  return { card, type: 'written', promptHtml, correctAnswers };
}

// --- Config Screen ---

function ConfigScreen({
  cardCount,
  onStart,
}: {
  cardCount: number;
  onStart: (config: RaceConfig) => void;
}) {
  const [playerCount, setPlayerCount] = useState(1);
  const [pathLength, setPathLength] = useState(15);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [types, setTypes] = useState<QuestionType[]>(['multiple-choice', 'written']);

  const pathPresets = [10, 15, 20, 30, 50, 75, 100];

  const toggleType = (type: QuestionType) => {
    setTypes((prev) =>
      prev.includes(type)
        ? prev.length > 1 ? prev.filter((t) => t !== type) : prev
        : [...prev, type],
    );
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--color-text)' }}>
        Race to Finish
      </h2>

      <div
        className="rounded-2xl p-6 space-y-6"
        style={{
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-card)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Player count */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Players
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setPlayerCount(n)}
                className="flex-1 py-3 rounded-lg text-center cursor-pointer"
                style={{
                  background: playerCount === n ? PLAYER_COLORS[n - 1] : 'var(--color-muted)',
                  color: playerCount === n ? '#ffffff' : 'var(--color-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '1.2rem',
                }}
              >
                {PLAYER_EMOJIS[n - 1]} {n}
              </button>
            ))}
          </div>
        </div>

        {/* Path length */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Path Length
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setPathLength((l) => Math.max(5, l - 5))}
              className="w-8 h-8 rounded-lg text-lg font-bold cursor-pointer"
              style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none', borderRadius: 'var(--radius-md)' }}
            >
              -
            </button>
            {pathPresets.map((p) => (
              <button
                key={p}
                onClick={() => setPathLength(p)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                style={{
                  background: pathLength === p ? 'var(--color-primary)' : 'var(--color-muted)',
                  color: pathLength === p ? '#ffffff' : 'var(--color-text)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPathLength((l) => l + 5)}
              className="w-8 h-8 rounded-lg text-lg font-bold cursor-pointer"
              style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none', borderRadius: 'var(--radius-md)' }}
            >
              +
            </button>
          </div>
        </div>

        {/* Direction */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Direction
          </label>
          <div className="flex flex-col gap-2">
            {([
              ['term-to-def', 'Term \u2192 Definition'],
              ['def-to-term', 'Definition \u2192 Term'],
              ['both', 'Both'],
            ] as [AnswerDirection, string][]).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-text)' }}>
                <input
                  type="radio"
                  name="direction"
                  checked={direction === value}
                  onChange={() => setDirection(value)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Question types */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Question Types
          </label>
          <div className="flex flex-col gap-2">
            {([
              ['written', 'Written'],
              ['multiple-choice', 'Multiple Choice'],
              ['true-false', 'True / False'],
            ] as [QuestionType, string][]).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--color-text)' }}>
                <input
                  type="checkbox"
                  checked={types.includes(value)}
                  onChange={() => toggleType(value)}
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <Button variant="primary" className="w-full" onClick={() => onStart({ playerCount, pathLength, direction, questionTypes: types })}>
          Start Race
        </Button>
      </div>
    </div>
  );
}

// --- Main Game ---

function RaceToFinishMode({ cards, setId }: RaceToFinishModeProps) {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<'config' | 'playing' | 'results'>('config');
  const [config, setConfig] = useState<RaceConfig | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<RaceQuestion | null>(null);
  const [winner, setWinner] = useState<Player | null>(null);
  const [shortcuts, setShortcuts] = useState<Map<number, number>>(new Map());

  // Question UI state
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [diceRoll, setDiceRoll] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showShortcut, setShowShortcut] = useState(false);

  const questionIndexRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const moveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const moveTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const groups = useMemo(() => buildEquivalenceGroups(cards), [cards]);

  // Cleanup intervals and timeouts on unmount
  useEffect(() => {
    return () => {
      if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
      for (const t of moveTimeoutsRef.current) clearTimeout(t);
      moveTimeoutsRef.current.clear();
    };
  }, []);

  // Generate shortcuts for paths >= 15
  const generateShortcuts = useCallback((pathLen: number) => {
    const sc = new Map<number, number>();
    if (pathLen < 15) return sc;
    const shortcutCount = Math.max(1, Math.floor(pathLen / 10));
    const used = new Set<number>();
    for (let i = 0; i < shortcutCount; i++) {
      let from: number;
      do {
        from = 3 + Math.floor(Math.random() * (pathLen - 6));
      } while (used.has(from));
      used.add(from);
      const jump = 2 + Math.floor(Math.random() * 3);
      const to = Math.min(pathLen - 1, from + jump);
      sc.set(from, to);
    }
    return sc;
  }, []);

  const generateQuestion = useCallback(() => {
    if (!config) return null;
    const card = cards[Math.floor(Math.random() * cards.length)];
    const type = config.questionTypes[questionIndexRef.current % config.questionTypes.length];
    questionIndexRef.current++;
    return buildRaceQuestion(card, cards, groups, type, config.direction, questionIndexRef.current);
  }, [cards, config, groups]);

  const handleStart = useCallback((cfg: RaceConfig) => {
    const newPlayers: Player[] = [];
    for (let i = 0; i < cfg.playerCount; i++) {
      newPlayers.push({
        id: i,
        emoji: PLAYER_EMOJIS[i],
        color: PLAYER_COLORS[i],
        position: 0,
        correctCount: 0,
        totalCount: 0,
      });
    }
    setConfig(cfg);
    setPlayers(newPlayers);
    setCurrentPlayerIndex(0);
    setWinner(null);
    setShortcuts(generateShortcuts(cfg.pathLength));
    questionIndexRef.current = 0;
    setPhase('playing');

    // Generate first question
    const card = cards[Math.floor(Math.random() * cards.length)];
    const type = cfg.questionTypes[0];
    const q = buildRaceQuestion(card, cards, groups, type, cfg.direction, 0);
    setCurrentQuestion(q);
    resetQuestionState();
  }, [cards, groups, generateShortcuts]);

  const resetQuestionState = () => {
    setUserAnswer('');
    setSelectedOption(null);
    setFeedback(null);
    setDiceRoll(null);
    setShowShortcut(false);
  };

  const animateMove = useCallback((playerIdx: number, from: number, to: number, onDone: () => void) => {
    if (from >= to) { onDone(); return; }
    // Clear any previous move interval
    if (moveIntervalRef.current) clearInterval(moveIntervalRef.current);
    setIsAnimating(true);
    let step = from;
    const interval = setInterval(() => {
      step++;
      setPlayers((prev) =>
        prev.map((p, i) => i === playerIdx ? { ...p, position: step } : p),
      );
      // Auto-scroll to current player position
      if (boardRef.current) {
        const node = boardRef.current.querySelector(`[data-cell="${step}"]`);
        if (node) {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
      if (step >= to) {
        clearInterval(interval);
        moveIntervalRef.current = null;
        setIsAnimating(false);
        onDone();
      }
    }, 350);
    moveIntervalRef.current = interval;
  }, []);

  const processCorrectAnswer = useCallback((playerIdx: number) => {
    if (!config) return;

    // Dice roll animation
    const roll = 1 + Math.floor(Math.random() * 6);
    setDiceRoll(roll);

    const t1 = setTimeout(() => {
      moveTimeoutsRef.current.delete(t1);
      const player = players[playerIdx];
      const newPos = Math.min(config.pathLength, player.position + roll);

      animateMove(playerIdx, player.position, newPos, () => {
        // Check shortcut
        if (shortcuts.has(newPos)) {
          const dest = shortcuts.get(newPos)!;
          setShowShortcut(true);
          const t2 = setTimeout(() => {
            moveTimeoutsRef.current.delete(t2);
            animateMove(playerIdx, newPos, dest, () => {
              setShowShortcut(false);
              checkWinAndAdvance(playerIdx, dest);
            });
          }, 800);
          moveTimeoutsRef.current.add(t2);
        } else {
          checkWinAndAdvance(playerIdx, newPos);
        }
      });
    }, 600);
    moveTimeoutsRef.current.add(t1);
  }, [config, players, shortcuts, animateMove]);

  const checkWinAndAdvance = useCallback((playerIdx: number, finalPos: number) => {
    if (!config) return;

    if (finalPos >= config.pathLength) {
      const winningPlayer = { ...players[playerIdx], position: finalPos };
      setWinner(winningPlayer);
      setPhase('results');
      return;
    }

    // Next player
    const nextPlayer = (playerIdx + 1) % (config?.playerCount ?? 1);
    setCurrentPlayerIndex(nextPlayer);
    setCurrentQuestion(generateQuestion());
    resetQuestionState();
  }, [config, players, generateQuestion]);

  const handleAnswer = useCallback((isCorrect: boolean) => {
    const playerIdx = currentPlayerIndex;
    setPlayers((prev) =>
      prev.map((p, i) =>
        i === playerIdx
          ? { ...p, totalCount: p.totalCount + 1, correctCount: p.correctCount + (isCorrect ? 1 : 0) }
          : p,
      ),
    );

    if (isCorrect) {
      setFeedback('correct');
      processCorrectAnswer(playerIdx);
    } else {
      setFeedback('wrong');
      // Skip turn after delay
      setTimeout(() => {
        const nextPlayer = (playerIdx + 1) % (config?.playerCount ?? 1);
        setCurrentPlayerIndex(nextPlayer);
        setCurrentQuestion(generateQuestion());
        resetQuestionState();
      }, 1500);
    }
  }, [currentPlayerIndex, config, processCorrectAnswer, generateQuestion]);

  const checkWritten = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (feedback || !userAnswer.trim() || !currentQuestion) return;
    const isCorrect = gradeWrittenAnswer(userAnswer, currentQuestion.correctAnswers);
    handleAnswer(isCorrect);
  }, [feedback, userAnswer, currentQuestion, handleAnswer]);

  const checkMC = useCallback((option: string) => {
    if (feedback || !currentQuestion) return;
    setSelectedOption(option);
    const isCorrect = currentQuestion.correctAnswers.some(
      (a) => normalizeAnswer(a) === normalizeAnswer(option),
    );
    handleAnswer(isCorrect);
  }, [feedback, currentQuestion, handleAnswer]);

  const checkTF = useCallback((answer: boolean) => {
    if (feedback || !currentQuestion) return;
    const isCorrect = answer === currentQuestion.tfPair?.isCorrect;
    handleAnswer(isCorrect);
  }, [feedback, currentQuestion, handleAnswer]);

  if (phase === 'config') {
    return <ConfigScreen cardCount={cards.length} onStart={handleStart} />;
  }

  // Results
  if (phase === 'results' && config) {
    const sortedPlayers = [...players].sort((a, b) => b.position - a.position);

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
          <div className="text-5xl mb-2">{'\uD83C\uDFC6'}</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            {winner ? `Player ${winner.id + 1} Wins!` : 'Race Over!'}
          </h2>
          <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {winner?.emoji} crossed the finish line first!
          </p>

          {/* Standings table */}
          <div className="mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-tertiary)' }}>
                  <th className="text-left py-2">Place</th>
                  <th className="text-left py-2">Player</th>
                  <th className="text-center py-2">Position</th>
                  <th className="text-center py-2">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((player, rank) => {
                  const accuracy = player.totalCount > 0
                    ? Math.round((player.correctCount / player.totalCount) * 100)
                    : 0;
                  return (
                    <tr
                      key={player.id}
                      className="border-t"
                      style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    >
                      <td className="py-2 text-left font-bold">{rank === 0 ? '\uD83E\uDD47' : rank === 1 ? '\uD83E\uDD48' : rank === 2 ? '\uD83E\uDD49' : `${rank + 1}`}</td>
                      <td className="py-2 text-left">
                        <span style={{ color: player.color }}>{player.emoji}</span> Player {player.id + 1}
                      </td>
                      <td className="py-2 text-center">{player.position}/{config.pathLength}</td>
                      <td className="py-2 text-center">{accuracy}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="primary" onClick={() => setPhase('config')}>
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

  if (!currentQuestion || !config) return null;

  const currentPlayer = players[currentPlayerIndex];
  const cellSize = 48;
  const pathLen = config.pathLength;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/sets/${setId}`)}>
          Exit
        </Button>
        <div className="flex items-center gap-2">
          {players.map((p) => (
            <span
              key={p.id}
              className={cn(
                'px-2 py-1 rounded-lg text-sm font-medium',
                p.id === currentPlayerIndex && 'ring-2',
              )}
              style={{
                background: p.id === currentPlayerIndex ? p.color : 'var(--color-muted)',
                color: p.id === currentPlayerIndex ? '#ffffff' : 'var(--color-text)',
                borderColor: p.id === currentPlayerIndex ? p.color : undefined,
              }}
            >
              {p.emoji} {p.position}
            </span>
          ))}
        </div>
        <div className="w-12" />
      </div>

      {/* Shortcut flash overlay */}
      <AnimatePresence>
        {showShortcut && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.3)' }}
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1.2 }}
              exit={{ scale: 0 }}
              className="text-6xl"
            >
              {'\u26A1'} Shortcut!
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Question panel */}
        <div className="flex-1">
          <div
            className="mb-3 text-center text-sm font-semibold py-2 rounded-lg"
            style={{
              background: currentPlayer.color,
              color: '#ffffff',
              borderRadius: 'var(--radius-md)',
            }}
          >
            {currentPlayer.emoji} Player {currentPlayer.id + 1}'s Turn
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentPlayerIndex}-${questionIndexRef.current}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl p-6"
              style={{
                background: 'var(--color-surface)',
                boxShadow: 'var(--shadow-card)',
                borderRadius: 'var(--radius-xl)',
              }}
            >
              <div className="text-xs uppercase tracking-wider mb-2 font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                {currentQuestion.type === 'true-false' ? 'True or False?' : 'What is the answer?'}
              </div>

              {currentQuestion.type === 'true-false' && currentQuestion.tfPair ? (
                <div className="mb-6">
                  <div className="mb-3">
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Term:</span>
                    <StudyContent html={currentQuestion.tfPair.term} className="text-xl font-semibold mt-1" />
                  </div>
                  <div>
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>Definition:</span>
                    <StudyContent html={currentQuestion.tfPair.definition} className="text-xl mt-1" />
                  </div>
                </div>
              ) : (
                <StudyContent html={currentQuestion.promptHtml} className="text-2xl font-semibold mb-6" />
              )}

              {/* Written */}
              {currentQuestion.type === 'written' && (
                <form onSubmit={checkWritten}>
                  <input
                    type="text"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="Type your answer..."
                    disabled={feedback !== null}
                    autoFocus
                    className="w-full h-12 px-4 rounded-xl text-base outline-none"
                    style={{
                      background: 'var(--color-muted)',
                      color: 'var(--color-text)',
                      border: `2px solid ${
                        feedback === 'correct' ? 'var(--color-success)'
                          : feedback === 'wrong' ? 'var(--color-danger)'
                          : 'var(--color-border)'
                      }`,
                      borderRadius: 'var(--radius-md)',
                    }}
                  />
                  {!feedback && (
                    <Button variant="primary" type="submit" className="mt-3 w-full">Submit</Button>
                  )}
                </form>
              )}

              {/* MC */}
              {currentQuestion.type === 'multiple-choice' && currentQuestion.options && (
                <div className="grid gap-3">
                  {currentQuestion.options.map((option, i) => {
                    const isSelected = selectedOption === option;
                    const isCorrectOption = currentQuestion.correctAnswers.some(
                      (a) => normalizeAnswer(a) === normalizeAnswer(option),
                    );
                    let borderColor = 'var(--color-border)';
                    let bg = 'var(--color-surface-raised)';
                    if (feedback) {
                      if (isCorrectOption) { borderColor = 'var(--color-success)'; bg = 'var(--color-success-light)'; }
                      else if (isSelected) { borderColor = 'var(--color-danger)'; bg = 'var(--color-danger-light)'; }
                    }
                    return (
                      <motion.button
                        key={i}
                        onClick={() => checkMC(option)}
                        disabled={feedback !== null || isAnimating}
                        whileTap={feedback ? undefined : { scale: 0.98 }}
                        className="w-full text-left p-4 rounded-xl cursor-pointer"
                        style={{
                          background: bg,
                          border: `2px solid ${borderColor}`,
                          borderRadius: 'var(--radius-md)',
                          color: 'var(--color-text)',
                          opacity: feedback && !isCorrectOption && !isSelected ? 0.5 : 1,
                        }}
                      >
                        <StudyContent html={option} />
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* T/F */}
              {currentQuestion.type === 'true-false' && (
                <div className="flex gap-3">
                  {['True', 'False'].map((label) => {
                    const val = label === 'True';
                    const isCorrectBtn = feedback && val === currentQuestion.tfPair?.isCorrect;
                    const isWrongBtn = feedback && val !== currentQuestion.tfPair?.isCorrect;
                    return (
                      <Button key={label} variant="outline" className="flex-1" onClick={() => checkTF(val)} disabled={feedback !== null || isAnimating}>
                        <span style={{
                          color: isCorrectBtn ? 'var(--color-success)' : isWrongBtn ? 'var(--color-danger)' : undefined,
                          fontWeight: isCorrectBtn ? 700 : undefined,
                        }}>
                          {label}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}

              {/* Feedback */}
              {feedback && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                  {feedback === 'correct' ? (
                    <div className="p-3 rounded-xl" style={{ background: 'var(--color-success-light)' }}>
                      <p className="font-semibold" style={{ color: 'var(--color-success)' }}>
                        Correct! {diceRoll !== null && `Rolled a ${diceRoll}!`}
                      </p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl" style={{ background: 'var(--color-danger-light)' }}>
                      <p className="font-semibold mb-1" style={{ color: 'var(--color-danger)' }}>Incorrect - Skip turn</p>
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Correct: <span className="font-medium" style={{ color: 'var(--color-text)' }}>{stripHtml(currentQuestion.correctAnswers[0])}</span>
                      </p>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Board */}
        <div
          ref={boardRef}
          className="w-full md:w-48 flex-shrink-0 overflow-y-auto rounded-2xl"
          style={{
            maxHeight: 500,
            background: 'var(--color-muted)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <svg
            width="100%"
            viewBox={`0 0 120 ${(pathLen + 1) * 60 + 40}`}
            className="block"
          >
            {/* Path nodes, bottom to top */}
            {Array.from({ length: pathLen + 1 }).map((_, idx) => {
              const cellIdx = idx;
              const cy = (pathLen - idx) * 60 + 40;
              const cx = 60;
              const isStart = idx === 0;
              const isFinish = idx === pathLen;
              const isShortcut = shortcuts.has(idx);

              // Players on this cell
              const playersHere = players.filter((p) => p.position === cellIdx);

              let fill = 'var(--color-surface)';
              let stroke = 'var(--color-border)';
              let label = `${idx}`;

              if (isStart) { fill = '#22c55e'; stroke = '#16a34a'; label = 'GO'; }
              else if (isFinish) { fill = '#f59e0b'; stroke = '#d97706'; label = '\uD83C\uDFC1'; }
              else if (isShortcut) { fill = '#06b6d4'; stroke = '#0891b2'; label = '\u26A1'; }

              return (
                <g key={idx} data-cell={cellIdx}>
                  {/* Connector line to next */}
                  {idx < pathLen && (
                    <line
                      x1={cx}
                      y1={cy}
                      x2={cx}
                      y2={cy - 60}
                      stroke="var(--color-border)"
                      strokeWidth="3"
                      strokeDasharray={isShortcut ? '6 4' : 'none'}
                    />
                  )}
                  {/* Shortcut arrow */}
                  {isShortcut && shortcuts.get(idx) !== undefined && (
                    <line
                      x1={cx + 20}
                      y1={cy}
                      x2={cx + 20}
                      y2={(pathLen - shortcuts.get(idx)!) * 60 + 40}
                      stroke="#06b6d4"
                      strokeWidth="2"
                      strokeDasharray="4 2"
                      markerEnd="url(#arrowhead)"
                    />
                  )}
                  {/* Node */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r="18"
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="2"
                  />
                  <text
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isStart || isFinish || isShortcut ? '#fff' : 'var(--color-text-tertiary)'}
                    fontSize={isStart || isFinish ? '10' : '9'}
                    fontWeight="600"
                    fontFamily="var(--font-sans)"
                  >
                    {label}
                  </text>
                  {/* Player tokens */}
                  {playersHere.map((p, pi) => (
                    <g key={p.id}>
                      <circle
                        cx={cx - 25 + pi * 16}
                        cy={cy}
                        r="10"
                        fill={p.color}
                        stroke="#fff"
                        strokeWidth="2"
                      />
                      <text
                        x={cx - 25 + pi * 16}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="10"
                      >
                        {p.emoji}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })}
            {/* Arrow marker definition */}
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="#06b6d4" />
              </marker>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
}

export default RaceToFinishMode;

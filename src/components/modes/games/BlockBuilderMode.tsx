import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card, QuestionType, AnswerDirection } from '@/types';
import { useNavigate } from 'react-router-dom';
import { shuffleArray, stripHtml, normalizeAnswer, cn, fairRepeatCards } from '@/lib/utils';
import {
  buildEquivalenceGroups,
  getEquivalentAnswers,
  getWrongOptionPool,
  gradeWrittenAnswer,
} from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface BlockBuilderModeProps {
  cards: Card[];
  setId: string;
}

type Difficulty = 'easy' | 'medium' | 'hard';
type GameState = 'playing' | 'won' | 'lost';

interface DifficultySettings {
  blockPenalty: number;
  lavaRise: number;
  scoreMultiplier: number;
}

const DIFFICULTY_MAP: Record<Difficulty, DifficultySettings> = {
  easy: { blockPenalty: 0, lavaRise: 20, scoreMultiplier: 1 },
  medium: { blockPenalty: 1, lavaRise: 30, scoreMultiplier: 1.5 },
  hard: { blockPenalty: 2, lavaRise: 40, scoreMultiplier: 2 },
};

interface GameConfig {
  difficulty: Difficulty;
  questionTypes: QuestionType[];
  direction: AnswerDirection;
  questionCount: number;
  isInfinite: boolean;
}

interface GameQuestion {
  card: Card;
  type: QuestionType;
  promptHtml: string;
  correctAnswers: string[];
  options?: string[];
  tfPair?: { term: string; definition: string; isCorrect: boolean };
}

function buildGameQuestions(
  cards: Card[],
  config: GameConfig,
): GameQuestion[] {
  const groups = buildEquivalenceGroups(cards);
  const count = config.isInfinite ? cards.length * 3 : config.questionCount;
  const selected = fairRepeatCards(cards, count);
  const questions: GameQuestion[] = [];
  const types = config.questionTypes;

  for (let i = 0; i < selected.length; i++) {
    const card = selected[i];
    const type = types[i % types.length];
    const isReverse =
      config.direction === 'def-to-term' ||
      (config.direction === 'both' && i % 2 === 1);

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
        questions.push({ card, type: 'written', promptHtml, correctAnswers });
        continue;
      }
      const correctDef = isReverse ? card.term : card.definition;
      const options = shuffleArray([correctDef, ...wrongs]);
      questions.push({ card, type: 'multiple-choice', promptHtml, correctAnswers, options });
    } else if (type === 'true-false') {
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
      questions.push({
        card,
        type: 'true-false',
        promptHtml,
        correctAnswers,
        tfPair: {
          term: isReverse ? card.definition : card.term,
          definition: shownDef,
          isCorrect: isCorrect || correctAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(shownDef)),
        },
      });
    } else {
      questions.push({ card, type: 'written', promptHtml, correctAnswers });
    }
  }

  return questions;
}

// --- Config Screen ---

function ConfigScreen({
  cardCount,
  onStart,
}: {
  cardCount: number;
  onStart: (config: GameConfig) => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [types, setTypes] = useState<QuestionType[]>(['written', 'multiple-choice', 'true-false']);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [questionCount, setQuestionCount] = useState(10);
  const [isInfinite, setIsInfinite] = useState(false);

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
        Block Builder
      </h2>

      <div
        className="rounded-2xl p-6 space-y-6"
        style={{
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-card)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Difficulty */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Difficulty
          </label>
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer capitalize"
                style={{
                  background: difficulty === d ? 'var(--color-primary)' : 'var(--color-muted)',
                  color: difficulty === d ? '#ffffff' : 'var(--color-text)',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                }}
              >
                {d}
              </button>
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

        {/* Question count */}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            Question Count
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuestionCount((c) => Math.max(1, c - 1))}
              disabled={isInfinite}
              className="w-8 h-8 rounded-lg text-lg font-bold cursor-pointer"
              style={{
                background: 'var(--color-muted)',
                color: 'var(--color-text)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                opacity: isInfinite ? 0.4 : 1,
              }}
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={999}
              value={isInfinite ? '' : questionCount}
              onChange={(e) => setQuestionCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={isInfinite}
              placeholder={isInfinite ? '\u221E' : ''}
              className="w-20 px-3 py-2 rounded-lg text-sm text-center outline-none"
              style={{
                background: 'var(--color-muted)',
                color: 'var(--color-text)',
                border: '2px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                opacity: isInfinite ? 0.4 : 1,
              }}
            />
            <button
              onClick={() => setQuestionCount((c) => c + 1)}
              disabled={isInfinite}
              className="w-8 h-8 rounded-lg text-lg font-bold cursor-pointer"
              style={{
                background: 'var(--color-muted)',
                color: 'var(--color-text)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                opacity: isInfinite ? 0.4 : 1,
              }}
            >
              +
            </button>
            <label className="flex items-center gap-2 cursor-pointer text-sm ml-2" style={{ color: 'var(--color-text)' }}>
              <input
                type="checkbox"
                checked={isInfinite}
                onChange={() => setIsInfinite((v) => !v)}
                style={{ accentColor: 'var(--color-primary)' }}
              />
              Infinity
            </label>
          </div>
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={() => onStart({ difficulty, questionTypes: types, direction, questionCount, isInfinite })}
        >
          Start Game
        </Button>
      </div>
    </div>
  );
}

// --- Main Game ---

function BlockBuilderMode({ cards, setId }: BlockBuilderModeProps) {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<'config' | 'game' | 'results'>('config');
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [questions, setQuestions] = useState<GameQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [gameState, setGameState] = useState<GameState>('playing');

  // Tower & lava state
  const [towerHeight, setTowerHeight] = useState(0);
  const [lavaHeight, setLavaHeight] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalAnswered, setTotalAnswered] = useState(0);

  // Question UI state
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const questionStartTimeRef = useRef(Date.now());

  const settings = config ? DIFFICULTY_MAP[config.difficulty] : DIFFICULTY_MAP.medium;
  const summitHeight = config
    ? (config.isInfinite ? 400 : Math.max(200, config.questionCount * 40))
    : 400;

  const currentQuestion = questions[currentIndex] ?? null;

  const handleStart = useCallback((cfg: GameConfig) => {
    const q = buildGameQuestions(cards, cfg);
    setConfig(cfg);
    setQuestions(q);
    setCurrentIndex(0);
    setGameState('playing');
    setTowerHeight(0);
    setLavaHeight(0);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setCorrectCount(0);
    setTotalAnswered(0);
    resetQuestionState();
    questionStartTimeRef.current = Date.now();
    setPhase('game');
  }, [cards]);

  const resetQuestionState = () => {
    setUserAnswer('');
    setSelectedOption(null);
    setFeedback(null);
  };

  const processAnswer = useCallback((isCorrect: boolean) => {
    const timeSpent = (Date.now() - questionStartTimeRef.current) / 1000;
    setTotalAnswered((t) => t + 1);

    if (isCorrect) {
      setCorrectCount((c) => c + 1);
      const newStreak = streak + 1;
      setStreak(newStreak);
      setMaxStreak((m) => Math.max(m, newStreak));

      // Score calculation
      const speedBonus = Math.max(0, Math.min(50, 50 * (1 - timeSpent / 15)));
      const streakMult = Math.min(2, 1 + (newStreak - 1) * 0.1);
      const points = Math.round((100 + speedBonus) * streakMult * settings.scoreMultiplier);
      setScore((s) => s + points);

      // Add block
      const newHeight = towerHeight + 40;
      setTowerHeight(newHeight);

      // Check win
      if (newHeight >= summitHeight) {
        setGameState('won');
        return;
      }
    } else {
      setStreak(0);
      // Block penalty — remove blocks on medium/hard
      const penalty = settings.blockPenalty * 40;
      const newTower = Math.max(0, towerHeight - penalty);
      setTowerHeight(newTower);

      // Lava rises on wrong answers
      const newLava = lavaHeight + settings.lavaRise;
      setLavaHeight(newLava);

      // Check lose: lava overtakes tower
      if (newLava >= newTower && newTower > 0) {
        setGameState('lost');
        return;
      }
    }

    setFeedback(isCorrect ? 'correct' : 'wrong');
  }, [streak, towerHeight, lavaHeight, summitHeight, settings]);

  const advance = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      if (config?.isInfinite) {
        // Generate more questions, trim old ones to prevent unbounded growth
        const more = buildGameQuestions(cards, config);
        const keepCount = 20;
        setQuestions((prev) => {
          if (prev.length > keepCount) {
            const trimmed = prev.slice(-keepCount);
            setCurrentIndex(keepCount - 1);
            return [...trimmed, ...more];
          }
          return [...prev, ...more];
        });
      } else {
        // Out of questions but didn't reach summit = lose
        setGameState('lost');
        return;
      }
    }
    setCurrentIndex((i) => i + 1);
    resetQuestionState();
    questionStartTimeRef.current = Date.now();
  }, [currentIndex, questions.length, config, cards]);

  const checkWritten = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (feedback || !userAnswer.trim() || !currentQuestion) return;
    const isCorrect = gradeWrittenAnswer(userAnswer, currentQuestion.correctAnswers);
    processAnswer(isCorrect);
  }, [feedback, userAnswer, currentQuestion, processAnswer]);

  const checkMC = useCallback((option: string) => {
    if (feedback || !currentQuestion) return;
    setSelectedOption(option);
    const isCorrect = currentQuestion.correctAnswers.some(
      (a) => normalizeAnswer(a) === normalizeAnswer(option),
    );
    processAnswer(isCorrect);
  }, [feedback, currentQuestion, processAnswer]);

  const checkTF = useCallback((answer: boolean) => {
    if (feedback || !currentQuestion) return;
    const isCorrect = answer === currentQuestion.tfPair?.isCorrect;
    processAnswer(isCorrect);
  }, [feedback, currentQuestion, processAnswer]);

  if (phase === 'config') {
    return <ConfigScreen cardCount={cards.length} onStart={handleStart} />;
  }

  // Results screen
  if (gameState === 'won' || gameState === 'lost') {
    const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;

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
          <h2 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
            {gameState === 'won' ? 'Tower Complete!' : 'Lava Wins!'}
          </h2>
          <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            {gameState === 'won'
              ? 'You built your tower to the summit!'
              : 'The lava overtook your tower.'}
          </p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-muted)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>{score}</div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Score</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-muted)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-success)' }}>{accuracy}%</div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Accuracy</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-muted)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-warning)' }}>{maxStreak}</div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Best Streak</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: 'var(--color-muted)' }}>
              <div className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{totalAnswered}</div>
              <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Questions</div>
            </div>
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

  if (!currentQuestion) return null;

  const towerBlocks = Math.floor(towerHeight / 40);
  const maxVisualHeight = Math.max(summitHeight, 400);
  const towerPercent = (towerHeight / maxVisualHeight) * 100;
  const lavaPercent = (lavaHeight / maxVisualHeight) * 100;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/sets/${setId}`)}>
          Exit
        </Button>
        <div className="flex items-center gap-4">
          <motion.span
            key={score}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            className="text-sm font-bold"
            style={{ color: 'var(--color-primary)' }}
          >
            Score: {score}
          </motion.span>
          <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
            Streak: {streak}
          </span>
        </div>
        <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
          Q{currentIndex + 1}
        </span>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Question panel */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl p-6"
              style={{
                background: 'var(--color-surface)',
                boxShadow: 'var(--shadow-card)',
                borderRadius: 'var(--radius-xl)',
                borderLeft: feedback === 'correct'
                  ? '4px solid var(--color-success)'
                  : feedback === 'wrong'
                    ? '4px solid var(--color-danger)'
                    : '4px solid transparent',
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
                        disabled={feedback !== null}
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
                      <Button key={label} variant="outline" className="flex-1" onClick={() => checkTF(val)} disabled={feedback !== null}>
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

              {/* Feedback + next */}
              {feedback && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4">
                  {feedback === 'correct' ? (
                    <div className="p-3 rounded-xl" style={{ background: 'var(--color-success-light)' }}>
                      <p className="font-semibold" style={{ color: 'var(--color-success)' }}>Correct!</p>
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl" style={{ background: 'var(--color-danger-light)' }}>
                      <p className="font-semibold mb-1" style={{ color: 'var(--color-danger)' }}>Incorrect</p>
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Correct: <span className="font-medium" style={{ color: 'var(--color-text)' }}>{stripHtml(currentQuestion.correctAnswers[0])}</span>
                      </p>
                    </div>
                  )}
                  <Button variant="primary" className="w-full mt-3" onClick={advance}>Next</Button>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Tower visualization */}
        <div
          className="w-full md:w-48 flex-shrink-0 relative overflow-hidden rounded-2xl"
          style={{
            height: 400,
            background: 'var(--color-muted)',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          {/* Summit line */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed"
            style={{
              bottom: `${Math.min(95, (summitHeight / maxVisualHeight) * 100)}%`,
              borderColor: 'var(--color-warning)',
              opacity: 0.6,
            }}
          >
            <span className="absolute right-1 -top-4 text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
              Summit
            </span>
          </div>

          {/* Tower blocks */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col-reverse items-center">
            {Array.from({ length: towerBlocks }).map((_, i) => {
              const hue = (i * 30) % 360;
              return (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="w-3/4"
                  style={{
                    height: 40,
                    background: `hsl(${hue}, 70%, 55%)`,
                    borderTop: '2px solid rgba(255,255,255,0.3)',
                  }}
                />
              );
            })}
          </div>

          {/* Lava */}
          <div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: `${Math.min(100, lavaPercent)}%`,
              background: 'linear-gradient(to top, #ff4500, #ff6b35, #ff8c42)',
              transition: 'height 0.5s ease-out',
            }}
          >
            {/* Wave animation */}
            <div
              className="absolute top-0 left-0 right-0 h-3"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                animation: 'lavaWave 2s ease-in-out infinite',
              }}
            />
          </div>

          {/* Score overlay */}
          <div className="absolute top-2 left-2 right-2 text-center">
            <div className="text-xs font-bold" style={{ color: 'var(--color-text-tertiary)' }}>
              {Math.round(towerPercent)}%
            </div>
          </div>
        </div>
      </div>

      {/* Inline keyframe for lava wave */}
      <style>{`
        @keyframes lavaWave {
          0%, 100% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

export default BlockBuilderMode;

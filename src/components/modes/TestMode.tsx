import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card, QuestionType, AnswerDirection, TestConfig } from '@/types';
import { useNavigate } from 'react-router-dom';
import { recordReview } from '@/lib/spaced-repetition';
import { useSetStore } from '@/stores/useSetStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { shuffleArray, stripHtml, normalizeAnswer } from '@/lib/utils';
import {
  buildEquivalenceGroups,
  getEquivalentAnswers,
  getWrongOptionPool,
  gradeWrittenAnswer,
} from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface TestModeProps {
  cards: Card[];
  setId: string;
}

type Phase = 'config' | 'test' | 'results';

interface TestQuestion {
  card: Card;
  type: QuestionType;
  promptHtml: string;
  correctAnswers: string[];
  options?: string[];
  multiOptions?: string[];
  multiCorrect?: string[];
  tfPair?: { term: string; definition: string; isCorrect: boolean };
}

function buildTestQuestions(
  cards: Card[],
  config: TestConfig,
): TestQuestion[] {
  const groups = buildEquivalenceGroups(cards);

  let selectedCards = shuffleArray(cards).slice(0, config.questionCount);
  if (config.direction === 'both') {
    // Duplicate and alternate direction
    const half1 = selectedCards.slice(0, Math.ceil(selectedCards.length / 2));
    const half2 = selectedCards.slice(Math.ceil(selectedCards.length / 2));
    selectedCards = [...half1, ...half2];
  }

  const questions: TestQuestion[] = [];
  const enabledTypes = config.questionTypes;

  for (let i = 0; i < selectedCards.length; i++) {
    const card = selectedCards[i];
    const typeIndex = i % enabledTypes.length;
    const type = enabledTypes[typeIndex];

    // Determine direction for this question
    const isReverse =
      config.direction === 'def-to-term' ||
      (config.direction === 'both' && i >= Math.ceil(selectedCards.length / 2));

    const promptHtml = isReverse ? card.definition : card.term;
    const correctAnswers = isReverse
      ? getEquivalentAnswers(card, 'definition', groups).length > 0
        ? [card.term]
        : [card.term]
      : getEquivalentAnswers(card, 'definition', groups);

    if (type === 'multiple-choice') {
      if (config.multiAnswerMC) {
        // Multi-answer MC: pick 2-3 correct answers from equivalents
        const allCorrect = isReverse ? [card.term] : getEquivalentAnswers(card, 'definition', groups);
        const wrongPool = isReverse
          ? cards.filter((c) => c.id !== card.id).map((c) => c.term)
          : getWrongOptionPool(card, cards, groups);
        const wrongs = shuffleArray(wrongPool).slice(0, Math.max(1, 4 - allCorrect.length));
        const multiCorrect = allCorrect.slice(0, Math.min(3, allCorrect.length));
        const multiOptions = shuffleArray([...multiCorrect, ...wrongs]);
        questions.push({
          card,
          type: 'multiple-choice',
          promptHtml,
          correctAnswers: allCorrect,
          multiOptions,
          multiCorrect,
        });
      } else {
        const correctDef = isReverse ? card.term : card.definition;
        const wrongPool = isReverse
          ? cards.filter((c) => c.id !== card.id).map((c) => c.term)
          : getWrongOptionPool(card, cards, groups);
        const wrongs = shuffleArray(wrongPool).slice(0, 3);
        if (wrongs.length < 1) {
          // Fall back to written
          questions.push({ card, type: 'written', promptHtml, correctAnswers });
          continue;
        }
        const options = shuffleArray([correctDef, ...wrongs]);
        questions.push({ card, type: 'multiple-choice', promptHtml, correctAnswers, options });
      }
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
          isCorrect: isCorrect || shownDef === (isReverse ? card.term : card.definition),
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
  onStart: (config: TestConfig) => void;
}) {
  const [questionCount, setQuestionCount] = useState(Math.min(10, cardCount));
  const [customCount, setCustomCount] = useState('');
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [types, setTypes] = useState<QuestionType[]>(['written', 'multiple-choice', 'true-false']);
  const [multiAnswerMC, setMultiAnswerMC] = useState(false);

  const presets = [5, 10, 20];

  const toggleType = (type: QuestionType) => {
    setTypes((prev) =>
      prev.includes(type)
        ? prev.length > 1
          ? prev.filter((t) => t !== type)
          : prev
        : [...prev, type],
    );
  };

  const effectiveCount = customCount
    ? Math.min(Math.max(1, parseInt(customCount, 10) || 1), cardCount)
    : questionCount;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h2
        className="text-2xl font-bold mb-6 text-center"
        style={{ color: 'var(--color-text)' }}
      >
        Test Configuration
      </h2>

      <div
        className="rounded-2xl p-6 space-y-6"
        style={{
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-card)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Question count */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Number of questions
          </label>
          <div className="flex flex-wrap gap-2">
            {presets
              .filter((p) => p <= cardCount)
              .map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setQuestionCount(preset);
                    setCustomCount('');
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                  style={{
                    background:
                      !customCount && questionCount === preset
                        ? 'var(--color-primary)'
                        : 'var(--color-muted)',
                    color:
                      !customCount && questionCount === preset
                        ? '#ffffff'
                        : 'var(--color-text)',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                  }}
                >
                  {preset}
                </button>
              ))}
            <button
              onClick={() => {
                setQuestionCount(cardCount);
                setCustomCount('');
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
              style={{
                background:
                  !customCount && questionCount === cardCount
                    ? 'var(--color-primary)'
                    : 'var(--color-muted)',
                color:
                  !customCount && questionCount === cardCount
                    ? '#ffffff'
                    : 'var(--color-text)',
                borderRadius: 'var(--radius-md)',
                border: 'none',
              }}
            >
              All ({cardCount})
            </button>
            <input
              type="number"
              min={1}
              max={cardCount}
              value={customCount}
              onChange={(e) => setCustomCount(e.target.value)}
              placeholder="Custom"
              className="w-20 px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--color-muted)',
                color: 'var(--color-text)',
                border: customCount ? '2px solid var(--color-primary)' : '2px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
              }}
            />
          </div>
        </div>

        {/* Direction */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Answer with
          </label>
          <div className="flex flex-col gap-2">
            {(
              [
                ['term-to-def', 'Term → Definition'],
                ['def-to-term', 'Definition → Term'],
                ['both', 'Both'],
              ] as [AnswerDirection, string][]
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-2 cursor-pointer text-sm"
                style={{ color: 'var(--color-text)' }}
              >
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
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Question types
          </label>
          <div className="flex flex-col gap-2">
            {(
              [
                ['written', 'Written'],
                ['multiple-choice', 'Multiple Choice'],
                ['true-false', 'True / False'],
              ] as [QuestionType, string][]
            ).map(([value, label]) => (
              <div key={value}>
                <label
                  className="flex items-center gap-2 cursor-pointer text-sm"
                  style={{ color: 'var(--color-text)' }}
                >
                  <input
                    type="checkbox"
                    checked={types.includes(value)}
                    onChange={() => toggleType(value)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  {label}
                </label>
                {/* Nested multi-answer option */}
                {value === 'multiple-choice' && types.includes('multiple-choice') && (
                  <label
                    className="flex items-center gap-2 cursor-pointer text-sm ml-6 mt-1"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    <input
                      type="checkbox"
                      checked={multiAnswerMC}
                      onChange={() => setMultiAnswerMC((v) => !v)}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    Multi-answer
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        <Button
          variant="primary"
          className="w-full"
          onClick={() =>
            onStart({
              questionCount: effectiveCount,
              direction,
              questionTypes: types,
              multiAnswerMC,
            })
          }
        >
          Start Test
        </Button>
      </div>
    </div>
  );
}

// --- Results Screen ---

function ResultsScreen({
  questions,
  answers,
  setId,
  onRestart,
}: {
  questions: TestQuestion[];
  answers: (boolean | null)[];
  setId: string;
  onRestart: () => void;
}) {
  const navigate = useNavigate();
  const filterStore = useFilterStore();

  const correctCount = answers.filter((a) => a === true).length;
  const total = questions.length;
  const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  const missedCards = questions
    .filter((_, i) => answers[i] !== true)
    .map((q) => q.card);

  // SVG circle animation
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const color =
    percentage >= 80
      ? 'var(--color-success)'
      : percentage >= 60
        ? 'var(--color-warning)'
        : 'var(--color-danger)';

  const handleStudyMissed = () => {
    const ids = missedCards.map((c) => c.id);
    filterStore.setFilteredCardIds(ids);
    navigate(`/sets/${setId}/study/flashcards`);
  };

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
          className="text-2xl font-bold mb-6"
          style={{ color: 'var(--color-text)' }}
        >
          Test Results
        </h2>

        {/* Animated circular progress */}
        <div className="flex justify-center mb-6">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke="var(--color-muted)"
              strokeWidth="10"
            />
            <motion.circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1, ease: 'easeOut' }}
              transform="rotate(-90 80 80)"
            />
            <text
              x="80"
              y="75"
              textAnchor="middle"
              dominantBaseline="middle"
              fill={color}
              fontSize="32"
              fontWeight="bold"
              fontFamily="var(--font-sans)"
            >
              {percentage}%
            </text>
            <text
              x="80"
              y="100"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-text-secondary)"
              fontSize="13"
              fontFamily="var(--font-sans)"
            >
              {correctCount}/{total} correct
            </text>
          </svg>
        </div>

        {/* Missed cards */}
        {missedCards.length > 0 && (
          <div className="mb-6">
            <h3
              className="text-lg font-semibold mb-3 text-left"
              style={{ color: 'var(--color-text)' }}
            >
              Missed Cards
            </h3>
            <div className="grid gap-2">
              {missedCards.map((card) => (
                <div
                  key={card.id}
                  className="flex gap-4 p-3 rounded-xl text-left text-sm"
                  style={{
                    background: 'var(--color-danger-light)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div className="flex-1">
                    <div
                      className="font-medium"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {stripHtml(card.term)}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div style={{ color: 'var(--color-text-secondary)' }}>
                      {stripHtml(card.definition)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          {missedCards.length > 0 && (
            <Button variant="primary" onClick={handleStudyMissed}>
              Study Missed Cards
            </Button>
          )}
          <Button variant="outline" onClick={onRestart}>
            Retake Test
          </Button>
          <Button variant="ghost" onClick={() => navigate(`/sets/${setId}`)}>
            Exit
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Main TestMode ---

function TestMode({ cards, setId }: TestModeProps) {
  const navigate = useNavigate();
  const updateSet = useSetStore((s) => s.updateSet);
  const sets = useSetStore((s) => s.sets);

  const [phase, setPhase] = useState<Phase>('config');
  const [config, setConfig] = useState<TestConfig | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<(boolean | null)[]>([]);

  // Per-question state
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  const currentQuestion = questions[currentIndex];

  const handleStart = useCallback(
    (cfg: TestConfig) => {
      const q = buildTestQuestions(cards, cfg);
      setConfig(cfg);
      setQuestions(q);
      setAnswers(new Array(q.length).fill(null));
      setCurrentIndex(0);
      resetQuestionState();
      setPhase('test');
    },
    [cards],
  );

  const resetQuestionState = () => {
    setUserAnswer('');
    setSelectedOption(null);
    setSelectedMulti(new Set());
    setFeedback(null);
  };

  const recordResult = useCallback(
    (isCorrect: boolean) => {
      setAnswers((prev) => {
        const next = [...prev];
        next[currentIndex] = isCorrect;
        return next;
      });

      // Fire-and-forget SR
      const quality = isCorrect ? 4 : 1;
      const studySet = sets.find((s) => s.id === setId);
      if (studySet && currentQuestion) {
        const updatedCard = recordReview(currentQuestion.card, quality, 'test');
        const updatedCards = studySet.cards.map((c) =>
          c.id === updatedCard.id ? updatedCard : c,
        );
        updateSet({ ...studySet, cards: updatedCards, updatedAt: Date.now() });
      }
    },
    [currentIndex, currentQuestion, sets, setId, updateSet],
  );

  const advance = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      setPhase('results');
    } else {
      setCurrentIndex((prev) => prev + 1);
      resetQuestionState();
    }
  }, [currentIndex, questions.length]);

  const checkWritten = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (feedback || !userAnswer.trim()) return;
      const isCorrect = gradeWrittenAnswer(userAnswer, currentQuestion.correctAnswers);
      setFeedback(isCorrect ? 'correct' : 'wrong');
      recordResult(isCorrect);
    },
    [feedback, userAnswer, currentQuestion, recordResult],
  );

  const checkMC = useCallback(
    (option: string) => {
      if (feedback) return;
      setSelectedOption(option);
      const isCorrect = currentQuestion.correctAnswers.some(
        (a) => normalizeAnswer(a) === normalizeAnswer(option),
      );
      setFeedback(isCorrect ? 'correct' : 'wrong');
      recordResult(isCorrect);
    },
    [feedback, currentQuestion, recordResult],
  );

  const toggleMulti = useCallback(
    (option: string) => {
      if (feedback) return;
      setSelectedMulti((prev) => {
        const next = new Set(prev);
        if (next.has(option)) next.delete(option);
        else next.add(option);
        return next;
      });
    },
    [feedback],
  );

  const submitMulti = useCallback(() => {
    if (feedback || !currentQuestion.multiCorrect) return;
    const correctSet = new Set(currentQuestion.multiCorrect.map(normalizeAnswer));
    const userSet = new Set([...selectedMulti].map(normalizeAnswer));
    const isCorrect =
      correctSet.size === userSet.size &&
      [...correctSet].every((c) => userSet.has(c));
    setFeedback(isCorrect ? 'correct' : 'wrong');
    recordResult(isCorrect);
  }, [feedback, currentQuestion, selectedMulti, recordResult]);

  const checkTF = useCallback(
    (answer: boolean) => {
      if (feedback) return;
      const isCorrect = answer === currentQuestion.tfPair?.isCorrect;
      setFeedback(isCorrect ? 'correct' : 'wrong');
      recordResult(isCorrect);
    },
    [feedback, currentQuestion, recordResult],
  );

  if (phase === 'config') {
    return <ConfigScreen cardCount={cards.length} onStart={handleStart} />;
  }

  if (phase === 'results') {
    return (
      <ResultsScreen
        questions={questions}
        answers={answers}
        setId={setId}
        onRestart={() => {
          setPhase('config');
          resetQuestionState();
        }}
      />
    );
  }

  if (!currentQuestion) return null;

  const isMultiAnswer = !!currentQuestion.multiOptions;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/sets/${setId}`)}>
          Exit
        </Button>
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Question {currentIndex + 1} of {questions.length}
        </span>
        <div className="w-16" />
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-1.5 rounded-full mb-8 overflow-hidden"
        style={{ background: 'var(--color-muted)' }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--color-primary)' }}
          animate={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Question */}
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
          }}
        >
          <div
            className="text-xs uppercase tracking-wider mb-2 font-medium"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {currentQuestion.type === 'true-false'
              ? 'True or False?'
              : isMultiAnswer
                ? 'Select all correct answers'
                : 'What is the answer?'}
          </div>

          {/* Prompt */}
          {currentQuestion.type === 'true-false' && currentQuestion.tfPair ? (
            <div className="mb-6">
              <div className="mb-3">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  Term:
                </span>
                <StudyContent html={currentQuestion.tfPair.term} className="text-lg font-semibold mt-1" />
              </div>
              <div>
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  Definition:
                </span>
                <StudyContent html={currentQuestion.tfPair.definition} className="text-lg mt-1" />
              </div>
            </div>
          ) : (
            <StudyContent html={currentQuestion.promptHtml} className="text-xl font-semibold mb-6" />
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
                    feedback === 'correct'
                      ? 'var(--color-success)'
                      : feedback === 'wrong'
                        ? 'var(--color-danger)'
                        : 'var(--color-border)'
                  }`,
                  borderRadius: 'var(--radius-md)',
                }}
              />
              {!feedback && (
                <Button variant="primary" type="submit" className="mt-3 w-full">
                  Submit
                </Button>
              )}
            </form>
          )}

          {/* Single MC */}
          {currentQuestion.type === 'multiple-choice' && !isMultiAnswer && currentQuestion.options && (
            <div className="grid gap-3">
              {currentQuestion.options.map((option, i) => {
                const isSelected = selectedOption === option;
                const isCorrectOption = currentQuestion.correctAnswers.some(
                  (a) => normalizeAnswer(a) === normalizeAnswer(option),
                );

                let borderColor = 'var(--color-border)';
                let bg = 'var(--color-surface-raised)';
                if (feedback) {
                  if (isCorrectOption) {
                    borderColor = 'var(--color-success)';
                    bg = 'var(--color-success-light)';
                  } else if (isSelected) {
                    borderColor = 'var(--color-danger)';
                    bg = 'var(--color-danger-light)';
                  }
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

          {/* Multi MC */}
          {currentQuestion.type === 'multiple-choice' && isMultiAnswer && currentQuestion.multiOptions && (
            <div className="space-y-3">
              <div className="grid gap-3">
                {currentQuestion.multiOptions.map((option, i) => {
                  const isChecked = selectedMulti.has(option);
                  const isCorrectOption = currentQuestion.multiCorrect?.some(
                    (a) => normalizeAnswer(a) === normalizeAnswer(option),
                  );

                  let borderColor = isChecked ? 'var(--color-primary)' : 'var(--color-border)';
                  let bg = isChecked ? 'var(--color-primary-light)' : 'var(--color-surface-raised)';
                  if (feedback) {
                    if (isCorrectOption) {
                      borderColor = 'var(--color-success)';
                      bg = 'var(--color-success-light)';
                    } else if (isChecked) {
                      borderColor = 'var(--color-danger)';
                      bg = 'var(--color-danger-light)';
                    }
                  }

                  return (
                    <motion.button
                      key={i}
                      onClick={() => toggleMulti(option)}
                      disabled={feedback !== null}
                      whileTap={feedback ? undefined : { scale: 0.98 }}
                      className="w-full text-left p-4 rounded-xl cursor-pointer flex items-center gap-3"
                      style={{
                        background: bg,
                        border: `2px solid ${borderColor}`,
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--color-text)',
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center"
                        style={{
                          border: `2px solid ${isChecked ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: isChecked ? 'var(--color-primary)' : 'transparent',
                          borderRadius: 'var(--radius-xs)',
                        }}
                      >
                        {isChecked && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <StudyContent html={option} />
                    </motion.button>
                  );
                })}
              </div>
              {!feedback && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={submitMulti}
                  disabled={selectedMulti.size === 0}
                >
                  Submit
                </Button>
              )}
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
                  <Button
                    key={label}
                    variant="outline"
                    className="flex-1"
                    onClick={() => checkTF(val)}
                    disabled={feedback !== null}
                  >
                    <span
                      style={{
                        color: isCorrectBtn
                          ? 'var(--color-success)'
                          : isWrongBtn
                            ? 'var(--color-danger)'
                            : undefined,
                        fontWeight: isCorrectBtn ? 700 : undefined,
                      }}
                    >
                      {label}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              {feedback === 'correct' ? (
                <div className="p-3 rounded-xl" style={{ background: 'var(--color-success-light)' }}>
                  <p className="font-semibold" style={{ color: 'var(--color-success)' }}>
                    Correct!
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl" style={{ background: 'var(--color-danger-light)' }}>
                  <p className="font-semibold mb-1" style={{ color: 'var(--color-danger)' }}>
                    Incorrect
                  </p>
                  <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Correct answer:{' '}
                    <span className="font-medium" style={{ color: 'var(--color-text)' }}>
                      {stripHtml(currentQuestion.correctAnswers[0])}
                    </span>
                  </p>
                </div>
              )}

              <Button variant="primary" className="w-full mt-4" onClick={advance}>
                {currentIndex + 1 >= questions.length ? 'See Results' : 'Next Question'}
              </Button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default TestMode;

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card, QuestionType } from '@/types';
import { useNavigate } from 'react-router-dom';
import { recordReview } from '@/lib/spaced-repetition';
import { useSetStore } from '@/stores/useSetStore';
import { shuffleArray, stripHtml, normalizeAnswer, fairRepeatCards } from '@/lib/utils';
import {
  buildEquivalenceGroups,
  getEquivalentAnswers,
  getWrongOptionPool,
  gradeWrittenAnswer,
} from '@/lib/equivalence';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';

interface LearnModeProps {
  cards: Card[];
  setId: string;
  exitUrl?: string;
}

interface Question {
  card: Card;
  type: QuestionType;
  prompt: string;
  promptHtml: string;
  correctAnswers: string[];
  options?: string[];
  tfPair?: { term: string; definition: string; isCorrect: boolean };
}

function buildQuestions(cards: Card[], questionCount: number = 20): Question[] {
  const groups = buildEquivalenceGroups(cards);
  const sessionCards = fairRepeatCards(cards, questionCount);
  const questions: Question[] = [];

  // Interleave types (2×MC, 2×written, 1×T/F per 5 questions) so the session
  // mixes recall styles throughout instead of serving them in blocks.
  const TYPE_PATTERN: QuestionType[] = [
    'multiple-choice',
    'written',
    'multiple-choice',
    'written',
    'true-false',
  ];

  for (let i = 0; i < sessionCards.length; i++) {
    const card = sessionCards[i];
    const type: QuestionType = TYPE_PATTERN[i % TYPE_PATTERN.length];

    const correctAnswers = getEquivalentAnswers(card, 'definition', groups);

    if (type === 'multiple-choice') {
      const wrongPool = getWrongOptionPool(card, cards, groups);
      const wrongs = shuffleArray(wrongPool).slice(0, 3);
      if (wrongs.length < 1) {
        // Not enough options, switch to written
        questions.push({
          card,
          type: 'written',
          prompt: stripHtml(card.term),
          promptHtml: card.term,
          correctAnswers,
        });
        continue;
      }
      const options = shuffleArray([card.definition, ...wrongs.slice(0, 3)]);
      questions.push({
        card,
        type: 'multiple-choice',
        prompt: stripHtml(card.term),
        promptHtml: card.term,
        correctAnswers,
        options,
      });
    } else if (type === 'true-false') {
      const isCorrect = Math.random() > 0.5;
      let shownDefinition = card.definition;
      if (!isCorrect) {
        const wrongPool = getWrongOptionPool(card, cards, groups);
        if (wrongPool.length > 0) {
          shownDefinition = shuffleArray(wrongPool)[0];
        } else {
          // Can't make a false pair, make it true
          shownDefinition = card.definition;
        }
      }
      questions.push({
        card,
        type: 'true-false',
        prompt: stripHtml(card.term),
        promptHtml: card.term,
        correctAnswers,
        tfPair: {
          term: card.term,
          definition: shownDefinition,
          isCorrect: isCorrect || correctAnswers.some((a) => normalizeAnswer(a) === normalizeAnswer(shownDefinition)),
        },
      });
    } else {
      questions.push({
        card,
        type: 'written',
        prompt: stripHtml(card.term),
        promptHtml: card.term,
        correctAnswers,
      });
    }
  }

  return questions;
}

function LearnMode({ cards, setId, exitUrl }: LearnModeProps) {
  const navigate = useNavigate();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const updateSet = useSetStore((s) => s.updateSet);
  const sets = useSetStore((s) => s.sets);

  const [phase, setPhase] = useState<'config' | 'learning' | 'complete'>('config');
  const [questionCount, setQuestionCount] = useState(Math.min(20, cards.length));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  // Missed questions get one review round appended to the end of the session.
  const [missedQuestions, setMissedQuestions] = useState<Question[]>([]);
  const [reviewStartIndex, setReviewStartIndex] = useState<number | null>(null);

  const presets = [5, 10, 20, 50].filter((n) => n <= cards.length * 3);

  const currentQuestion = questions[currentIndex];
  // Review-round answers don't change the score — the score reflects first
  // attempts only, so a missed-then-reviewed question isn't double-counted.
  const inReviewRound = reviewStartIndex !== null && currentIndex >= reviewStartIndex;

  const checkAnswer = useCallback(
    (answer: string) => {
      if (feedback) return; // Already answered

      const isCorrect = gradeWrittenAnswer(answer, currentQuestion.correctAnswers);
      setFeedback(isCorrect ? 'correct' : 'wrong');
      if (isCorrect && !inReviewRound) setCorrectCount((c) => c + 1);
    },
    [feedback, currentQuestion, inReviewRound],
  );

  const checkMC = useCallback(
    (option: string) => {
      if (feedback) return;
      setSelectedOption(option);

      const normalizedOption = normalizeAnswer(option);
      const isCorrect = currentQuestion.correctAnswers.some(
        (a) => normalizeAnswer(a) === normalizedOption,
      );
      setFeedback(isCorrect ? 'correct' : 'wrong');
      if (isCorrect && !inReviewRound) setCorrectCount((c) => c + 1);
    },
    [feedback, currentQuestion, inReviewRound],
  );

  const checkTF = useCallback(
    (answer: boolean) => {
      if (feedback) return;

      const isCorrect = answer === currentQuestion.tfPair?.isCorrect;
      setFeedback(isCorrect ? 'correct' : 'wrong');
      if (isCorrect && !inReviewRound) setCorrectCount((c) => c + 1);
    },
    [feedback, currentQuestion, inReviewRound],
  );

  const recordAndAdvance = useCallback(
    (quality: number) => {
      // Fire-and-forget spaced repetition
      const studySet = sets.find((s) => s.id === setId);
      if (studySet) {
        // Base the review on the card's CURRENT store state (not the stale
        // snapshot captured at buildQuestions time) so repeated occurrences of
        // the same card compound SM-2 scheduling and preserve review history.
        const base =
          studySet.cards.find((c) => c.id === currentQuestion.card.id) ??
          currentQuestion.card;
        const updatedCard = recordReview(base, quality, 'learn');
        const updatedCards = studySet.cards.map((c) =>
          c.id === updatedCard.id ? updatedCard : c,
        );
        updateSet({ ...studySet, cards: updatedCards, updatedAt: Date.now() }, { background: true });
      }

      // Missed questions (quality 1 = answered wrong) queue up for one
      // review round, appended after the main session ends.
      const missed = quality <= 1 ? [...missedQuestions, currentQuestion] : missedQuestions;
      if (quality <= 1) setMissedQuestions(missed);

      // Advance
      if (currentIndex + 1 >= questions.length) {
        if (missed.length > 0 && reviewStartIndex === null) {
          setReviewStartIndex(questions.length);
          setQuestions([...questions, ...shuffleArray(missed)]);
          setMissedQuestions([]);
          setCurrentIndex(currentIndex + 1);
          setUserAnswer('');
          setSelectedOption(null);
          setFeedback(null);
        } else {
          setSessionComplete(true);
        }
      } else {
        setCurrentIndex((prev) => prev + 1);
        setUserAnswer('');
        setSelectedOption(null);
        setFeedback(null);
      }
    },
    [currentQuestion, currentIndex, questions, missedQuestions, reviewStartIndex, sets, setId, updateSet],
  );

  const handleWrittenSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!userAnswer.trim()) return;
      checkAnswer(userAnswer);
    },
    [userAnswer, checkAnswer],
  );

  // Config screen
  if (phase === 'config') {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-6 text-center" style={{ color: 'var(--color-text)' }}>
          Learn
        </h2>
        <div
          className="rounded-2xl p-6 space-y-6"
          style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-card)', borderRadius: 'var(--radius-xl)' }}
        >
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Number of Questions
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuestionCount((c) => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg text-lg font-bold cursor-pointer"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none', borderRadius: 'var(--radius-md)' }}
              >
                -
              </button>
              <input
                type="number"
                min={1}
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-20 px-3 py-2 rounded-lg text-sm text-center outline-none"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: '2px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
              />
              <button
                onClick={() => setQuestionCount((c) => c + 1)}
                className="w-8 h-8 rounded-lg text-lg font-bold cursor-pointer"
                style={{ background: 'var(--color-muted)', color: 'var(--color-text)', border: 'none', borderRadius: 'var(--radius-md)' }}
              >
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {presets.map((n) => (
                <button
                  key={n}
                  onClick={() => setQuestionCount(n)}
                  className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer"
                  style={{
                    background: questionCount === n ? 'var(--color-primary)' : 'transparent',
                    color: questionCount === n ? 'white' : 'var(--color-text-secondary)',
                    border: questionCount === n ? 'none' : '1px solid var(--color-border)',
                  }}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setQuestionCount(cards.length)}
                className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer"
                style={{
                  background: questionCount === cards.length ? 'var(--color-primary)' : 'transparent',
                  color: questionCount === cards.length ? 'white' : 'var(--color-text-secondary)',
                  border: questionCount === cards.length ? 'none' : '1px solid var(--color-border)',
                }}
              >
                All ({cards.length})
              </button>
            </div>
            {questionCount > cards.length && (
              <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                Cards will repeat evenly — each card appears at least {Math.ceil(questionCount / cards.length)} times
              </p>
            )}
          </div>

          <Button
            variant="primary"
            className="w-full"
            onClick={() => {
              setQuestions(buildQuestions(cards, questionCount));
              setCurrentIndex(0);
              setUserAnswer('');
              setSelectedOption(null);
              setFeedback(null);
              setCorrectCount(0);
              setSessionComplete(false);
              setMissedQuestions([]);
              setReviewStartIndex(null);
              setPhase('learning');
            }}
          >
            Start Learning
          </Button>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    // Score against the main round only — the appended review round re-asks
    // missed questions and must not inflate the denominator.
    const mainTotal = reviewStartIndex ?? questions.length;
    const accuracy = mainTotal > 0 ? Math.round((correctCount / mainTotal) * 100) : 0;
    const reviewedCount = reviewStartIndex !== null ? questions.length - reviewStartIndex : 0;

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
            className="text-2xl font-bold mb-2"
            style={{ color: 'var(--color-text)' }}
          >
            Session Complete
          </h2>
          <p className="text-lg mb-2" style={{ color: 'var(--color-text-secondary)' }}>
            You got {correctCount} out of {mainTotal} correct ({accuracy}%)
          </p>
          {reviewedCount > 0 && (
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-tertiary)' }}>
              Plus a review round of {reviewedCount} missed {reviewedCount === 1 ? 'question' : 'questions'}
            </p>
          )}
          {reviewedCount === 0 && <div className="mb-4" />}

          <div className="flex flex-wrap gap-3 justify-center">
            <Button
              variant="primary"
              onClick={() => {
                setPhase('config');
              }}
            >
              Continue Learning
            </Button>
            <Button variant="outline" onClick={() => navigate(exitTo)}>
              Exit
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(exitTo)}>
          Exit
        </Button>
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {reviewStartIndex !== null && currentIndex >= reviewStartIndex
            ? `Review ${currentIndex - reviewStartIndex + 1} of ${questions.length - reviewStartIndex}`
            : `Question ${currentIndex + 1} of ${questions.length}`}
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

      {/* Question card */}
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
          {/* Prompt */}
          <div
            className="text-xs uppercase tracking-wider mb-2 font-medium"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {currentQuestion.type === 'true-false' ? 'True or False?' : 'What is the definition?'}
          </div>

          {currentQuestion.type === 'true-false' && currentQuestion.tfPair ? (
            <div className="mb-6">
              <div className="mb-3">
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  Term:
                </span>
                <StudyContent html={currentQuestion.tfPair.term} className="text-xl font-semibold mt-1" />
              </div>
              <div>
                <span
                  className="text-xs font-medium"
                  style={{ color: 'var(--color-text-tertiary)' }}
                >
                  Definition:
                </span>
                <StudyContent html={currentQuestion.tfPair.definition} className="text-xl mt-1" />
              </div>
            </div>
          ) : (
            <StudyContent html={currentQuestion.promptHtml} className="text-2xl font-semibold mb-6" />
          )}

          {/* Answer area */}
          {currentQuestion.type === 'written' && (
            <form onSubmit={handleWrittenSubmit}>
              <input
                type="text"
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Type your answer..."
                disabled={feedback !== null}
                autoFocus
                className="w-full h-12 px-4 rounded-xl text-base outline-none transition-shadow"
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
                  if (isCorrectOption) {
                    borderColor = 'var(--color-success)';
                    bg = 'var(--color-success-light)';
                  } else if (isSelected && !isCorrectOption) {
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
                    className="w-full text-left p-4 rounded-xl cursor-pointer transition-colors break-words"
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

              {/* Confidence / next buttons */}
              <div className="flex flex-wrap gap-3 mt-4">
                {feedback === 'correct' ? (
                  <>
                    <Button variant="outline" size="sm" className="flex-1 min-w-[5rem]" onClick={() => recordAndAdvance(3)}>
                      Hard
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 min-w-[5rem]" onClick={() => recordAndAdvance(4)}>
                      Medium
                    </Button>
                    <Button variant="primary" size="sm" className="flex-1 min-w-[5rem]" onClick={() => recordAndAdvance(5)}>
                      Easy
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" className="flex-1" onClick={() => recordAndAdvance(1)}>
                    Continue
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default LearnMode;

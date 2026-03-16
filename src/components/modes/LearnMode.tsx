import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Card, QuestionType } from '@/types';
import { useNavigate } from 'react-router-dom';
import { recordReview } from '@/lib/spaced-repetition';
import { useSetStore } from '@/stores/useSetStore';
import { shuffleArray, stripHtml, normalizeAnswer } from '@/lib/utils';
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

function buildQuestions(cards: Card[]): Question[] {
  const groups = buildEquivalenceGroups(cards);
  const sessionCards = shuffleArray(cards).slice(0, 20);
  const questions: Question[] = [];

  for (let i = 0; i < sessionCards.length; i++) {
    const card = sessionCards[i];
    let type: QuestionType;
    const roll = i / sessionCards.length;
    if (roll < 0.4) {
      type = 'multiple-choice';
    } else if (roll < 0.8) {
      type = 'written';
    } else {
      type = 'true-false';
    }

    const correctAnswers = getEquivalentAnswers(card, 'definition', groups);

    if (type === 'multiple-choice') {
      const wrongPool = getWrongOptionPool(card, cards, groups);
      const wrongs = shuffleArray(wrongPool).slice(0, 3);
      // If not enough wrong options, fall back to written
      if (wrongs.length < 3 && cards.length > 1) {
        // Pad with available wrongs or fall back
        const allWrongs = shuffleArray(wrongPool);
        while (wrongs.length < 3 && wrongs.length < allWrongs.length) {
          // Already handled by the slice above; just use what we have
          break;
        }
      }
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
          isCorrect: isCorrect || shownDefinition === card.definition,
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

function LearnMode({ cards, setId }: LearnModeProps) {
  const navigate = useNavigate();
  const updateSet = useSetStore((s) => s.updateSet);
  const sets = useSetStore((s) => s.sets);

  const [questions, setQuestions] = useState<Question[]>(() => buildQuestions(cards));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);

  const currentQuestion = questions[currentIndex];

  const checkAnswer = useCallback(
    (answer: string) => {
      if (feedback) return; // Already answered

      const isCorrect = gradeWrittenAnswer(answer, currentQuestion.correctAnswers);
      setFeedback(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) setCorrectCount((c) => c + 1);
    },
    [feedback, currentQuestion],
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
      if (isCorrect) setCorrectCount((c) => c + 1);
    },
    [feedback, currentQuestion],
  );

  const checkTF = useCallback(
    (answer: boolean) => {
      if (feedback) return;

      const isCorrect = answer === currentQuestion.tfPair?.isCorrect;
      setFeedback(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) setCorrectCount((c) => c + 1);
    },
    [feedback, currentQuestion],
  );

  const recordAndAdvance = useCallback(
    (quality: number) => {
      // Fire-and-forget spaced repetition
      const studySet = sets.find((s) => s.id === setId);
      if (studySet) {
        const updatedCard = recordReview(currentQuestion.card, quality, 'learn');
        const updatedCards = studySet.cards.map((c) =>
          c.id === updatedCard.id ? updatedCard : c,
        );
        updateSet({ ...studySet, cards: updatedCards, updatedAt: Date.now() });
      }

      // Advance
      if (currentIndex + 1 >= questions.length) {
        setSessionComplete(true);
      } else {
        setCurrentIndex((prev) => prev + 1);
        setUserAnswer('');
        setSelectedOption(null);
        setFeedback(null);
      }
    },
    [currentQuestion, currentIndex, questions.length, sets, setId, updateSet],
  );

  const handleWrittenSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!userAnswer.trim()) return;
      checkAnswer(userAnswer);
    },
    [userAnswer, checkAnswer],
  );

  if (sessionComplete) {
    const accuracy = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

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
          <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
            You got {correctCount} out of {questions.length} correct ({accuracy}%)
          </p>

          <div className="flex gap-3 justify-center">
            <Button
              variant="primary"
              onClick={() => {
                setQuestions(buildQuestions(cards));
                setCurrentIndex(0);
                setUserAnswer('');
                setSelectedOption(null);
                setFeedback(null);
                setCorrectCount(0);
                setSessionComplete(false);
              }}
            >
              Continue Learning
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
                    className="w-full text-left p-4 rounded-xl cursor-pointer transition-colors"
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
              <div className="flex gap-3 mt-4">
                {feedback === 'correct' ? (
                  <>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => recordAndAdvance(3)}>
                      Hard
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => recordAndAdvance(4)}>
                      Medium
                    </Button>
                    <Button variant="primary" size="sm" className="flex-1" onClick={() => recordAndAdvance(5)}>
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

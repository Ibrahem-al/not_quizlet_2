import { useState, useCallback } from 'react';
import type { StudySet, AnswerDirection, QuestionType } from '@/types';
import type { PDFConfig } from '@/lib/pdfGenerator';
import { Modal } from '@/components/ui/Modal';
import {
  FileText,
  ArrowLeftRight,
  Grid3X3,
  Scissors,
  BookOpen,
  Layers,
  Loader2,
} from 'lucide-react';

interface PrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  set: StudySet;
}

type ActivityId =
  | 'test'
  | 'line-matching'
  | 'flashcards'
  | 'matching-game'
  | 'cut-and-glue'
  | 'lift-the-flap';

interface Activity {
  id: ActivityId;
  name: string;
  description: string;
  minCards: number;
  icon: typeof FileText;
}

const ACTIVITIES: Activity[] = [
  { id: 'test', name: 'Test', description: 'Written, multiple-choice & true/false questions', minCards: 4, icon: FileText },
  { id: 'line-matching', name: 'Line Matching', description: 'Draw lines between terms and definitions', minCards: 3, icon: ArrowLeftRight },
  { id: 'flashcards', name: 'Flashcards', description: 'Printable flash card grid with front & back', minCards: 1, icon: Grid3X3 },
  { id: 'matching-game', name: 'Matching Game', description: 'Cut-out cards to match terms with definitions', minCards: 3, icon: Layers },
  { id: 'cut-and-glue', name: 'Cut & Glue', description: 'Definitions column with cut-out terms to glue', minCards: 3, icon: Scissors },
  { id: 'lift-the-flap', name: 'Lift the Flap', description: 'Fold-over flaps hiding answers beneath questions', minCards: 2, icon: BookOpen },
];

const DIRECTION_OPTIONS: { value: AnswerDirection; label: string }[] = [
  { value: 'term-to-def', label: 'Term → Definition' },
  { value: 'def-to-term', label: 'Definition → Term' },
  { value: 'both', label: 'Both' },
];

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'written', label: 'Written' },
  { value: 'multiple-choice', label: 'Multiple Choice' },
  { value: 'true-false', label: 'True / False' },
];

export function PrintDialog({ isOpen, onClose, set }: PrintDialogProps) {
  const [selected, setSelected] = useState<ActivityId | null>(null);
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [count, setCount] = useState(Math.min(set.cards.length, 20));
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['written', 'multiple-choice']);
  const [multiAnswerMC, setMultiAnswerMC] = useState(false);
  const [generating, setGenerating] = useState(false);

  const activity = ACTIVITIES.find((a) => a.id === selected);
  const cardCount = set.cards.length;

  const toggleQuestionType = useCallback((qt: QuestionType) => {
    setQuestionTypes((prev) =>
      prev.includes(qt) ? (prev.length > 1 ? prev.filter((t) => t !== qt) : prev) : [...prev, qt]
    );
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selected) return;
    setGenerating(true);

    try {
      const gen = await import('@/lib/pdfGenerator');

      const config: PDFConfig = {
        direction,
        count,
        questionTypes,
        multiAnswerMC,
      };

      switch (selected) {
        case 'test':
          await gen.generateTestPDF(set, config);
          break;
        case 'line-matching':
          await gen.generateLineMatchingPDF(set, config);
          break;
        case 'flashcards':
          await gen.generateFlashcardsPDF(set, config);
          break;
        case 'matching-game':
          await gen.generateMatchingGamePDF(set, config);
          break;
        case 'cut-and-glue':
          await gen.generateCutAndGluePDF(set, config);
          break;
        case 'lift-the-flap':
          await gen.generateLiftTheFlapPDF(set, config);
          break;
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(false);
    }
  }, [selected, set, direction, count, questionTypes, multiAnswerMC]);

  const handleBack = useCallback(() => {
    setSelected(null);
  }, []);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Print Activity" size="lg">
      {!selected ? (
        /* Activity grid */
        <div className="grid grid-cols-2 gap-3">
          {ACTIVITIES.map((act) => {
            const disabled = cardCount < act.minCards;
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                onClick={() => !disabled && setSelected(act.id)}
                disabled={disabled}
                className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-colors cursor-pointer"
                style={{
                  background: 'var(--color-muted)',
                  border: '1px solid var(--color-border)',
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <div className="flex items-center gap-2">
                  <Icon size={18} style={{ color: 'var(--color-primary)' }} />
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {act.name}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                  {act.description}
                </p>
                <span
                  className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    background: 'var(--color-primary-light, rgba(99,102,241,0.1))',
                    color: 'var(--color-primary)',
                  }}
                >
                  Min {act.minCards} cards
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        /* Configuration */
        <div className="space-y-5">
          <button
            onClick={handleBack}
            className="text-sm cursor-pointer"
            style={{ color: 'var(--color-primary)', background: 'none', border: 'none' }}
          >
            ← Back to activities
          </button>

          <h3 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
            Configure: {activity?.name}
          </h3>

          {/* Direction */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Direction
            </label>
            <div className="flex gap-2">
              {DIRECTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDirection(opt.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    background: direction === opt.value ? 'var(--color-primary)' : 'var(--color-muted)',
                    color: direction === opt.value ? 'white' : 'var(--color-text)',
                    border: 'none',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Count slider */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
              Number of cards: {count}
            </label>
            <input
              type="range"
              min={activity?.minCards ?? 1}
              max={cardCount}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Test-specific: question types */}
          {selected === 'test' && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Question Types
              </label>
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPES.map((qt) => {
                  const active = questionTypes.includes(qt.value);
                  return (
                    <button
                      key={qt.value}
                      onClick={() => toggleQuestionType(qt.value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                      style={{
                        background: active ? 'var(--color-primary)' : 'var(--color-muted)',
                        color: active ? 'white' : 'var(--color-text)',
                        border: 'none',
                      }}
                    >
                      {qt.label}
                    </button>
                  );
                })}
              </div>

              {questionTypes.includes('multiple-choice') && (
                <label
                  className="flex items-center gap-2 mt-3 text-sm cursor-pointer"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <input
                    type="checkbox"
                    checked={multiAnswerMC}
                    onChange={(e) => setMultiAnswerMC(e.target.checked)}
                  />
                  Allow multiple correct answers
                </label>
              )}
            </div>
          )}

          {/* Generate button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate PDF'
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

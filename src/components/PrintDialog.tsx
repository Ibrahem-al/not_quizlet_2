import { useState, useCallback } from 'react';
import type { StudySet, AnswerDirection, QuestionType } from '@/types';
import type { PDFConfig } from '@/lib/pdfGenerator';
import { Modal } from '@/components/ui/Modal';
import {
  FileText,
  ArrowLeftRight,
  LayoutGrid,
  Scissors,
  BookOpen,
  Puzzle,
  Loader2,
  ChevronLeft,
  Minus,
  Plus,
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
  gradient: string;
}

const ACTIVITIES: Activity[] = [
  { id: 'test', name: 'Printable Test', description: 'Written, multiple choice, and true/false questions.', minCards: 2, icon: FileText, gradient: 'linear-gradient(135deg, #a855f7, #ec4899)' },
  { id: 'line-matching', name: 'Line Matching', description: 'Draw lines to match terms with definitions.', minCards: 2, icon: ArrowLeftRight, gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)' },
  { id: 'flashcards', name: 'Flashcards', description: 'Cut-out flashcards with term and definition.', minCards: 1, icon: LayoutGrid, gradient: 'linear-gradient(135deg, #10b981, #14b8a6)' },
  { id: 'matching-game', name: 'Matching Game', description: 'Cut-out cards for a physical matching game.', minCards: 2, icon: Puzzle, gradient: 'linear-gradient(135deg, #f97316, #f59e0b)' },
  { id: 'cut-and-glue', name: 'Cut & Glue', description: 'Cut out terms and glue them next to definitions.', minCards: 2, icon: Scissors, gradient: 'linear-gradient(135deg, #f43f5e, #ef4444)' },
  { id: 'lift-the-flap', name: 'Lift the Flap', description: 'Cut flaps with questions, lift to reveal answers underneath.', minCards: 2, icon: BookOpen, gradient: 'linear-gradient(135deg, #8b5cf6, #6366f1)' },
];

const DIRECTION_LABELS: { value: AnswerDirection; label: string; helper: string }[] = [
  { value: 'term-to-def', label: 'Definition', helper: 'Given the term, answer with the definition.' },
  { value: 'def-to-term', label: 'Term', helper: 'Given the definition, answer with the term.' },
  { value: 'both', label: 'Both', helper: 'Each item randomly picks which side is the prompt.' },
];

export function PrintDialog({ isOpen, onClose, set }: PrintDialogProps) {
  const [view, setView] = useState<'picker' | 'test-config'>('picker');
  const [direction, setDirection] = useState<AnswerDirection>('term-to-def');
  const [count, setCount] = useState(Math.min(set.cards.length, 20));
  const [generating, setGenerating] = useState<ActivityId | null>(null);

  // Test-specific state
  const [testDirection, setTestDirection] = useState<AnswerDirection>('term-to-def');
  const [questionCount, setQuestionCount] = useState(Math.min(set.cards.length, 20));
  const [writtenEnabled, setWrittenEnabled] = useState(true);
  const [mcEnabled, setMcEnabled] = useState(true);
  const [tfEnabled, setTfEnabled] = useState(true);
  const [multiAnswerMC, setMultiAnswerMC] = useState(false);

  const cardCount = set.cards.length;
  const maxQuestions = Math.max(cardCount * 3, 50);
  const directionHelper = DIRECTION_LABELS.find((d) => d.value === direction)?.helper ?? '';
  const testDirHelper = DIRECTION_LABELS.find((d) => d.value === testDirection)?.helper ?? '';

  const clampCount = (v: number) => Math.max(1, Math.min(cardCount, v));
  const clampQuestionCount = (v: number) => Math.max(1, Math.min(maxQuestions, v));

  const presets = [5, 10, 20].filter((n) => n <= cardCount);

  const testPresets: { label: string; value: number }[] = [
    ...[5, 10, 20].filter((n) => n <= maxQuestions).map((n) => ({ label: String(n), value: n })),
    { label: `All (${cardCount})`, value: cardCount },
  ];
  if (cardCount * 2 <= maxQuestions) {
    testPresets.push({ label: `2\u00d7 (${cardCount * 2})`, value: cardCount * 2 });
  }

  const handleGenerate = useCallback(async (activityId: ActivityId, cfg: PDFConfig) => {
    setGenerating(activityId);
    try {
      const gen = await import('@/lib/pdfGenerator');
      switch (activityId) {
        case 'test': await gen.generateTestPDF(set, cfg); break;
        case 'line-matching': await gen.generateLineMatchingPDF(set, cfg); break;
        case 'flashcards': await gen.generateFlashcardsPDF(set, cfg); break;
        case 'matching-game': await gen.generateMatchingGamePDF(set, cfg); break;
        case 'cut-and-glue': await gen.generateCutAndGluePDF(set, cfg); break;
        case 'lift-the-flap': await gen.generateLiftTheFlapPDF(set, cfg); break;
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setGenerating(null);
    }
  }, [set]);

  const handleActivityClick = useCallback((id: ActivityId) => {
    if (id === 'test') {
      setView('test-config');
      return;
    }
    handleGenerate(id, { direction, count });
  }, [direction, count, handleGenerate]);

  const handleTestGenerate = useCallback(() => {
    const types: QuestionType[] = [];
    if (writtenEnabled) types.push('written');
    if (mcEnabled) types.push('multiple-choice');
    if (tfEnabled) types.push('true-false');
    if (types.length === 0) types.push('written');

    handleGenerate('test', {
      direction: testDirection,
      count: questionCount,
      questionTypes: types,
      multiAnswerMC,
    });
  }, [testDirection, questionCount, writtenEnabled, mcEnabled, tfEnabled, multiAnswerMC, handleGenerate]);

  // Stepper component
  const Stepper = ({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors"
        style={{ background: 'var(--color-muted)', border: 'none', color: 'var(--color-text)', opacity: value <= min ? 0.3 : 1 }}
      >
        <Minus size={14} />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="w-16 text-center text-sm font-medium rounded-lg"
        style={{ background: 'var(--color-muted)', border: '1px solid var(--color-border)', color: 'var(--color-text)', padding: '6px 4px', fontFamily: 'var(--font-sans)' }}
        min={min}
        max={max}
      />
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors"
        style={{ background: 'var(--color-muted)', border: 'none', color: 'var(--color-text)', opacity: value >= max ? 0.3 : 1 }}
      >
        <Plus size={14} />
      </button>
    </div>
  );

  // Preset buttons component
  const PresetButtons = ({ presets: items, current, onSelect }: { presets: { label: string; value: number }[]; current: number; onSelect: (v: number) => void }) => (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((p) => (
        <button
          key={p.label}
          onClick={() => onSelect(p.value)}
          className="px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all"
          style={{
            background: current === p.value ? 'var(--color-primary)' : 'transparent',
            color: current === p.value ? 'white' : 'var(--color-text-secondary)',
            border: current === p.value ? 'none' : '1px solid var(--color-border)',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  // Direction toggle
  const DirectionToggle = ({ value, onChange, helper }: { value: AnswerDirection; onChange: (v: AnswerDirection) => void; helper: string }) => (
    <div>
      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
        Answer Direction
      </label>
      <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        {DIRECTION_LABELS.map((d) => (
          <button
            key={d.value}
            onClick={() => onChange(d.value)}
            className="flex-1 px-3 py-2 text-xs font-medium cursor-pointer transition-all"
            style={{
              background: value === d.value ? 'var(--color-primary)' : 'transparent',
              color: value === d.value ? 'white' : 'var(--color-text)',
              border: 'none',
              borderRight: '1px solid var(--color-border)',
            }}
          >
            {d.label}
          </button>
        ))}
      </div>
      <p className="text-xs mt-1.5" style={{ color: 'var(--color-text-tertiary)' }}>{helper}</p>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      {view === 'picker' ? (
        <div>
          {/* Header */}
          <div className="mb-5">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}>
              Print Activities
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {cardCount} cards in this set
            </p>
          </div>

          {/* Configuration */}
          <div className="space-y-4 mb-5">
            {/* Card count */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Number of Cards
              </label>
              <Stepper value={count} onChange={(v) => setCount(clampCount(v))} min={1} max={cardCount} />
              <PresetButtons
                presets={[...presets.map((n) => ({ label: String(n), value: n })), { label: `All (${cardCount})`, value: cardCount }]}
                current={count}
                onSelect={(v) => setCount(clampCount(v))}
              />
            </div>

            {/* Direction */}
            <DirectionToggle value={direction} onChange={setDirection} helper={directionHelper} />
          </div>

          {/* Min cards banner */}
          {count < 2 && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg mb-4 text-xs font-medium"
              style={{ background: 'var(--color-warning-light, rgba(234,179,8,0.1))', color: 'var(--color-warning, #ca8a04)', border: '1px solid rgba(234,179,8,0.2)' }}
            >
              Select at least 2 cards to generate most activities.
            </div>
          )}

          {/* Activity grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {ACTIVITIES.map((act) => {
              const disabled = count < act.minCards;
              const isLoading = generating === act.id;
              const Icon = act.icon;
              return (
                <button
                  key={act.id}
                  onClick={() => !disabled && !generating && handleActivityClick(act.id)}
                  disabled={disabled || !!generating}
                  className="flex items-start gap-3 p-3.5 rounded-xl text-left transition-all cursor-pointer group"
                  style={{
                    background: 'var(--color-muted)',
                    border: '1px solid var(--color-border)',
                    opacity: disabled ? 0.5 : 1,
                  }}
                >
                  <div
                    className="flex items-center justify-center shrink-0 rounded-lg"
                    style={{ width: 40, height: 40, background: act.gradient }}
                  >
                    {isLoading ? (
                      <Loader2 size={18} className="animate-spin" style={{ color: 'white' }} />
                    ) : (
                      <Icon size={18} style={{ color: 'white' }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {act.name}
                    </span>
                    <span className="block text-xs mt-0.5 leading-snug" style={{ color: 'var(--color-text-tertiary)' }}>
                      {act.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <p className="text-center text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
            PDFs are generated locally — no data is sent to any server.
          </p>
        </div>
      ) : (
        /* Test configuration sub-view */
        <div>
          {/* Header */}
          <div className="mb-5">
            <button
              onClick={() => setView('picker')}
              className="flex items-center gap-1 text-sm font-medium cursor-pointer mb-2"
              style={{ color: 'var(--color-primary)', background: 'none', border: 'none', padding: 0 }}
            >
              <ChevronLeft size={16} />
              Back to activities
            </button>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-sans)' }}>
              Printable Test
            </h2>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
              Configure your test before generating
            </p>
          </div>

          <div className="space-y-5">
            {/* Question types */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Question Types
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={writtenEnabled}
                    onChange={(e) => setWrittenEnabled(e.target.checked)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--color-text)' }}>Written answers</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mcEnabled}
                    onChange={(e) => setMcEnabled(e.target.checked)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--color-text)' }}>Multiple choice</span>
                </label>
                {mcEnabled && (
                  <label className="flex items-center gap-2.5 cursor-pointer ml-6">
                    <input
                      type="checkbox"
                      checked={multiAnswerMC}
                      onChange={(e) => setMultiAnswerMC(e.target.checked)}
                      style={{ accentColor: 'var(--color-primary)' }}
                    />
                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Multi-answer MC</span>
                  </label>
                )}
                {mcEnabled && multiAnswerMC && (
                  <p className="text-xs ml-6" style={{ color: 'var(--color-text-tertiary)' }}>
                    MC questions may have multiple correct answers shown in the answer key.
                  </p>
                )}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tfEnabled}
                    onChange={(e) => setTfEnabled(e.target.checked)}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span className="text-sm" style={{ color: 'var(--color-text)' }}>True / False</span>
                </label>
              </div>
            </div>

            {/* Direction */}
            <DirectionToggle value={testDirection} onChange={setTestDirection} helper={testDirHelper} />

            {/* Question count */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                Number of Questions
              </label>
              <Stepper value={questionCount} onChange={(v) => setQuestionCount(clampQuestionCount(v))} min={1} max={maxQuestions} />
              <PresetButtons
                presets={testPresets}
                current={questionCount}
                onSelect={(v) => setQuestionCount(clampQuestionCount(v))}
              />
              {questionCount > cardCount && (
                <p className="text-xs mt-2" style={{ color: 'var(--color-text-tertiary)' }}>
                  Cards will repeat evenly — each card appears at least {Math.ceil(questionCount / cardCount)} times
                </p>
              )}
            </div>

            {/* Generate button */}
            <button
              onClick={handleTestGenerate}
              disabled={!!generating}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-opacity"
              style={{
                background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                color: 'white',
                border: 'none',
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating === 'test' ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileText size={16} />
                  Generate Test
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, Flag, SpellCheck } from 'lucide-react';
import type { ModeProps } from '@/components/modes/registry';
import type { Card } from '@/types';
import { cn, isImageOnly, shuffleArray, stripHtml } from '@/lib/utils';
import {
  generateCrossword,
  toAnswer,
  wordLengths,
  MAX_WORD,
  MIN_WORD,
  type Crossword,
  type CrosswordEntry,
  type Direction,
  type PlacedWord,
} from '@/lib/crosswordGenerator';
import { submitScore } from '@/lib/gameRecords';
import { playSound } from '@/lib/gameSounds';
import { Button } from '@/components/ui/Button';
import StudyContent from '@/components/StudyContent';
import { Mascot, type MascotMood } from '@/components/games/Mascot';
import { ScorePopups } from '@/components/games/ScorePopup';
import {
  ChoicePills,
  Countdown,
  EscBanner,
  GameTopBar,
  PlayButton,
  ResultsPanel,
  ScoreCounter,
  SetupSection,
} from '@/components/games/GameKit';
import { celebrate, useEscToQuit, usePopups } from '@/components/games/gameLogic';
import './CrosswordMode.css';

// Booklet art — fixed so the paper reads the same in light and dark themes.
const ART = {
  paper: '#fbf3df',
  square: '#fffdf7',
  ink: '#2b2320',
  inkSoft: '#6b5d52',
  highlight: '#ffe58a',
  cursor: '#ffc23d',
  solved: '#dcefcf',
  solvedInk: '#2f6b2a',
  revealInk: '#2b5fa8',
  red: '#c8372d',
  accent: '#d9622b',
  accentEdge: '#a8461a',
  mascot: '#e0833a',
};

type Size = 'mini' | 'standard' | 'big';
const SIZE_WORDS: Record<Size, number> = { mini: 8, standard: 12, big: 15 };
/** Points per letter of a correctly finished word. */
const POINTS_PER_LETTER = 15;
const HINT_COST = 40;
/** Seconds per letter before the time bonus runs out. */
const PAR_SECONDS_PER_LETTER = 7;

type Phase = 'setup' | 'empty' | 'countdown' | 'game' | 'stamp' | 'done';

interface Result {
  final: number;
  timeBonus: number;
  seconds: number;
  gaveUp: boolean;
  best: ReturnType<typeof submitScore>;
}

function buildEntries(cards: Card[]): CrosswordEntry[] {
  return cards.flatMap((card) => {
    const termText = stripHtml(card.term);
    const answer = toAnswer(termText);
    if (answer.length < MIN_WORD || answer.length > MAX_WORD) return [];
    const clueText = stripHtml(card.definition);
    if (!clueText && !isImageOnly(card.definition)) return [];
    // A clue that spells out its own answer gives the game away.
    if (clueText && toAnswer(clueText).includes(answer) && answer.length > 3) return [];
    return [{ id: card.id, answer, lengths: wordLengths(termText), clueText, clueHtml: card.definition }];
  });
}

function lengthLabel(w: CrosswordEntry): string {
  return w.lengths.length > 1 ? `(${w.lengths.join(', ')})` : `(${w.answer.length})`;
}

function wordCorrect(word: PlacedWord, entries: string[], puzzle: Crossword): boolean {
  return word.cells.every((idx) => entries[idx] === puzzle.cells[idx]?.letter);
}

function formatClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- Setup ----------

function SetupScreen({
  candidates,
  onStart,
  onExit,
}: {
  candidates: number;
  onStart: (size: Size) => void;
  onExit: () => void;
}) {
  const [size, setSize] = useState<Size>(candidates >= 12 ? 'standard' : 'mini');
  return (
    <div className="cw-desk min-h-[calc(100dvh-8rem)] px-3 sm:px-4 py-8">
      <div className="max-w-xl mx-auto">
        <GameTopBar onExit={onExit} tone="dark" />
        <div className="@container relative mt-5 rounded-2xl cw-paper p-5 sm:p-7" style={{ boxShadow: '0 18px 40px rgba(40,20,5,0.4)', rotate: '-0.6deg' }}>
          <div className="cw-spiral" aria-hidden />
          {/* Stacks only when large text leaves no room beside the art */}
          <div className="flex flex-col items-start @min-[16rem]:flex-row @min-[16rem]:items-center gap-4">
            <MiniGridArt />
            <div className="min-w-0">
              <h2 className="text-3xl font-extrabold" style={{ color: ART.ink, fontFamily: 'var(--font-display)' }}>
                Crossword
              </h2>
              <p className="text-sm font-semibold" style={{ color: ART.inkSoft }}>
                Your definitions become the clues. Fill in the terms.
              </p>
            </div>
          </div>
          {candidates < 3 ? (
            <div className="mt-6">
              <p className="font-semibold" style={{ color: ART.ink }}>
                This set needs at least 3 cards whose terms are 2 to 15 letters long, with a text or image definition.
              </p>
              <div className="mt-4">
                <Button variant="primary" onClick={onExit}>Back to the set</Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-6">
              <div style={{ color: ART.ink }}>
                <SetupSection label="Puzzle size">
                  <ChoicePills
                    options={[
                      { value: 'mini', label: 'Mini, up to 8 words' },
                      { value: 'standard', label: 'Standard, up to 12' },
                      { value: 'big', label: 'Big, up to 15' },
                    ]}
                    isSelected={(v) => v === size}
                    onToggle={setSize}
                    accent={ART.accent}
                  />
                </SetupSection>
              </div>
              <p className="text-sm" style={{ color: ART.inkSoft }}>
                {candidates} usable {candidates === 1 ? 'card' : 'cards'} in this set. Each finished word scores {POINTS_PER_LETTER} points a letter, and revealing a letter costs {HINT_COST}. Finish fast for a time bonus.
              </p>
              <PlayButton color={ART.accent} onClick={() => onStart(size)}>
                Build my puzzle
              </PlayButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniGridArt() {
  const on = [1, 5, 6, 7, 8, 9, 11, 13, 16, 18, 21];
  return (
    <svg viewBox="0 0 50 50" width={72} height={72} aria-hidden className="shrink-0">
      {Array.from({ length: 25 }, (_, i) => {
        const x = (i % 5) * 10;
        const y = Math.floor(i / 5) * 10;
        return on.includes(i) ? (
          <rect key={i} x={x + 0.75} y={y + 0.75} width={8.5} height={8.5} fill={i === 7 ? ART.cursor : ART.square} stroke={ART.ink} strokeWidth={1.2} />
        ) : null;
      })}
      <path d="M36 44 L47 33 L49 35 L38 46 L35 47 Z" fill={ART.accent} stroke={ART.ink} strokeWidth={0.8} />
    </svg>
  );
}

// ---------- Game ----------

export default function CrosswordMode({ cards, setId, exitUrl }: ModeProps) {
  const navigate = useNavigate();
  const reduce = !!useReducedMotion();
  const exitTo = exitUrl ?? `/sets/${setId}`;
  const exit = useCallback(() => navigate(exitTo), [navigate, exitTo]);
  const entriesPool = useMemo(() => buildEntries(cards), [cards]);

  const [phase, setPhase] = useState<Phase>('setup');
  const [size, setSize] = useState<Size>('standard');
  const [puzzle, setPuzzle] = useState<Crossword | null>(null);
  const [entries, setEntries] = useState<string[]>([]);
  const [wrong, setWrong] = useState<Set<number>>(new Set());
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [awarded, setAwarded] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [dir, setDir] = useState<Direction>('across');
  const [hints, setHints] = useState(0);
  const [checks, setChecks] = useState(0);
  const [score, setScore] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [now, setNow] = useState(0);
  const [mood, setMood] = useState<MascotMood>('idle');
  const [focused, setFocused] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const { popups, push, remove } = usePopups();
  const inputRef = useRef<HTMLInputElement>(null);

  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const playing = phase === 'game';
  const escArmed = useEscToQuit(phase !== 'setup', playing, exit);

  // Clock.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [playing]);

  // Put the caret in the grid once play begins.
  useEffect(() => {
    if (playing) inputRef.current?.focus({ preventScroll: true });
  }, [playing]);

  useEffect(() => {
    if (phase === 'done' && result && !result.gaveUp) return celebrate(['#d9622b', '#ffc23d', '#2b5fa8', '#6cbf73']);
  }, [phase, result]);

  const start = (sz: Size) => {
    clearTimers();
    setSize(sz);
    const built = generateCrossword(shuffleArray(entriesPool), SIZE_WORDS[sz]);
    if (!built || built.words.length < 3) {
      setPuzzle(null);
      setPhase('empty');
      return;
    }
    setPuzzle(built);
    setEntries(built.cells.map(() => ''));
    setWrong(new Set());
    setRevealed(new Set());
    setAwarded(new Set());
    setFlash(new Set());
    const first = built.words[0];
    setCursor(first.cells[0]);
    setDir(first.dir);
    setHints(0);
    setChecks(0);
    setScore(0);
    setMood('idle');
    setResult(null);
    setPhase('countdown');
  };

  const words = useMemo(() => puzzle?.words ?? [], [puzzle]);
  const wordById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const activeWord = useMemo(() => {
    const cell = puzzle?.cells[cursor];
    if (!cell) return null;
    const id = cell[dir] ?? cell[dir === 'across' ? 'down' : 'across'];
    return id ? wordById.get(id) ?? null : null;
  }, [puzzle, cursor, dir, wordById]);
  const activeCells = useMemo(() => new Set(activeWord?.cells ?? []), [activeWord]);
  const correctWords = useMemo(
    () => (puzzle ? new Set(words.filter((w) => wordCorrect(w, entries, puzzle)).map((w) => w.id)) : new Set<string>()),
    [puzzle, words, entries],
  );

  const elapsed = Math.max(0, Math.floor((now - startAt) / 1000));

  // ----- Selection -----

  const focusInput = () => inputRef.current?.focus({ preventScroll: true });

  const selectWord = (w: PlacedWord) => {
    const empty = w.cells.find((i) => !entries[i]);
    setCursor(empty ?? w.cells[0]);
    setDir(w.dir);
    focusInput();
  };

  const selectCell = (idx: number) => {
    const cell = puzzle?.cells[idx];
    if (!cell) return;
    if (idx === cursor && cell.across && cell.down) {
      setDir((d) => (d === 'across' ? 'down' : 'across'));
    } else {
      setCursor(idx);
      if (!cell[dir]) setDir(dir === 'across' ? 'down' : 'across');
    }
    playSound('click');
    focusInput();
  };

  /** Next (or previous) clue, preferring words that aren't finished yet. */
  const stepWord = (from: PlacedWord | null, delta: 1 | -1, currentEntries = entries) => {
    if (!puzzle || words.length === 0) return;
    const at = from ? words.indexOf(from) : -1;
    for (let k = 1; k <= words.length; k++) {
      const w = words[(at + delta * k + words.length * 2) % words.length];
      if (!wordCorrect(w, currentEntries, puzzle) || k === words.length) {
        const empty = w.cells.find((i) => !currentEntries[i]);
        setCursor(empty ?? w.cells[0]);
        setDir(w.dir);
        return;
      }
    }
  };

  const moveArrow = (dr: number, dc: number) => {
    if (!puzzle) return;
    const axis: Direction = dr === 0 ? 'across' : 'down';
    const cell = puzzle.cells[cursor];
    if (dir !== axis && cell?.[axis]) {
      setDir(axis);
      return;
    }
    let r = Math.floor(cursor / puzzle.width);
    let c = cursor % puzzle.width;
    for (;;) {
      r += dr;
      c += dc;
      if (r < 0 || c < 0 || r >= puzzle.height || c >= puzzle.width) return;
      const idx = r * puzzle.width + c;
      const target = puzzle.cells[idx];
      if (target) {
        setCursor(idx);
        if (!target[dir]) setDir(axis);
        return;
      }
    }
  };

  // ----- Scoring -----

  const finish = (finalEntries: string[], gaveUp: boolean, baseScore: number) => {
    if (!puzzle) return;
    const seconds = Math.max(0, Math.floor((Date.now() - startAt) / 1000));
    const letters = words.reduce((n, w) => n + w.answer.length, 0);
    const par = letters * PAR_SECONDS_PER_LETTER;
    const timeBonus = gaveUp ? 0 : Math.max(0, Math.round((par - seconds) * 2));
    const final = Math.max(0, baseScore + timeBonus);
    setEntries(finalEntries);
    setNow(Date.now());
    setResult({ final, timeBonus, seconds, gaveUp, best: submitScore('crossword', setId, final, size) });
    if (gaveUp) {
      setPhase('done');
      playSound('lose');
    } else {
      setMood('celebrate');
      setPhase('stamp');
      playSound('win');
      later(() => setPhase('done'), reduce ? 900 : 1700);
    }
  };

  /** Apply new entries: award newly finished words and check for the end. */
  const commit = (next: string[], hintDelta = 0): { complete: boolean; solvedWord: boolean } => {
    if (!puzzle) return { complete: false, solvedWord: false };
    const newly = words.filter((w) => !awarded.has(w.id) && wordCorrect(w, next, puzzle));
    let gained = 0;
    for (const w of newly) gained += w.answer.length * POINTS_PER_LETTER;
    const newScore = Math.max(0, score + gained - hintDelta * HINT_COST);
    const newHints = hints + hintDelta;
    setEntries(next);
    setScore(newScore);
    if (hintDelta) setHints(newHints);
    if (newly.length > 0) {
      const ids = newly.map((w) => w.id);
      setAwarded((prev) => new Set([...prev, ...ids]));
      setFlash((prev) => new Set([...prev, ...ids]));
      later(() => setFlash((prev) => new Set([...prev].filter((id) => !ids.includes(id)))), 900);
      playSound('match');
      setMood('happy');
      later(() => setMood('idle'), 1200);
      push({ text: `+${gained}`, color: ART.solvedInk, x: 45, y: 30 });
    }
    const complete = puzzle.cells.every((cell, i) => !cell || next[i] === cell.letter);
    if (complete) {
      finish(next, false, newScore);
      return { complete: true, solvedWord: true };
    }
    return { complete: false, solvedWord: newly.length > 0 };
  };

  const advanceAfterEntry = (next: string[], wordDone: boolean) => {
    if (!activeWord || !puzzle) return;
    const filled = activeWord.cells.every((i) => next[i]);
    if (filled && (wordDone || wordCorrect(activeWord, next, puzzle))) {
      stepWord(activeWord, 1, next);
      return;
    }
    const pos = activeWord.cells.indexOf(cursor);
    const after = activeWord.cells.slice(pos + 1).find((i) => !next[i]);
    if (after !== undefined) setCursor(after);
    else if (pos < activeWord.cells.length - 1) setCursor(activeWord.cells[pos + 1]);
    else {
      const firstEmpty = activeWord.cells.find((i) => !next[i]);
      if (firstEmpty !== undefined) setCursor(firstEmpty);
    }
  };

  const typeLetter = (letter: string) => {
    if (!puzzle || !playing) return;
    const cell = puzzle.cells[cursor];
    if (!cell) return;
    const next = entries.slice();
    if (!revealed.has(cursor)) next[cursor] = letter;
    if (wrong.has(cursor)) {
      const w = new Set(wrong);
      w.delete(cursor);
      setWrong(w);
    }
    const { complete, solvedWord } = commit(next);
    if (!complete) advanceAfterEntry(next, solvedWord);
  };

  const backspace = () => {
    if (!puzzle || !activeWord) return;
    const next = entries.slice();
    let cleared = -1;
    if (next[cursor] && !revealed.has(cursor)) {
      cleared = cursor;
    } else {
      const pos = activeWord.cells.indexOf(cursor);
      if (pos > 0) {
        const prev = activeWord.cells[pos - 1];
        if (!revealed.has(prev)) cleared = prev;
        setCursor(prev);
      }
    }
    if (cleared >= 0) {
      next[cleared] = '';
      if (wrong.has(cleared)) setWrong(new Set([...wrong].filter((i) => i !== cleared)));
    }
    setEntries(next);
  };

  const check = () => {
    if (!puzzle || !playing) return;
    const bad = new Set<number>();
    puzzle.cells.forEach((cell, i) => {
      if (cell && entries[i] && entries[i] !== cell.letter) bad.add(i);
    });
    setWrong(bad);
    setChecks((c) => c + 1);
    if (bad.size > 0) {
      playSound('wrong');
      setMood('worried');
      later(() => setMood('idle'), 1200);
      push({ text: `${bad.size} to fix`, color: ART.red, x: 40, y: 20 });
    } else {
      playSound('correct');
      push({ text: 'All good so far', color: ART.solvedInk, x: 30, y: 20 });
    }
  };

  const revealAt = (idx: number) => {
    if (!puzzle) return;
    const letter = puzzle.cells[idx]?.letter;
    if (!letter) return;
    const next = entries.slice();
    next[idx] = letter;
    setRevealed((r) => new Set([...r, idx]));
    if (wrong.has(idx)) setWrong((w) => new Set([...w].filter((i) => i !== idx)));
    playSound('flip');
    push({ text: `-${HINT_COST}`, color: ART.revealInk, x: 60, y: 24 });
    commit(next, 1);
  };

  const revealLetter = () => {
    if (!puzzle || !playing) return;
    const cell = puzzle.cells[cursor];
    if (!cell || entries[cursor] === cell.letter) {
      // Current square is already right: reveal the next wrong/empty one in the word instead.
      const target = activeWord?.cells.find((i) => entries[i] !== puzzle.cells[i]?.letter);
      if (target === undefined) return;
      setCursor(target);
      return revealAt(target);
    }
    revealAt(cursor);
  };

  const giveUp = () => {
    if (!puzzle || !playing) return;
    const solution = puzzle.cells.map((cell) => cell?.letter ?? '');
    finish(solution, true, score);
  };

  // ----- Hidden input: desktop keys arrive on keydown, phone keyboards via input events -----

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!playing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[a-zA-Z]$/.test(k)) {
      e.preventDefault();
      typeLetter(k.toUpperCase());
    } else if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      backspace();
    } else if (k === 'ArrowLeft') {
      e.preventDefault();
      moveArrow(0, -1);
    } else if (k === 'ArrowRight') {
      e.preventDefault();
      moveArrow(0, 1);
    } else if (k === 'ArrowUp') {
      e.preventDefault();
      moveArrow(-1, 0);
    } else if (k === 'ArrowDown') {
      e.preventDefault();
      moveArrow(1, 0);
    } else if (k === 'Tab' || k === 'Enter') {
      e.preventDefault();
      stepWord(activeWord, e.shiftKey ? -1 : 1);
    } else if (k === ' ') {
      e.preventDefault();
      const cell = puzzle?.cells[cursor];
      if (cell?.across && cell?.down) setDir((d) => (d === 'across' ? 'down' : 'across'));
    }
  };

  const onInput = (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const value = el.value;
    if (value.length === 0) {
      backspace();
    } else {
      const letters = toAnswer(value);
      if (letters) typeLetter(letters[letters.length - 1]);
    }
    // Keep one placeholder character so the next Backspace still fires an input event.
    el.value = ' ';
    el.setSelectionRange(1, 1);
  };

  // ----- Render -----

  if (phase === 'setup') {
    return <SetupScreen candidates={entriesPool.length} onStart={start} onExit={exit} />;
  }

  if (phase === 'empty') {
    return (
      <div className="cw-desk min-h-[calc(100dvh-8rem)] px-3 sm:px-4 py-8">
        <div className="max-w-md mx-auto relative rounded-2xl cw-paper p-6 text-center" style={{ boxShadow: '0 18px 40px rgba(40,20,5,0.4)' }}>
          <div className="cw-spiral" aria-hidden />
          <div className="flex justify-center">
            <Mascot mood="sad" color={ART.mascot} size={84} />
          </div>
          <h2 className="mt-2 text-2xl font-extrabold" style={{ color: ART.ink, fontFamily: 'var(--font-display)' }}>
            These words won't cross
          </h2>
          <p className="mt-2 text-sm" style={{ color: ART.inkSoft }}>
            A crossword needs at least 3 terms that share letters. Try again for a different shuffle, or add a few more cards to this set.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            <Button variant="primary" onClick={() => start(size)}>Try again</Button>
            <Button variant="ghost" onClick={exit}>Exit</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!puzzle) return null;

  if (phase === 'done' && result) {
    const solvedByPlayer = awarded.size;
    const stars = result.gaveUp ? 0 : hints === 0 ? 3 : hints <= Math.max(2, Math.ceil(words.length / 4)) ? 2 : 1;
    return (
      <div className="cw-desk relative min-h-[calc(100dvh-8rem)] flex items-center px-4 pt-24 pb-10">
        <ResultsPanel
          mascot={<Mascot mood={result.gaveUp ? 'sad' : 'celebrate'} color={ART.mascot} size={112} />}
          title={result.gaveUp ? 'Answers revealed' : hints === 0 ? 'Solved without a hint' : 'Puzzle solved'}
          subtitle={
            result.gaveUp
              ? `You finished ${solvedByPlayer} of ${words.length} words yourself.`
              : `${words.length} words in ${formatClock(result.seconds)}${checks > 0 ? `, ${checks} ${checks === 1 ? 'check' : 'checks'}` : ''}.`
          }
          stars={stars}
          score={result.final}
          best={result.best}
          stats={[
            { label: 'Words', value: `${solvedByPlayer}/${words.length}` },
            { label: 'Letters revealed', value: hints },
            { label: 'Time', value: formatClock(result.seconds) },
            { label: 'Time bonus', value: `+${result.timeBonus}` },
          ]}
          actions={
            <>
              <Button variant="primary" onClick={() => start(size)}>New puzzle</Button>
              <Button variant="outline" onClick={() => setPhase('setup')}>Change size</Button>
              <Button variant="ghost" onClick={exit}>Exit</Button>
            </>
          }
        />
      </div>
    );
  }

  const across = words.filter((w) => w.dir === 'across');
  const down = words.filter((w) => w.dir === 'down');
  const cellFont = `calc(100cqw / ${puzzle.width} * 0.56)`;
  const numFont = `calc(100cqw / ${puzzle.width} * 0.25)`;
  const cursorRow = Math.floor(cursor / puzzle.width);
  const cursorCol = cursor % puzzle.width;

  return (
    <div className="cw-desk min-h-[calc(100dvh-8rem)] px-2 sm:px-4 py-4">
      <EscBanner show={escArmed} />
      {phase === 'countdown' && (
        <Countdown
          accent={ART.cursor}
          onDone={() => {
            const t = Date.now();
            setStartAt(t);
            setNow(t);
            setPhase('game');
          }}
        />
      )}
      <div className="max-w-5xl mx-auto">
        <GameTopBar onExit={exit} tone="dark">
          <div
            className="flex items-center px-3 h-10 rounded-xl text-sm font-extrabold tabular-nums"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)', fontFamily: 'var(--font-display)' }}
            aria-label={`Time ${formatClock(elapsed)}`}
          >
            {formatClock(elapsed)}
          </div>
          <ScoreCounter value={score} tone="dark" />
        </GameTopBar>

        {/* Booklet */}
        <div
          className="relative mt-4 rounded-2xl cw-paper px-3 pt-6 pb-4 sm:px-6 sm:pb-6"
          style={{ boxShadow: '0 22px 50px rgba(40,20,5,0.45), 0 2px 0 #e6dcc3' }}
        >
          <div className="cw-spiral" aria-hidden />
          <div className="cw-coffee hidden md:block" style={{ right: -30, bottom: -34 }} aria-hidden />

          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <Mascot mood={mood} color={ART.mascot} size={40} />
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold leading-tight" style={{ color: ART.ink, fontFamily: 'var(--font-display)' }}>
                  Crossword
                </h2>
                <p className="text-xs font-semibold tabular-nums" style={{ color: ART.inkSoft }}>
                  {correctWords.size} of {words.length} words
                  {hints > 0 ? `, ${hints} ${hints === 1 ? 'letter' : 'letters'} revealed` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <ToolButton label="Check" onClick={check} disabled={!playing}>
                <SpellCheck size={16} />
              </ToolButton>
              <ToolButton label={`Reveal letter (−${HINT_COST})`} short="Reveal" onClick={revealLetter} disabled={!playing}>
                <Eye size={16} />
              </ToolButton>
              <ToolButton label="Give up" onClick={giveUp} disabled={!playing} quiet>
                <Flag size={16} />
              </ToolButton>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
            {/* Grid + current clue */}
            <div className="w-full lg:w-[min(35rem,58%)] shrink-0">
              <CurrentClue
                word={activeWord}
                onPrev={() => {
                  stepWord(activeWord, -1);
                  focusInput();
                }}
                onNext={() => {
                  stepWord(activeWord, 1);
                  focusInput();
                }}
              />
              <div
                className="relative mx-auto mt-3"
                style={{ width: `min(100%, ${puzzle.width * 2.625}rem)`, containerType: 'inline-size' }}
              >
                <div
                  className="relative rounded-md"
                  style={{
                    aspectRatio: `${puzzle.width} / ${puzzle.height}`,
                    outline: focused ? `3px solid ${ART.accent}` : '3px solid transparent',
                    outlineOffset: 5,
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <input
                    ref={inputRef}
                    className="cw-hidden-input"
                    style={{
                      left: `${(cursorCol / puzzle.width) * 100}%`,
                      top: `${(cursorRow / puzzle.height) * 100}%`,
                      width: `${100 / puzzle.width}%`,
                      height: `${100 / puzzle.height}%`,
                    }}
                    defaultValue=" "
                    onKeyDown={onKeyDown}
                    onInput={onInput}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="next"
                    aria-label={
                      activeWord
                        ? `${activeWord.num} ${activeWord.dir}, ${activeWord.answer.length} letters: ${activeWord.clueText || 'picture clue'}. Type letters, arrows move, Tab for next clue, space switches direction.`
                        : 'Crossword grid'
                    }
                    disabled={!playing}
                  />
                  <div
                    className="absolute inset-0 grid"
                    style={{
                      gridTemplateColumns: `repeat(${puzzle.width}, 1fr)`,
                      gridTemplateRows: `repeat(${puzzle.height}, 1fr)`,
                      gap: 2,
                      zIndex: 1,
                    }}
                    aria-hidden
                  >
                    {puzzle.cells.map((cell, i) => {
                      if (!cell) return <div key={i} />;
                      const inWord = activeCells.has(i);
                      const isCursor = i === cursor;
                      const flashing = (cell.across && flash.has(cell.across)) || (cell.down && flash.has(cell.down));
                      const done = (cell.across && correctWords.has(cell.across)) || (cell.down && correctWords.has(cell.down));
                      const isRevealed = revealed.has(i);
                      const bg = isCursor ? ART.cursor : inWord ? ART.highlight : done ? ART.solved : ART.square;
                      return (
                        <div
                          key={i}
                          className={cn('cw-cell', flashing && !isCursor && 'cw-flash', wrong.has(i) && 'cw-wrong', isRevealed && 'cw-revealed')}
                          style={{
                            background: bg,
                            boxShadow: `0 0 0 1.5px ${ART.ink}`,
                            fontFamily: 'var(--font-display)',
                            fontSize: cellFont,
                            fontWeight: 800,
                            color: isRevealed ? ART.revealInk : wrong.has(i) ? ART.red : done ? ART.solvedInk : ART.ink,
                          }}
                          onClick={() => selectCell(i)}
                        >
                          {cell.num !== undefined && (
                            <span className="cw-num" style={{ fontSize: numFont }}>
                              {cell.num}
                            </span>
                          )}
                          {entries[i]}
                        </div>
                      );
                    })}
                  </div>
                  <ScorePopups popups={popups} onDone={remove} />
                  {phase === 'stamp' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 3 }}>
                      <div
                        className="cw-stamp px-[min(1.25rem,5cqw)] py-2 rounded-lg text-[min(2.25rem,16cqw)] leading-[1.1] sm:text-[min(3rem,16cqw)] sm:leading-none font-extrabold"
                        style={{
                          color: ART.red,
                          border: `5px solid ${ART.red}`,
                          background: 'rgba(251,243,223,0.85)',
                          fontFamily: 'var(--font-display)',
                          letterSpacing: '0.04em',
                        }}
                        role="status"
                      >
                        Solved
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <p className="hidden md:block mt-3 text-xs text-center" style={{ color: ART.inkSoft }}>
                Type to fill. Arrows move, Tab jumps to the next clue, space switches across and down.
              </p>
            </div>

            {/* Clue lists */}
            <div className="@container w-full min-w-0">
              <div className="grid grid-cols-1 sm:max-lg:@min-[26rem]:grid-cols-2 xl:@min-[24rem]:grid-cols-2 gap-4">
                <ClueList title="Across" words={across} active={activeWord} correct={correctWords} onPick={selectWord} />
                <ClueList title="Down" words={down} active={activeWord} correct={correctWords} onPick={selectWord} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  short,
  onClick,
  disabled,
  quiet,
  children,
}: {
  label: string;
  short?: string;
  onClick: () => void;
  disabled?: boolean;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px"
      style={{
        background: quiet ? 'transparent' : '#fffdf7',
        color: ART.ink,
        border: `1.5px solid ${quiet ? 'transparent' : ART.ink}`,
        boxShadow: quiet ? 'none' : `inset 0 -3px 0 #e6dcc3`,
        outlineColor: ART.accent,
        fontFamily: 'var(--font-display)',
      }}
    >
      {children}
      <span className="hidden sm:inline">{short ?? label}</span>
    </button>
  );
}

function CurrentClue({ word, onPrev, onNext }: { word: PlacedWord | null; onPrev: () => void; onNext: () => void }) {
  return (
    <div
      className="flex items-stretch rounded-xl overflow-hidden"
      style={{ background: ART.highlight, border: `1.5px solid ${ART.ink}`, color: ART.ink }}
      aria-live="polite"
    >
      <button
        type="button"
        onClick={onPrev}
        onMouseDown={(e) => e.preventDefault()}
        aria-label="Previous clue"
        className="px-2 cursor-pointer focus-visible:outline-2 -outline-offset-2 hover:bg-black/5"
        style={{ background: 'transparent', border: 'none', color: ART.ink, outlineColor: ART.accent }}
      >
        <ChevronLeft size={20} />
      </button>
      <div className="flex-1 min-w-0 py-2 px-1 min-h-[3.25rem] flex items-center gap-2">
        {word ? (
          <>
            <span className="shrink-0 font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
              {word.num}
              {word.dir === 'across' ? 'A' : 'D'}
            </span>
            <span className="min-w-0 text-sm sm:text-base font-semibold leading-snug">
              {word.clueText ? (
                <span className="line-clamp-6">{word.clueText}</span>
              ) : (
                <StudyContent html={word.clueHtml} className="cw-clue-img" />
              )}{' '}
              <span className="tabular-nums whitespace-nowrap" style={{ color: ART.inkSoft }}>
                {lengthLabel(word)}
              </span>
            </span>
          </>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onNext}
        onMouseDown={(e) => e.preventDefault()}
        aria-label="Next clue"
        className="px-2 cursor-pointer focus-visible:outline-2 -outline-offset-2 hover:bg-black/5"
        style={{ background: 'transparent', border: 'none', color: ART.ink, outlineColor: ART.accent }}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

function ClueList({
  title,
  words,
  active,
  correct,
  onPick,
}: {
  title: string;
  words: PlacedWord[];
  active: PlacedWord | null;
  correct: Set<string>;
  onPick: (w: PlacedWord) => void;
}) {
  if (words.length === 0) return null;
  return (
    <section>
      <h3 className="text-base font-extrabold pb-1 mb-1.5" style={{ color: ART.ink, fontFamily: 'var(--font-display)', borderBottom: `2px solid ${ART.ink}` }}>
        {title}
      </h3>
      <ol className="flex flex-col gap-0.5 m-0 p-0 list-none">
        {words.map((w) => {
          const isActive = active?.id === w.id;
          const done = correct.has(w.id);
          return (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onPick(w)}
                className="w-full flex gap-2 text-left rounded-lg px-2 py-1.5 cursor-pointer focus-visible:outline-2 hover:bg-black/5"
                style={{
                  background: isActive ? ART.highlight : 'transparent',
                  border: 'none',
                  color: done ? ART.inkSoft : ART.ink,
                  outlineColor: ART.accent,
                }}
                aria-current={isActive ? 'true' : undefined}
                aria-label={`${w.num} ${w.dir}${done ? ', solved' : ''}: ${w.clueText || 'picture clue'} ${lengthLabel(w)}`}
              >
                <span className="shrink-0 w-6 text-right font-extrabold tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                  {w.num}
                </span>
                <span className={cn('min-w-0 text-sm leading-snug break-words', done && 'line-through')}>
                  {w.clueText ? w.clueText : <StudyContent html={w.clueHtml} className="cw-clue-img" />}{' '}
                  <span className="tabular-nums whitespace-nowrap" style={{ color: ART.inkSoft }}>
                    {lengthLabel(w)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

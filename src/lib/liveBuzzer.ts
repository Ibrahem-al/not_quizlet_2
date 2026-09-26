import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AnswerDirection, Card, QuestionType } from '@/types';
import { supabase } from '@/lib/supabase';
import { buildEquivalenceGroups } from '@/lib/equivalence';
import { buildGameQuestion, isCorrectOption } from '@/lib/gameQuestions';
import { fairRepeatCards, hasContent, stripHtml } from '@/lib/utils';

// ============================================================
// Buzzer Battle — live classroom game over Supabase Realtime.
//
// Everything is ephemeral: one broadcast + presence channel per room
// (`buzzer:<CODE>`), no tables, no RPCs. The host's browser is the
// authority — it owns questions, timing and scores — and players only
// ever send "hello" and "answer".
//
// Public channels let anyone who knows the code send anything, so:
//  - every message is a signed envelope (ECDSA P-256 via WebCrypto).
//    Players pin the host's public key from its presence entry and drop
//    host-looking messages that don't verify; the host pins each
//    player's key the first time it sees that player id, so one player
//    can't answer for another.
//  - the host validates each answer (known player, current question,
//    open window, option index in range, first answer only) and
//    sanitizes nicknames to plain text.
// WebCrypto is unavailable on plain-http origins (e.g. a phone hitting
// a LAN dev server); then messages go unsigned and verification is
// skipped, which is a documented degradation.
// ============================================================

export const CODE_LENGTH = 6;
/** No I, L, O, 0, 1 — easy to read off a projector. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const NICKNAME_MAX = 20;
export const MAX_PLAYERS = 100;
export const SECONDS_OPTIONS = [10, 20, 30] as const;

export const BASE_POINTS = 500;
export const SPEED_POINTS = 500;
export const STREAK_STEP = 100;
export const STREAK_CAP = 500;
/** Answers that arrive this long after the deadline still count (network). */
const ANSWER_GRACE_MS = 1200;
/** Broadcast payloads above this are downgraded to plain text (Realtime limits). */
const MAX_QUESTION_BYTES = 150_000;
const MAX_PLAYER_MSG = 4_000;
const MAX_HOST_MSG = 400_000;
const HELLO_COOLDOWN_MS = 1500;

/** Player colors: saturated, readable with white text. */
export const PLAYER_COLORS = [
  '#e5484d', '#0b74d6', '#23875a', '#8e4ec6', '#d6409f',
  '#c2410c', '#0e7c86', '#6b5d00', '#3e63dd', '#a0522d',
] as const;

/** A shape per answer slot (24×24 viewBox) so colors are never the only cue;
 *  host tiles and phone buttons share them. */
export const OPTION_SHAPES = [
  'M12 3 L22 20 L2 20 Z',
  'M12 2 L22 12 L12 22 L2 12 Z',
  'M12 2 A10 10 0 1 1 11.99 2 Z',
  'M3 3 H21 V21 H3 Z',
] as const;

// ---------- Codes, ids, names ----------

function randomIndex(max: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % max;
}

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_RE = /^[a-z0-9]{16}$/;
export function randomId(): string {
  let id = '';
  for (let i = 0; i < 16; i++) id += ID_CHARS[randomIndex(ID_CHARS.length)];
  return id;
}

/** Plain-text nickname: no control/format chars (zero-width, bidi overrides),
 *  no stacked combining marks, collapsed whitespace, ≤ 20 characters. */
export function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw
    .slice(0, 200)
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
    .replace(/(\p{M}{2})\p{M}+/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(s).slice(0, NICKNAME_MAX).join('').trim();
}

export function colorForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PLAYER_COLORS[h % PLAYER_COLORS.length];
}

export function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// ---------- Scoring ----------

/** Correct = 500 + up to 500 for speed + 100 per extra answer in a row (max 500). */
export function scoreAnswer(correct: boolean, elapsedMs: number, durationMs: number, streakAfter: number): number {
  if (!correct) return 0;
  const frac = Math.min(1, Math.max(0, 1 - elapsedMs / durationMs));
  const streakBonus = Math.min(STREAK_CAP, Math.max(0, streakAfter - 1) * STREAK_STEP);
  return BASE_POINTS + Math.round(SPEED_POINTS * frac) + streakBonus;
}

/** Competition ranking (1, 1, 3) by score, ties broken by name for display order. */
export function rankPlayers<T extends { id: string; name: string; score: number }>(players: T[]): { player: T; rank: number }[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const out: { player: T; rank: number }[] = [];
  sorted.forEach((p, i) => {
    const rank = i > 0 && sorted[i - 1].score === p.score ? out[i - 1].rank : i + 1;
    out.push({ player: p, rank });
  });
  return out;
}

// ---------- Questions ----------

export interface LiveQuestion {
  kind: 'mc' | 'tf';
  /** Card HTML (players render it through StudyContent, which sanitizes). */
  prompt: string;
  tf?: { term: string; def: string };
  /** Option HTML; for true/false always ['True', 'False']. */
  options: string[];
  /** Correct option indexes (equivalent answers can make several right). */
  correct: number[];
}

export function buildLiveQuestions(
  cards: Card[],
  count: number,
  types: QuestionType[],
  direction: AnswerDirection,
): LiveQuestion[] {
  const usable = cards.filter(hasContent);
  if (usable.length < 2 || types.length === 0) return [];
  const groups = buildEquivalenceGroups(usable);
  const picked = fairRepeatCards(usable, count);
  const out: LiveQuestion[] = [];
  picked.forEach((card, i) => {
    const wanted = types[Math.floor(Math.random() * types.length)];
    let q = buildGameQuestion(card, usable, groups, wanted, direction, i);
    // Not enough distinct answers for choices → fall back to true/false.
    if (q.type === 'written') q = buildGameQuestion(card, usable, groups, 'true-false', direction, i);
    if (q.type === 'multiple-choice' && q.options) {
      const correct = q.options.flatMap((o, idx) => (isCorrectOption(q, o) ? [idx] : []));
      if (correct.length === 0) return;
      out.push({ kind: 'mc', prompt: q.promptHtml, options: q.options, correct });
    } else if (q.type === 'true-false' && q.tfPair) {
      out.push({
        kind: 'tf',
        prompt: q.promptHtml,
        tf: { term: q.tfPair.term, def: q.tfPair.definition },
        options: ['True', 'False'],
        correct: [q.tfPair.isCorrect ? 0 : 1],
      });
    }
  });
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function toText(html: string): string {
  const t = stripHtml(html);
  return escapeHtml(t || '(image)');
}

/** The version of a question sent over the wire: plain text if the HTML (e.g.
 *  inline base64 images) would blow the Realtime payload limit. */
function wireQuestion(q: LiveQuestion): LiveQuestion {
  if (JSON.stringify(q).length <= MAX_QUESTION_BYTES) return q;
  return {
    ...q,
    prompt: toText(q.prompt),
    tf: q.tf ? { term: toText(q.tf.term), def: toText(q.tf.def) } : undefined,
    options: q.kind === 'tf' ? q.options : q.options.map(toText),
  };
}

// ---------- Protocol ----------

export interface PlayerResult {
  /** Answered this question at all. */
  a: boolean;
  /** Correct. */
  ok: boolean;
  pts: number;
  score: number;
  rank: number;
  streak: number;
}

export interface PodiumEntry {
  name: string;
  color: string;
  score: number;
  rank: number;
}

export type HostMsg =
  | { t: 'lobby'; title: string; to?: string }
  | { t: 'starting'; total: number; to?: string }
  | {
      t: 'question';
      q: number;
      total: number;
      kind: 'mc' | 'tf';
      prompt: string;
      tf?: { term: string; def: string };
      options: string[];
      /** Remaining answer window in ms at send time. Players time from receipt. */
      ms: number;
      durationMs: number;
      /** For a resync: the choice this player already made. */
      mine?: number;
      to?: string;
    }
  | { t: 'ack'; id: string; q: number; choice: number }
  | { t: 'reveal'; q: number; total: number; correct: number[]; counts: number[]; players: number; results: Record<string, PlayerResult>; to?: string }
  | { t: 'skip'; q: number }
  | { t: 'final'; podium: PodiumEntry[]; players: number; results: Record<string, { score: number; rank: number }>; to?: string }
  | { t: 'kick'; id: string }
  | { t: 'end' };

export type PlayerMsg =
  | { t: 'hello'; id: string }
  | { t: 'answer'; id: string; q: number; choice: number };

interface Envelope {
  /** 'h' host, 'p' player. */
  f: 'h' | 'p';
  /** Sender id (players). */
  id?: string;
  /** JSON body. */
  b: string;
  /** Base64 ECDSA signature of `b`. */
  s?: string;
}

export type PresenceMeta =
  | { role: 'host'; pk: string | null; title: string }
  | { role: 'player'; id: string; name: string; pk: string | null };

function parsePresenceMeta(raw: unknown): PresenceMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pk = typeof r.pk === 'string' && r.pk.length < 200 ? r.pk : null;
  if (r.role === 'host') {
    return { role: 'host', pk, title: typeof r.title === 'string' ? r.title.slice(0, 200) : '' };
  }
  if (r.role === 'player' && typeof r.id === 'string' && ID_RE.test(r.id)) {
    const name = sanitizeNickname(r.name);
    if (!name) return null;
    return { role: 'player', id: r.id, name, pk };
  }
  return null;
}

// ---------- Signing ----------

function b64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getSubtle(): SubtleCrypto | null {
  try {
    return globalThis.crypto?.subtle ?? null;
  } catch {
    return null;
  }
}

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' } as const;

interface Signer {
  pk: string | null;
  sign: (data: string) => Promise<string | undefined>;
}

/** Keys persist per tab (sessionStorage) so a reload keeps the same identity. */
async function loadOrCreateSigner(storageKey: string): Promise<Signer> {
  const subtle = getSubtle();
  if (!subtle) return { pk: null, sign: async () => undefined };
  try {
    let pair: CryptoKeyPair | null = null;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const { priv, pub } = JSON.parse(saved) as { priv: JsonWebKey; pub: JsonWebKey };
        pair = {
          privateKey: await subtle.importKey('jwk', priv, ALGO, true, ['sign']),
          publicKey: await subtle.importKey('jwk', pub, ALGO, true, ['verify']),
        };
      }
    } catch {
      pair = null;
    }
    if (!pair) {
      pair = (await subtle.generateKey(ALGO, true, ['sign', 'verify'])) as CryptoKeyPair;
      try {
        const priv = await subtle.exportKey('jwk', pair.privateKey);
        const pub = await subtle.exportKey('jwk', pair.publicKey);
        sessionStorage.setItem(storageKey, JSON.stringify({ priv, pub }));
      } catch {
        // storage unavailable — identity just won't survive a reload
      }
    }
    const pk = b64(await subtle.exportKey('raw', pair.publicKey));
    const privateKey = pair.privateKey;
    const enc = new TextEncoder();
    return {
      pk,
      sign: async (data) => b64(await subtle.sign(SIGN_ALGO, privateKey, enc.encode(data))),
    };
  } catch {
    return { pk: null, sign: async () => undefined };
  }
}

const verifierCache = new Map<string, Promise<CryptoKey | null>>();

/** True when the signature checks out, or when verification is impossible
 *  on this device (no WebCrypto). A pinned key with a missing signature fails. */
async function verifyFrom(pk: string | null, data: string, sig: string | undefined): Promise<boolean> {
  if (pk === null) return sig === undefined;
  const subtle = getSubtle();
  if (!subtle) return true;
  if (!sig) return false;
  let keyP = verifierCache.get(pk);
  if (!keyP) {
    keyP = subtle.importKey('raw', unb64(pk), ALGO, false, ['verify']).catch(() => null);
    verifierCache.set(pk, keyP);
  }
  const key = await keyP;
  if (!key) return false;
  try {
    return await subtle.verify(SIGN_ALGO, key, unb64(sig), new TextEncoder().encode(data));
  } catch {
    return false;
  }
}

// ---------- Channel wrapper ----------

export type ConnStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

interface ChannelOptions {
  code: string;
  presenceKey: string;
  meta: PresenceMeta;
  onEnvelope: (env: Envelope) => void;
  onPresence: (state: Map<string, PresenceMeta>) => void;
  onStatus: (status: ConnStatus) => void;
}

/** Removals in flight, by topic: a new channel on the same topic must wait,
 *  because supabase.channel() hands back an existing (leaving) channel. */
const closing = new Map<string, Promise<unknown>>();

/** Thin typed wrapper over a Realtime broadcast + presence channel. */
class LiveChannel {
  private channel: RealtimeChannel | null = null;
  private closed = false;
  private everConnected = false;
  private opts: ChannelOptions;
  private topic: string;

  constructor(opts: ChannelOptions) {
    this.opts = opts;
    this.topic = `buzzer:${opts.code}`;
  }

  /** Subscribe. Resolves once the channel object exists (not when joined). */
  async open(): Promise<void> {
    const client = supabase;
    if (!client) {
      this.opts.onStatus('error');
      return;
    }
    await closing.get(this.topic);
    const fullTopic = `realtime:${this.topic}`;
    const stale = client.getChannels().filter((c) => c.topic === fullTopic);
    if (stale.length > 0) {
      await Promise.all(stale.map((c) => client.removeChannel(c).catch(() => 'error')));
      // A failed leave can leave the channel registered; drop it so we get a fresh one.
      client.realtime.channels = client.realtime.channels.filter((c) => c.topic !== fullTopic);
    }
    if (this.closed) return;

    const opts = this.opts;
    const ch = client.channel(this.topic, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: opts.presenceKey },
        private: false,
      },
    });
    ch.on('broadcast', { event: 'm' }, ({ payload }) => {
      if (this.closed || !payload || typeof payload !== 'object') return;
      const p = payload as Record<string, unknown>;
      if ((p.f !== 'h' && p.f !== 'p') || typeof p.b !== 'string') return;
      opts.onEnvelope({
        f: p.f,
        id: typeof p.id === 'string' ? p.id : undefined,
        b: p.b,
        s: typeof p.s === 'string' ? p.s : undefined,
      });
    });
    ch.on('presence', { event: 'sync' }, () => {
      if (this.closed) return;
      const state = ch.presenceState();
      const out = new Map<string, PresenceMeta>();
      for (const [key, metas] of Object.entries(state)) {
        const meta = parsePresenceMeta(metas[0]);
        if (meta) out.set(key, meta);
      }
      opts.onPresence(out);
    });
    ch.subscribe((status) => {
      if (this.closed) return;
      if (status === 'SUBSCRIBED') {
        this.everConnected = true;
        opts.onStatus('connected');
        void ch.track(opts.meta);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        opts.onStatus(this.everConnected ? 'reconnecting' : 'error');
      } else if (status === 'CLOSED') {
        opts.onStatus('reconnecting');
      }
    });
    this.channel = ch;
  }

  isJoined(): boolean {
    return this.channel?.state === 'joined';
  }

  send(env: Envelope): void {
    if (!this.channel || this.closed || !this.isJoined()) return;
    void this.channel.send({ type: 'broadcast', event: 'm', payload: env });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const ch = this.channel;
    this.channel = null;
    const client = supabase;
    if (ch && client) {
      const done = (async () => {
        await ch.untrack().catch(() => {});
        await client.removeChannel(ch).catch(() => {});
      })();
      closing.set(this.topic, done);
      void done.finally(() => {
        if (closing.get(this.topic) === done) closing.delete(this.topic);
      });
    }
  }
}

function parseBody<T>(b: string, max: number): T | null {
  if (b.length > max) return null;
  try {
    const v = JSON.parse(b) as unknown;
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

// ---------- Small external store ----------

abstract class Store<S> {
  protected snapshot: S;
  private listeners = new Set<() => void>();
  constructor(initial: S) {
    this.snapshot = initial;
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.snapshot;
  protected publish(next: S) {
    this.snapshot = next;
    this.listeners.forEach((l) => l());
  }
}

// ============================================================
// Host engine
// ============================================================

export type HostPhase = 'lobby' | 'countdown' | 'question' | 'reveal' | 'leaderboard' | 'final';

export interface HostPlayer {
  id: string;
  name: string;
  color: string;
  pk: string | null;
  online: boolean;
  score: number;
  streak: number;
  correctCount: number;
  /** Rank before the latest reveal (for the rank-change animation). */
  prevRank: number | null;
  rank: number | null;
  lastPoints: number;
  lastCorrect: boolean | null;
  joinedAt: number;
}

export interface HostSnapshot {
  code: string;
  status: ConnStatus;
  phase: HostPhase;
  players: HostPlayer[];
  total: number;
  qIndex: number;
  question: LiveQuestion | null;
  durationMs: number;
  /** Date.now()-based deadline on the host's own clock. */
  endsAt: number;
  answeredCount: number;
  counts: number[];
  /** Ids of players who answered the current question (for the answer dots). */
  answered: string[];
  full: boolean;
}

interface HostPersisted {
  v: 1;
  code: string;
  phase: HostPhase;
  players: HostPlayer[];
  kicked: string[];
  questions: LiveQuestion[];
  qIndex: number;
  durationMs: number;
  counts: number[];
  results: Record<string, PlayerResult>;
}

export class BuzzerHost extends Store<HostSnapshot> {
  private channel: LiveChannel | null = null;
  private signer: Signer = { pk: null, sign: async () => undefined };
  private status: ConnStatus = 'connecting';
  private phase: HostPhase = 'lobby';
  private players = new Map<string, HostPlayer>();
  private kicked = new Set<string>();
  private questions: LiveQuestion[] = [];
  private qIndex = -1;
  private durationMs = 20_000;
  private openedAt = 0;
  private endsAt = 0;
  private answers = new Map<string, { choice: number; elapsed: number }>();
  private counts: number[] = [];
  private results: Record<string, PlayerResult> = {};
  private lastHello = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private gen = 0;
  private title: string;
  private storageKey: string;
  readonly code: string;

  constructor(setId: string, title: string) {
    const storageKey = `sf_live_host_${setId}`;
    let saved: HostPersisted | null = null;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as HostPersisted;
        if (parsed?.v === 1 && isValidCode(parsed.code)) saved = parsed;
      }
    } catch {
      saved = null;
    }
    const code = saved?.code ?? generateRoomCode();
    super({
      code,
      status: 'connecting',
      phase: 'lobby',
      players: [],
      total: 0,
      qIndex: -1,
      question: null,
      durationMs: 20_000,
      endsAt: 0,
      answeredCount: 0,
      counts: [],
      answered: [],
      full: false,
    });
    this.code = code;
    this.title = title;
    this.storageKey = storageKey;
    if (saved) this.restore(saved);
  }

  private restore(s: HostPersisted) {
    this.phase = s.phase;
    this.kicked = new Set(s.kicked);
    this.questions = s.questions;
    this.qIndex = s.qIndex;
    this.durationMs = s.durationMs;
    this.counts = s.counts;
    this.results = s.results;
    for (const p of s.players) this.players.set(p.id, { ...p, online: false });
    // A reload mid-question closes that question; a countdown goes back to it.
    if (this.phase === 'countdown') this.phase = 'lobby';
  }

  /** Safe to call again after dispose() (React StrictMode remounts). */
  async connect(): Promise<void> {
    const gen = ++this.gen;
    this.disposed = false;
    this.signer = await loadOrCreateSigner(`${this.storageKey}_key`);
    if (gen !== this.gen || this.disposed) return;
    this.channel?.close();
    this.channel = new LiveChannel({
      code: this.code,
      presenceKey: 'host',
      meta: { role: 'host', pk: this.signer.pk, title: this.title },
      onEnvelope: (env) => void this.onEnvelope(env),
      onPresence: (state) => this.onPresence(state),
      onStatus: (status) => {
        this.status = status;
        if (status === 'connected') this.onConnected();
        this.emit();
      },
    });
    const opening = this.channel.open();
    if (this.phase === 'question') this.finishQuestion();
    this.emit();
    await opening;
  }

  private onConnected() {
    // Re-announce the current state to anyone already waiting.
    if (this.phase === 'lobby') void this.broadcast({ t: 'lobby', title: this.title });
  }

  dispose() {
    this.gen += 1;
    this.disposed = true;
    this.clearTimer();
    this.channel?.close();
    this.channel = null;
  }

  // ----- Public actions -----

  start(questions: LiveQuestion[], seconds: number) {
    if (questions.length === 0) return;
    this.questions = questions;
    this.durationMs = seconds * 1000;
    this.qIndex = -1;
    this.results = {};
    for (const p of this.players.values()) {
      Object.assign(p, { score: 0, streak: 0, correctCount: 0, prevRank: null, rank: null, lastPoints: 0, lastCorrect: null });
    }
    this.phase = 'countdown';
    void this.broadcast({ t: 'starting', total: questions.length });
    this.emit();
  }

  /** Called when the host's countdown finishes, and by next(). */
  openQuestion(index: number) {
    const q = this.questions[index];
    if (!q) return;
    this.clearTimer();
    this.qIndex = index;
    this.answers.clear();
    this.counts = q.options.map(() => 0);
    this.openedAt = Date.now();
    this.endsAt = this.openedAt + this.durationMs;
    this.phase = 'question';
    void this.broadcast(this.questionMsg(this.durationMs));
    this.timer = setTimeout(() => this.finishQuestion(), this.durationMs + ANSWER_GRACE_MS);
    this.emit();
  }

  /** Close answers and score the question. */
  finishQuestion() {
    if (this.phase !== 'question') return;
    this.clearTimer();
    const q = this.questions[this.qIndex];
    const before = new Map(rankPlayers([...this.players.values()]).map((r) => [r.player.id, r.rank]));
    for (const p of this.players.values()) {
      const a = this.answers.get(p.id);
      const ok = !!a && !!q && q.correct.includes(a.choice);
      p.prevRank = before.get(p.id) ?? null;
      p.streak = ok ? p.streak + 1 : 0;
      const pts = a ? scoreAnswer(ok, a.elapsed, this.durationMs, p.streak) : 0;
      p.score += pts;
      p.lastPoints = pts;
      p.lastCorrect = a ? ok : null;
      if (ok) p.correctCount += 1;
    }
    const ranked = rankPlayers([...this.players.values()]);
    this.results = {};
    for (const { player, rank } of ranked) {
      player.rank = rank;
      this.results[player.id] = {
        a: this.answers.has(player.id),
        ok: player.lastCorrect === true,
        pts: player.lastPoints,
        score: player.score,
        rank,
        streak: player.streak,
      };
    }
    this.phase = 'reveal';
    void this.broadcast(this.revealMsg());
    this.emit();
  }

  showLeaderboard() {
    if (this.phase !== 'reveal') return;
    this.phase = 'leaderboard';
    this.emit();
  }

  next() {
    if (this.phase !== 'reveal' && this.phase !== 'leaderboard') return;
    if (this.qIndex + 1 >= this.questions.length) this.finish();
    else this.openQuestion(this.qIndex + 1);
  }

  /** Void the current question (no points) and move on. */
  skip() {
    if (this.phase !== 'question') return;
    this.clearTimer();
    void this.broadcast({ t: 'skip', q: this.qIndex });
    if (this.qIndex + 1 >= this.questions.length) this.finish();
    else this.openQuestion(this.qIndex + 1);
  }

  finish() {
    this.clearTimer();
    this.phase = 'final';
    void this.broadcast(this.finalMsg());
    this.emit();
  }

  /** Same players, fresh scores, back to the lobby. */
  playAgain() {
    this.clearTimer();
    this.phase = 'lobby';
    this.questions = [];
    this.qIndex = -1;
    for (const [id, p] of this.players) {
      if (!p.online) this.players.delete(id);
      else Object.assign(p, { score: 0, streak: 0, correctCount: 0, prevRank: null, rank: null, lastPoints: 0, lastCorrect: null });
    }
    void this.broadcast({ t: 'lobby', title: this.title });
    this.emit();
  }

  kick(id: string) {
    if (!this.players.has(id)) return;
    this.players.delete(id);
    this.kicked.add(id);
    this.answers.delete(id);
    void this.broadcast({ t: 'kick', id });
    this.emit();
  }

  /** Tell players the room is gone and forget it. */
  async closeRoom(): Promise<void> {
    this.clearTimer();
    await this.broadcast({ t: 'end' });
    // Give the broadcast a moment to leave before the socket closes.
    await new Promise((r) => setTimeout(r, 250));
    this.dispose();
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch {
      // ignore
    }
  }

  // ----- Messages -----

  private questionMsg(ms: number, to?: string, mine?: number): HostMsg {
    const q = wireQuestion(this.questions[this.qIndex]);
    return {
      t: 'question',
      q: this.qIndex,
      total: this.questions.length,
      kind: q.kind,
      prompt: q.prompt,
      tf: q.tf,
      options: q.options,
      ms,
      durationMs: this.durationMs,
      mine,
      to,
    };
  }

  private revealMsg(to?: string): HostMsg {
    const q = this.questions[this.qIndex];
    const results = to ? (this.results[to] ? { [to]: this.results[to] } : {}) : this.results;
    return {
      t: 'reveal',
      q: this.qIndex,
      total: this.questions.length,
      correct: q?.correct ?? [],
      counts: this.counts,
      players: this.players.size,
      results,
      to,
    };
  }

  private finalMsg(to?: string): HostMsg {
    const ranked = rankPlayers([...this.players.values()]);
    const results: Record<string, { score: number; rank: number }> = {};
    for (const { player, rank } of ranked) {
      if (!to || player.id === to) results[player.id] = { score: player.score, rank };
    }
    return {
      t: 'final',
      podium: ranked.slice(0, 3).map(({ player, rank }) => ({ name: player.name, color: player.color, score: player.score, rank })),
      players: ranked.length,
      results,
      to,
    };
  }

  private async broadcast(msg: HostMsg) {
    if (!this.channel) return;
    const b = JSON.stringify(msg);
    const s = await this.signer.sign(b);
    this.channel?.send({ f: 'h', b, s });
  }

  private async onEnvelope(env: Envelope) {
    if (env.f !== 'p' || !env.id || !ID_RE.test(env.id)) return;
    if (this.kicked.has(env.id)) return;
    const player = this.players.get(env.id);
    if (!player) return;
    const receivedAt = Date.now();
    if (!(await verifyFrom(player.pk, env.b, env.s))) return;
    const msg = parseBody<PlayerMsg>(env.b, MAX_PLAYER_MSG);
    if (!msg || msg.id !== env.id) return;

    if (msg.t === 'hello') {
      const last = this.lastHello.get(msg.id) ?? 0;
      if (receivedAt - last < HELLO_COOLDOWN_MS) return;
      this.lastHello.set(msg.id, receivedAt);
      this.sendSync(msg.id);
      return;
    }

    if (msg.t === 'answer') {
      if (this.phase !== 'question' || msg.q !== this.qIndex) return;
      if (!isInt(msg.choice) || msg.choice < 0 || msg.choice >= this.counts.length) return;
      if (receivedAt > this.endsAt + ANSWER_GRACE_MS) return;
      const existing = this.answers.get(msg.id);
      if (existing) {
        // Retry of a lost ack — confirm the first answer, never replace it.
        void this.broadcast({ t: 'ack', id: msg.id, q: this.qIndex, choice: existing.choice });
        return;
      }
      this.answers.set(msg.id, { choice: msg.choice, elapsed: Math.max(0, receivedAt - this.openedAt) });
      this.counts = this.counts.map((c, i) => (i === msg.choice ? c + 1 : c));
      void this.broadcast({ t: 'ack', id: msg.id, q: this.qIndex, choice: msg.choice });
      this.emit();
      const online = [...this.players.values()].filter((p) => p.online);
      if (online.length > 0 && online.every((p) => this.answers.has(p.id))) {
        this.clearTimer();
        this.timer = setTimeout(() => this.finishQuestion(), 700);
      }
    }
  }

  private sendSync(id: string) {
    switch (this.phase) {
      case 'lobby':
        void this.broadcast({ t: 'lobby', title: this.title, to: id });
        break;
      case 'countdown':
        void this.broadcast({ t: 'starting', total: this.questions.length, to: id });
        break;
      case 'question': {
        const remaining = Math.max(0, this.endsAt - Date.now());
        void this.broadcast(this.questionMsg(remaining, id, this.answers.get(id)?.choice));
        break;
      }
      case 'reveal':
      case 'leaderboard':
        void this.broadcast(this.revealMsg(id));
        break;
      case 'final':
        void this.broadcast(this.finalMsg(id));
        break;
    }
  }

  private onPresence(state: Map<string, PresenceMeta>) {
    const seen = new Set<string>();
    const arrived: string[] = [];
    for (const [key, meta] of state) {
      if (meta.role !== 'player' || meta.id !== key || this.kicked.has(key)) continue;
      const existing = this.players.get(key);
      if (existing) {
        // Pinned key: a different key under the same id is an impostor.
        if (existing.pk !== meta.pk) continue;
        seen.add(key);
        if (!existing.online) arrived.push(key);
        existing.online = true;
        continue;
      }
      if (this.players.size >= MAX_PLAYERS) continue;
      seen.add(key);
      arrived.push(key);
      this.players.set(key, {
        id: key,
        name: this.uniqueName(meta.name),
        color: colorForId(key),
        pk: meta.pk,
        online: true,
        score: 0,
        streak: 0,
        correctCount: 0,
        prevRank: null,
        rank: null,
        lastPoints: 0,
        lastCorrect: null,
        joinedAt: Date.now(),
      });
    }
    for (const [id, p] of this.players) {
      if (seen.has(id)) continue;
      // Lobby: leaving means gone. In a game: keep their score for a reconnect.
      if (this.phase === 'lobby') this.players.delete(id);
      else p.online = false;
    }
    // Greet arrivals with the current state (their own "hello" can race
    // ahead of this presence update and be dropped as unknown).
    const now = Date.now();
    for (const id of arrived) {
      this.lastHello.set(id, now);
      this.sendSync(id);
    }
    this.emit();
  }

  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; n < 1000; n++) {
      const suffix = ` ${n}`;
      const candidate = Array.from(name).slice(0, NICKNAME_MAX - suffix.length).join('') + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit() {
    if (this.disposed) return;
    const players = [...this.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ ...p }));
    this.publish({
      code: this.code,
      status: this.status,
      phase: this.phase,
      players,
      total: this.questions.length,
      qIndex: this.qIndex,
      question: this.questions[this.qIndex] ?? null,
      durationMs: this.durationMs,
      endsAt: this.endsAt,
      answeredCount: this.answers.size,
      counts: this.counts,
      answered: [...this.answers.keys()],
      full: this.players.size >= MAX_PLAYERS,
    });
    const persisted: HostPersisted = {
      v: 1,
      code: this.code,
      phase: this.phase,
      players,
      kicked: [...this.kicked],
      questions: this.questions,
      qIndex: this.qIndex,
      durationMs: this.durationMs,
      counts: this.counts,
      results: this.results,
    };
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(persisted));
    } catch {
      // too big (inline images) or unavailable — a reload just starts fresh
    }
  }
}

// ============================================================
// Player engine
// ============================================================

export type PlayerView =
  | 'connecting'
  | 'lobby'
  | 'starting'
  | 'question'
  | 'reveal'
  | 'final'
  | 'kicked'
  | 'ended';

export interface PlayerQuestion {
  q: number;
  total: number;
  kind: 'mc' | 'tf';
  prompt: string;
  tf?: { term: string; def: string };
  options: string[];
  durationMs: number;
  /** performance.now()-based local deadline (immune to clock skew). */
  deadline: number;
}

export interface PlayerSnapshot {
  status: ConnStatus;
  view: PlayerView;
  hostOnline: boolean;
  /** Time (performance.now) the host was last seen leaving; null when present. */
  hostLostAt: number | null;
  /** True once the host has been seen at least once. */
  hostSeen: boolean;
  title: string;
  question: PlayerQuestion | null;
  choice: number | null;
  acked: boolean;
  reveal: { q: number; total: number; correct: number[]; counts: number[]; players: number; result: PlayerResult | null } | null;
  final: { podium: PodiumEntry[]; players: number; score: number; rank: number | null } | null;
  score: number;
  rank: number | null;
}

export class BuzzerPlayer extends Store<PlayerSnapshot> {
  private channel: LiveChannel | null = null;
  private signer: Signer = { pk: null, sign: async () => undefined };
  private hostPk: string | null | undefined;
  private hostPresent = false;
  private disposed = false;
  private gen = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private helloTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private hostPkKey: string;
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly color: string;

  constructor(code: string, name: string) {
    let id = '';
    try {
      id = sessionStorage.getItem(`sf_live_pid_${code}`) ?? '';
    } catch {
      id = '';
    }
    if (!ID_RE.test(id)) {
      id = randomId();
      try {
        sessionStorage.setItem(`sf_live_pid_${code}`, id);
      } catch {
        // ignore
      }
    }
    super({
      status: 'connecting',
      view: 'connecting',
      hostOnline: false,
      hostLostAt: null,
      hostSeen: false,
      title: '',
      question: null,
      choice: null,
      acked: false,
      reveal: null,
      final: null,
      score: 0,
      rank: null,
    });
    this.id = id;
    this.code = code;
    this.name = name;
    this.color = colorForId(id);
    this.hostPkKey = `sf_live_hostpk_${code}`;
    try {
      const pinned = sessionStorage.getItem(this.hostPkKey);
      if (pinned !== null) this.hostPk = pinned === '' ? null : pinned;
    } catch {
      // ignore
    }
  }

  /** Safe to call again after dispose() (React StrictMode remounts). */
  async connect(): Promise<void> {
    const gen = ++this.gen;
    this.disposed = false;
    this.hostPresent = false;
    this.signer = await loadOrCreateSigner(`sf_live_player_${this.code}_key`);
    if (gen !== this.gen || this.disposed) return;
    this.channel?.close();
    this.channel = new LiveChannel({
      code: this.code,
      presenceKey: this.id,
      meta: { role: 'player', id: this.id, name: this.name, pk: this.signer.pk },
      onEnvelope: (env) => void this.onEnvelope(env),
      onPresence: (state) => this.onPresence(state),
      onStatus: (status) => {
        this.update({ status });
        if (status === 'connected' && this.hostPresent) void this.hello();
      },
    });
    await this.channel.open();
  }

  dispose() {
    this.gen += 1;
    this.disposed = true;
    this.clearRetry();
    this.clearHello();
    this.channel?.close();
    this.channel = null;
  }

  answer(choice: number) {
    const s = this.snapshot;
    if (s.view !== 'question' || !s.question || s.choice !== null) return;
    if (choice < 0 || choice >= s.question.options.length) return;
    if (performance.now() > s.question.deadline) return;
    this.update({ choice, acked: false });
    this.retries = 0;
    void this.sendAnswer();
  }

  private async sendAnswer() {
    const s = this.snapshot;
    if (s.view !== 'question' || !s.question || s.choice === null || s.acked) return;
    await this.send({ t: 'answer', id: this.id, q: s.question.q, choice: s.choice });
    this.clearRetry();
    if (this.retries < 3) {
      this.retries += 1;
      this.retryTimer = setTimeout(() => void this.sendAnswer(), 1500);
    }
  }

  private async hello() {
    await this.send({ t: 'hello', id: this.id });
    // Keep knocking until the host answers (it may not have seen our presence yet).
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.helloTimer = setTimeout(() => {
      this.helloTimer = null;
      if (!this.disposed && this.hostPresent && this.snapshot.view === 'connecting') void this.hello();
    }, 2000);
  }

  private async send(msg: PlayerMsg) {
    if (!this.channel) return;
    const b = JSON.stringify(msg);
    const s = await this.signer.sign(b);
    this.channel?.send({ f: 'p', id: this.id, b, s });
  }

  private onPresence(state: Map<string, PresenceMeta>) {
    const host = state.get('host');
    const present = host?.role === 'host';
    if (present && host.role === 'host') {
      if (this.hostPk === undefined) {
        this.hostPk = host.pk;
        try {
          sessionStorage.setItem(this.hostPkKey, host.pk ?? '');
        } catch {
          // ignore
        }
      }
      if (host.pk !== this.hostPk) return; // someone else claiming to be host
      const wasPresent = this.hostPresent;
      this.hostPresent = true;
      this.update({ hostOnline: true, hostLostAt: null, hostSeen: true, title: host.title || this.snapshot.title });
      if (!wasPresent) void this.hello();
    } else if (this.hostPresent) {
      this.hostPresent = false;
      this.update({ hostOnline: false, hostLostAt: performance.now() });
    }
  }

  private async onEnvelope(env: Envelope) {
    if (env.f !== 'h' || this.hostPk === undefined) return;
    if (!(await verifyFrom(this.hostPk, env.b, env.s))) return;
    const msg = parseBody<HostMsg>(env.b, MAX_HOST_MSG);
    if (!msg || typeof msg.t !== 'string') return;
    if ('to' in msg && msg.to !== undefined && msg.to !== this.id) return;
    this.handle(msg);
  }

  private handle(msg: HostMsg) {
    const s = this.snapshot;
    switch (msg.t) {
      case 'lobby':
        this.clearRetry();
        this.update({ view: 'lobby', title: typeof msg.title === 'string' ? msg.title.slice(0, 200) : s.title, question: null, choice: null, reveal: null, final: null, score: 0, rank: null });
        break;
      case 'starting':
        this.update({ view: 'starting', question: null, choice: null, reveal: null, final: null, score: 0, rank: null });
        break;
      case 'question': {
        if (!isInt(msg.q) || !Array.isArray(msg.options) || msg.options.length < 2 || msg.options.length > 6) return;
        if (!msg.options.every((o) => typeof o === 'string') || typeof msg.prompt !== 'string') return;
        if (msg.kind !== 'mc' && msg.kind !== 'tf') return;
        const ms = Math.min(120_000, Math.max(0, Number(msg.ms) || 0));
        const durationMs = Math.min(120_000, Math.max(1000, Number(msg.durationMs) || 20_000));
        const same = s.question?.q === msg.q && s.view === 'question';
        const mine = isInt(msg.mine) ? msg.mine : null;
        const tf = msg.tf && typeof msg.tf.term === 'string' && typeof msg.tf.def === 'string' ? { term: msg.tf.term, def: msg.tf.def } : undefined;
        this.clearRetry();
        this.update({
          view: 'question',
          question: {
            q: msg.q,
            total: isInt(msg.total) ? msg.total : 0,
            kind: msg.kind,
            prompt: msg.prompt,
            tf,
            options: msg.options,
            durationMs,
            deadline: performance.now() + ms,
          },
          choice: mine ?? (same ? s.choice : null),
          acked: mine !== null,
          reveal: null,
        });
        break;
      }
      case 'ack':
        if (msg.id === this.id && s.question?.q === msg.q && isInt(msg.choice)) {
          this.clearRetry();
          this.update({ acked: true, choice: msg.choice });
        }
        break;
      case 'reveal': {
        if (!isInt(msg.q) || !Array.isArray(msg.correct) || !Array.isArray(msg.counts)) return;
        const raw = msg.results && typeof msg.results === 'object' ? msg.results[this.id] : undefined;
        const result: PlayerResult | null = raw && typeof raw === 'object'
          ? {
              a: !!raw.a,
              ok: !!raw.ok,
              pts: Number(raw.pts) || 0,
              score: Number(raw.score) || 0,
              rank: Number(raw.rank) || 0,
              streak: Number(raw.streak) || 0,
            }
          : null;
        this.clearRetry();
        this.update({
          view: 'reveal',
          reveal: {
            q: msg.q,
            total: isInt(msg.total) ? msg.total : 0,
            correct: msg.correct.filter(isInt),
            counts: msg.counts.map((c) => Number(c) || 0),
            players: Number(msg.players) || 0,
            result,
          },
          score: result?.score ?? s.score,
          rank: result?.rank ?? s.rank,
        });
        break;
      }
      case 'skip':
        if (s.question?.q === msg.q) {
          this.clearRetry();
          this.update({ view: 'starting', question: null, choice: null });
        }
        break;
      case 'final': {
        if (!Array.isArray(msg.podium)) return;
        const mine = msg.results && typeof msg.results === 'object' ? msg.results[this.id] : undefined;
        const podium = msg.podium.slice(0, 3).map((p) => ({
          name: sanitizeNickname(p?.name),
          color: typeof p?.color === 'string' && /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : '#666666',
          score: Number(p?.score) || 0,
          rank: Number(p?.rank) || 0,
        }));
        this.clearRetry();
        this.update({
          view: 'final',
          question: null,
          final: {
            podium,
            players: Number(msg.players) || 0,
            score: Number(mine?.score) || s.score,
            rank: mine ? Number(mine.rank) || null : s.rank,
          },
        });
        break;
      }
      case 'kick':
        if (msg.id === this.id) {
          this.update({ view: 'kicked' });
          this.dispose();
        }
        break;
      case 'end':
        this.update({ view: 'ended' });
        this.dispose();
        break;
    }
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private clearHello() {
    if (this.helloTimer) clearTimeout(this.helloTimer);
    this.helloTimer = null;
  }

  private update(patch: Partial<PlayerSnapshot>) {
    if (this.disposed && patch.view !== 'kicked' && patch.view !== 'ended') return;
    this.publish({ ...this.snapshot, ...patch });
  }
}

/** Whether live games can run at all in this build. */
export function isLiveAvailable(): boolean {
  return supabase !== null;
}

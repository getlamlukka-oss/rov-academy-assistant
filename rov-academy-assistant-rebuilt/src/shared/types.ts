/**
 * shared/types.ts — wire contract shared by the API, the client and the Bridge.
 *
 * The normalized question object below is exactly the shape required by the
 * specification:
 *
 *   { questionId, question, choices:[{id,text}], pageUrl, timestamp }
 */

export type LoginStatus = 'logged_out' | 'logging_in' | 'logged_in' | 'unknown';

export type AssistantState =
  | 'idle'
  | 'connecting'
  | 'waiting_login'
  | 'logged_in'
  | 'reading'
  | 'searching_bank'
  | 'asking_gemini'
  | 'answered'
  | 'needs_review'
  | 'waiting_user'
  | 'quiz_done'
  | 'stopped'
  | 'error';

export interface ChoiceDto {
  /** Positional letter used across the whole system: "A", "B", "C", … */
  id: string;
  text: string;
}

export interface NormalizedQuestion {
  questionId: string;
  question: string;
  choices: ChoiceDto[];
  pageUrl: string;
  timestamp: string;
}

export type AnswerSource = 'answer_bank' | 'gemini' | 'none' | 'cache';

export type MatchTier =
  | 'exact'
  | 'normalized'
  | 'alias'
  | 'fuzzy'
  | 'gemini'
  | 'none';

export interface AnalyzeRequest {
  clientId: string;
  question: string;
  choices: ChoiceDto[];
  questionId?: string;
  pageUrl?: string;
  quizId?: string;
  chapterId?: string;
  runId?: string;
  /** Skip the per-client answer cache ("ถามใหม่" button). */
  bypassCache?: boolean;
}

export interface AnalyzeOkResponse {
  status: 'ok';
  answer: string;
  answerText: string;
  source: AnswerSource;
  confidence: number;
  reason: string;
  tier: MatchTier;
  bankEntryId?: string;
  questionFingerprint: string;
  tookMs: number;
  aiUsed: boolean;
  fromCache?: boolean;
}

export interface AnalyzeNeedsReviewResponse {
  status: 'needs_review';
  answer: null;
  answerText: null;
  source: AnswerSource;
  confidence: number;
  reason: string;
  tier: MatchTier;
  candidates: Array<{ answer: string; answerText: string; confidence: number; why: string }>;
  questionFingerprint: string;
  tookMs: number;
  aiUsed: boolean;
  fromCache?: boolean;
  aiError?: { code: string; message: string };
  bankHint?: { entryId: string; answerText: string; why: string };
}

export interface AnalyzeAmbiguousResponse {
  status: 'ambiguous';
  reason: string;
  candidates: Array<{ answer: string; answerText: string; confidence: number; why: string }>;
  questionFingerprint: string;
  tookMs: number;
}

export interface AnalyzeNotFoundResponse {
  status: 'not_found';
  reason: string;
  questionFingerprint: string;
  tookMs: number;
  aiConfigured: boolean;
}

export type AnalyzeResponse =
  | AnalyzeOkResponse
  | AnalyzeNeedsReviewResponse
  | AnalyzeAmbiguousResponse
  | AnalyzeNotFoundResponse;

export interface BankEntryInput {
  question: string;
  choices?: string[];
  answer?: string;
  answerText?: string;
  aliases?: string[];
  verified?: boolean;
  id?: string;
  chapterId?: string;
  note?: string;
}

export interface BankEntry extends Required<Pick<BankEntryInput, 'question' | 'verified'>> {
  id: string;
  choices: string[];
  answer: string;
  answerText: string;
  aliases: string[];
  chapterId: string;
  note: string;
  /** normalizeKey(question) */
  normKey: string;
  /** sha256 of question + choices */
  fingerprint: string;
  /** alias normKeys */
  aliasKeys: string[];
  /** normalized choice texts, positional */
  normChoices: string[];
  source: string;
}

export type HistoryResult = 'correct' | 'incorrect' | 'unknown' | null;

export interface HistoryItem {
  id: number;
  clientId: string;
  runId: string | null;
  questionId: string;
  question: string;
  choices: ChoiceDto[];
  answer: string | null;
  answerText: string | null;
  source: AnswerSource;
  confidence: number;
  reason: string | null;
  status: string;
  result: HistoryResult;
  pageUrl: string | null;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryCreateRequest {
  clientId: string;
  question: string;
  choices: ChoiceDto[];
  answer?: string | null;
  answerText?: string | null;
  source?: AnswerSource;
  confidence?: number;
  reason?: string | null;
  status?: string;
  result?: HistoryResult;
  questionId?: string;
  pageUrl?: string | null;
  runId?: string | null;
  fingerprint?: string;
}

export interface RunSummary {
  id: string;
  clientId: string;
  chapterId: string | null;
  quizId: string | null;
  totalQuestions: number | null;
  status: 'running' | 'finished';
  result: 'passed' | 'failed' | null;
  incorrectCount: number | null;
  answered: number;
  bankHits: number;
  geminiHits: number;
  needsReview: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface ApiError {
  status: 'error';
  error: string;
  code: string;
  details?: unknown;
}

/* ----------------------------- Bridge protocol ---------------------------- */

export const BRIDGE_PROTOCOL = 'rov-academy-bridge/v1';

/**
 * Marker used when the Bridge is reached through an extension/userscript relay
 * instead of a popup+opener relationship (the normal case on Android).
 * Must stay identical to RELAY_TAG inside public/bridge/academy-bridge.js —
 * tests/bridge-protocol-parity.test.mjs enforces that.
 */
export const BRIDGE_RELAY_TAG = 'rov-academy-relay/v1';

export type BridgeInboundType =
  | 'rov-bridge:init'
  | 'rov-bridge:answer'
  | 'rov-bridge:command'
  | 'rov-bridge:ping';

export type BridgeOutboundType =
  | 'rov-bridge:hello'
  | 'rov-bridge:pong'
  | 'rov-bridge:state'
  | 'rov-bridge:question'
  | 'rov-bridge:result'
  | 'rov-bridge:error'
  | 'rov-bridge:debug';

export interface BridgeConfig {
  /** Highlight the AI-recommended choice in the page. Default true. */
  highlight: boolean;
  /** Click the recommended choice automatically. Default false. */
  autoAnswer: boolean;
  /** Click Next/Submit automatically. Default false — the user submits. */
  autoSubmit: boolean;
  /** Show the in-page debug overlay. Default false. */
  debug: boolean;
  /** DOM polling interval in ms. Default 900. */
  pollMs: number;
  /** Milliseconds to wait before auto-clicking next. Default 1200. */
  autoDelayMs: number;
}

export interface BridgeSignal {
  name: string;
  value: string;
  tier: number;
}

export interface BridgeLoginInfo {
  status: LoginStatus;
  signals: BridgeSignal[];
}

export interface BridgeQuizInfo {
  detected: boolean;
  pathname: string;
  chapterId: string;
  index: number;
  total: number;
  isLast: boolean;
  answered: boolean;
  locked: boolean;
}

export interface BridgeDebugInfo {
  question: { found: boolean; selector: string; tier: number; preview: string };
  choices: { found: number; selector: string; tier: number; previews: string[] };
  nextButton: { found: boolean; selector: string; tier: number; label: string; locked: boolean };
  submitButton: { found: boolean; selector: string; tier: number; label: string };
  backButton: { found: boolean; selector: string; tier: number };
  steps: { found: number; activeIndex: number };
  resultState: { kind: string; text: string };
  excluded: string[];
}

export interface BridgeResultState {
  kind: 'none' | 'passed' | 'failed' | 'already_completed' | 'maintenance' | 'unknown';
  text: string;
  incorrectCount: number | null;
}

export interface BridgeStatePayload {
  url: string;
  pathname: string;
  title: string;
  login: BridgeLoginInfo;
  quiz: BridgeQuizInfo;
  captchaDetected: boolean;
  maintenance: boolean;
  ready: boolean;
  halted?: boolean;
  haltReason?: string;
  result?: BridgeResultState;
  debug?: BridgeDebugInfo;
  ts: string;
}

export interface BridgeQuestionPayload extends NormalizedQuestion {
  fingerprint: string;
  index: number;
  total: number;
  isLast: boolean;
  alreadyAnswered: boolean;
  selectedLetter: string | null;
  chapterId: string;
  quizId: string;
}

export interface BridgeResultPayload {
  kind: 'passed' | 'failed' | 'already_completed' | 'maintenance' | 'unknown';
  text: string;
  incorrectCount: number | null;
  chapterId: string;
  ts: string;
}

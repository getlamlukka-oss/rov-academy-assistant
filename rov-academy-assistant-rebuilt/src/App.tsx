/**
 * client/App.tsx — RoV Academy AI Assistant dashboard (mobile first, Thai UI).
 *
 * Flow: เปิดเว็บ → เชื่อมต่อ Bridge → ผู้ใช้ login Garena เอง → ตรวจ login →
 * เริ่มตอบ → Bridge อ่านคำถาม/ตัวเลือก → Answer Bank ก่อน → Gemini เมื่อไม่พบ →
 * ส่งคำตอบกลับ Bridge (ไฮไลต์) → บันทึก History → สรุปผลเมื่อจบบท
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, type HealthResponse } from './api.js';
import { BridgeLink, type BridgeEvent } from './bridgeLink.js';
import { getClientId, loadSettings, saveSettings } from './clientId.js';
import {
  computeStats,
  DEFAULT_SETTINGS,
  describeAnalyze,
  EMPTY_STATS,
  LOGIN_LABEL,
  PHASE_LABEL,
  PHASE_TONE,
  type BridgeSettings,
  type LogLine,
  type Stats,
} from './state.js';
import type {
  AnalyzeResponse,
  AssistantState,
  BridgeDebugInfo,
  BridgeQuestionPayload,
  BridgeResultPayload,
  BridgeSignal,
  HistoryItem,
  LoginStatus,
  RunSummary,
} from './shared/types.js';
import { Button, ConfidenceBar, Section, StatusPill } from './components/Bits.js';
import { QuestionCard } from './components/QuestionCard.js';
import {
  ActivityLog,
  DebugPanel,
  HistoryPanel,
  InstallPanel,
  ResultCard,
  RunsPanel,
  SettingsPanel,
  StatsGrid,
} from './components/Panels.js';

const DEFAULT_ACADEMY_ORIGIN = 'https://academy.rov.in.th';
const MAX_LOG = 120;

export function App(): JSX.Element {
  const clientId = useMemo(() => getClientId(), []);
  const [academyOrigin, setAcademyOrigin] = useState<string>(DEFAULT_ACADEMY_ORIGIN);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string>('');

  const [phase, setPhase] = useState<AssistantState>('idle');
  const [running, setRunning] = useState(false);
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [bridgeMode, setBridgeMode] = useState<'popup' | 'relay' | 'none'>('none');
  const [bridgeVersion, setBridgeVersion] = useState('');
  const [loginStatus, setLoginStatus] = useState<LoginStatus>('unknown');
  const [loginSignals, setLoginSignals] = useState<BridgeSignal[]>([]);
  const [pageUrl, setPageUrl] = useState('');
  const [quizDetected, setQuizDetected] = useState(false);
  const [captchaDetected, setCaptchaDetected] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [bridgeHalted, setBridgeHalted] = useState(false);

  const [question, setQuestion] = useState<BridgeQuestionPayload | null>(null);
  const [answer, setAnswer] = useState<AnalyzeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [chosenLetter, setChosenLetter] = useState<string | null>(null);
  const [debug, setDebug] = useState<BridgeDebugInfo | null>(null);

  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  const [settings, setSettings] = useState<BridgeSettings>(() => loadSettings<BridgeSettings>(DEFAULT_SETTINGS));
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const linkRef = useRef<BridgeLink | null>(null);
  const requestSeqRef = useRef(0);
  const inFlightRef = useRef(new Set<string>());
  const runRef = useRef<RunSummary | null>(null);
  const runsRef = useRef<RunSummary[]>([]);
  const liveRef = useRef({
    running,
    runId,
    settings,
    answered: new Map<string, AnalyzeResponse>(),
    recorded: new Set<string>(),
    question,
  });
  liveRef.current.running = running;
  liveRef.current.runId = runId;
  liveRef.current.settings = settings;
  liveRef.current.question = question;
  runRef.current = run;
  runsRef.current = runs;

  const log = useCallback((text: string, tone: LogLine['tone'] = 'info') => {
    setLogs((prev) => [{ at: new Date().toISOString(), tone, text }, ...prev].slice(0, MAX_LOG));
  }, []);

  /* ------------------------------ data loading ------------------------- */

  const refreshHealth = useCallback(async () => {
    try {
      const h = await api.health();
      setHealth(h);
      setHealthError('');
    } catch (err) {
      setHealthError(err instanceof ApiError ? err.message : 'health check failed');
    }
  }, []);

  const refreshHistory = useCallback(
    async (activeRunId: string | null) => {
      setHistoryLoading(true);
      try {
        const res = await api.historyList(clientId, { limit: 50, ...(activeRunId ? { runId: activeRunId } : {}) });
        setHistory(res.items);
        setHistoryTotal(res.total);
        const currentRun = activeRunId ? runs.find((r) => r.id === activeRunId) ?? run : null;
        setStats(computeStats(res.items, currentRun));
      } catch (err) {
        log(`โหลดประวัติไม่สำเร็จ: ${err instanceof ApiError ? err.message : String(err)}`, 'bad');
      } finally {
        setHistoryLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId, runs, run, log],
  );

  const refreshRuns = useCallback(async () => {
    try {
      const res = await api.listRuns(clientId, 20);
      setRuns(res.runs);
    } catch (err) {
      log(`โหลด run ไม่สำเร็จ: ${err instanceof ApiError ? err.message : String(err)}`, 'warn');
    }
  }, [clientId, log]);

  /* ------------------------------- bridge ------------------------------ */

  const handleQuestion = useCallback(
    async (payload: BridgeQuestionPayload) => {
      const live = liveRef.current;
      setQuestion(payload);
      setChosenLetter(payload.selectedLetter);
      setPageUrl(payload.pageUrl);
      setAnswer(null);

      if (!live.running) {
        setPhase('waiting_user');
        log('พบคำถามแล้ว — กด “เริ่มตอบ” เพื่อให้ระบบวิเคราะห์', 'warn');
        return;
      }

      const cachedAnswer = live.answered.get(payload.fingerprint);
      if (cachedAnswer) {
        setAnswer(cachedAnswer);
        setPhase(cachedAnswer.status === 'ok' ? 'answered' : 'needs_review');
        if (cachedAnswer.status === 'ok') {
          linkRef.current?.sendAnswer({
            answer: cachedAnswer.answer,
            answerText: cachedAnswer.answerText,
            source: cachedAnswer.source,
            confidence: cachedAnswer.confidence,
            reason: cachedAnswer.reason,
            fingerprint: payload.fingerprint,
          });
        }
        log('ใช้คำตอบเดิมของคำถามนี้ (กันส่งซ้ำ)', 'info');
        return;
      }

      if (inFlightRef.current.has(payload.fingerprint)) {
        log('คำถามนี้กำลังวิเคราะห์อยู่ — ไม่ส่ง request ซ้ำ', 'info');
        return;
      }
      inFlightRef.current.add(payload.fingerprint);
      const requestSeq = ++requestSeqRef.current;
      setBusy(true);
      setPhase('searching_bank');
      try {
        const res = await api.analyze({
          clientId,
          question: payload.question,
          choices: payload.choices,
          questionId: payload.questionId || undefined,
          pageUrl: payload.pageUrl || undefined,
          chapterId: payload.chapterId || undefined,
          quizId: payload.quizId || undefined,
          ...(live.runId ? { runId: live.runId } : {}),
        });
        if (requestSeq === requestSeqRef.current && liveRef.current.question?.fingerprint === payload.fingerprint) applyAnalyzeResult(res, payload);
      } catch (err) {
        if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'status' in (err.body as object)) {
          if (requestSeq === requestSeqRef.current && liveRef.current.question?.fingerprint === payload.fingerprint) applyAnalyzeResult(err.body as AnalyzeResponse, payload);
        } else {
          setPhase('error');
          log(`วิเคราะห์ไม่สำเร็จ: ${err instanceof ApiError ? err.message : String(err)}`, 'bad');
        }
      } finally {
        inFlightRef.current.delete(payload.fingerprint);
        if (requestSeq === requestSeqRef.current) setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId],
  );

  const applyAnalyzeResult = useCallback(
    (res: AnalyzeResponse, payload: BridgeQuestionPayload) => {
      const live = liveRef.current;
      setAnswer(res);
      live.answered.set(payload.fingerprint, res);
      log(`ข้อ ${payload.index >= 0 ? payload.index + 1 : '?'}: ${describeAnalyze(res)}`, res.status === 'ok' ? 'good' : 'warn');

      if (res.status === 'ok') {
        setPhase('answered');
        linkRef.current?.sendAnswer({
          answer: res.answer,
          answerText: res.answerText,
          source: res.source,
          confidence: res.confidence,
          reason: res.reason,
          fingerprint: payload.fingerprint,
        });
        window.setTimeout(() => {
          if (liveRef.current.running) setPhase('waiting_user');
        }, 1200);
      } else if (res.status === 'needs_review') {
        setPhase('needs_review');
      } else if (res.status === 'ambiguous') {
        setPhase('needs_review');
        log('คำถามนี้มีหลายคำตอบใน Answer Bank — ระบบไม่เดา ให้คุณเลือกเอง', 'warn');
      } else {
        setPhase('needs_review');
      }

      const recordKey = payload.fingerprint;
      if (!live.recorded.has(recordKey)) {
        live.recorded.add(recordKey);
        void api
          .historyCreate({
            clientId,
            question: payload.question,
            choices: payload.choices,
            answer: res.status === 'ok' ? res.answer : null,
            answerText: res.status === 'ok' ? res.answerText : null,
            source: res.status === 'ok' ? res.source : 'none',
            confidence: 'confidence' in res ? res.confidence : 0,
            reason: 'reason' in res ? res.reason : null,
            status: res.status === 'ok' ? 'answered' : res.status === 'ambiguous' ? 'ambiguous' : 'needs_review',
            questionId: payload.questionId,
            pageUrl: payload.pageUrl,
            runId: live.runId,
            fingerprint: payload.fingerprint,
          })
          .then(() => refreshHistory(live.runId))
          .catch((err: unknown) => {
            live.recorded.delete(recordKey);
            log(`บันทึกประวัติไม่สำเร็จ: ${err instanceof ApiError ? err.message : String(err)}`, 'bad');
          });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId],
  );

  const handleResult = useCallback(
    async (payload: BridgeResultPayload) => {
      const live = liveRef.current;
      log(`ตรวจพบผลบททดสอบ: ${payload.kind}${payload.incorrectCount !== null ? ` (ผิด ${payload.incorrectCount} ข้อ)` : ''}`, payload.kind === 'passed' ? 'good' : 'warn');
      setPhase('quiz_done');
      setRunning(false);
      if (!live.runId) {
        void refreshRuns();
        return;
      }
      try {
        const res = await api.finishRun(clientId, live.runId, {
          result: payload.kind === 'passed' ? 'passed' : payload.kind === 'failed' ? 'failed' : undefined,
          ...(payload.incorrectCount !== null && payload.incorrectCount !== undefined ? { incorrectCount: payload.incorrectCount } : {}),
          ...(live.question?.total ? { totalQuestions: live.question.total } : {}),
        });
        setRun(res.run);
        await refreshHistory(live.runId);
        await refreshRuns();
      } catch (err) {
        log(`บันทึกผลบทไม่สำเร็จ: ${err instanceof ApiError ? err.message : String(err)}`, 'bad');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId],
  );

  const onBridgeEvent = useCallback(
    (event: BridgeEvent) => {
      switch (event.type) {
        case 'hello': {
          setBridgeConnected(true);
          setBridgeVersion(event.payload.bridgeVersion ?? '');
          const mode = linkRef.current?.mode ?? 'none';
          setBridgeMode(mode === 'none' && event.payload.mode === 'relay' ? 'relay' : mode);
          setPhase((prev) => (prev === 'idle' || prev === 'connecting' ? 'waiting_login' : prev));
          log(`Bridge เชื่อมต่อแล้ว (v${event.payload.bridgeVersion ?? '?'}, โหมด ${event.payload.mode ?? mode})`, 'good');
          linkRef.current?.sendInit({ ...liveRef.current.settings, assistantOrigin: window.location.origin });
          break;
        }
        case 'state': {
          const payload = event.payload;
          setLoginStatus(payload.login.status);
          setLoginSignals(payload.login.signals ?? []);
          setPageUrl(payload.url);
          setQuizDetected(payload.quiz.detected);
          setCaptchaDetected(payload.captchaDetected);
          setMaintenance(payload.maintenance);
          setBridgeHalted(!!payload.halted);
          if (payload.debug) setDebug(payload.debug);
          setBridgeConnected(true);
          if (payload.captchaDetected) {
            setRunning(false);
            setPhase('error');
            log('ตรวจพบ CAPTCHA — Bridge หยุดทำงานทั้งหมด (ระบบไม่ข้าม CAPTCHA) ให้คุณยืนยันด้วยตัวเอง', 'bad');
            break;
          }
          if (payload.maintenance) {
            setPhase('error');
            log('เว็บ RoV Academy แจ้งปิดปรับปรุง', 'warn');
            break;
          }
          if (!liveRef.current.running) {
            if (payload.login.status === 'logged_out') setPhase('waiting_login');
            else if (payload.login.status === 'logged_in') setPhase('logged_in');
            else if (payload.login.status === 'logging_in') setPhase('waiting_login');
          } else if (payload.quiz.detected) {
            setPhase((prev) => (prev === 'logged_in' || prev === 'waiting_login' || prev === 'idle' ? 'reading' : prev));
          }
          if (payload.result && payload.result.kind !== 'none' && liveRef.current.running) {
            void handleResult(payload.result as unknown as BridgeResultPayload);
          }
          break;
        }
        case 'question':
          void handleQuestion(event.payload);
          break;
        case 'result':
          void handleResult(event.payload);
          break;
        case 'debug':
          setDebug(event.payload);
          break;
        case 'error':
          log(`Bridge: ${event.payload.code} — ${event.payload.message}`, 'bad');
          if (event.payload.code === 'captcha_detected') {
            setRunning(false);
            setPhase('error');
          }
          break;
        case 'pong':
          log('Bridge ตอบกลับ ping (เชื่อมต่ออยู่)', 'info');
          break;
        case 'popup-closed':
          setBridgeConnected(false);
          setBridgeMode('none');
          setPhase((prev) => (prev === 'quiz_done' ? prev : 'idle'));
          log('หน้าต่าง RoV Academy ถูกปิด', 'warn');
          break;
        default:
          break;
      }
    },
    [handleQuestion, handleResult, log],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      await refreshHealth();
      try {
        const cfg = await api.publicConfig();
        if (alive && cfg.academyOrigin) setAcademyOrigin(cfg.academyOrigin);
      } catch {
        /* keep the default origin */
      }
      if (alive) {
        await refreshRuns();
        await refreshHistory(null);
      }
    })();
    const timer = window.setInterval(() => void refreshHealth(), 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const link = new BridgeLink({ academyOrigin, onEvent: onBridgeEvent });
    link.attach();
    linkRef.current = link;
    return () => {
      link.detach();
      if (linkRef.current === link) linkRef.current = null;
    };
  }, [academyOrigin, onBridgeEvent]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    saveSettings(settings);
    if (bridgeConnected) linkRef.current?.sendInit({ ...settings, assistantOrigin: window.location.origin });
  }, [settings, bridgeConnected]);

  /* ------------------------------- actions ----------------------------- */

  const openAcademy = () => {
    const win = linkRef.current?.open();
    if (!win) {
      log('เปิดหน้าต่างใหม่ไม่สำเร็จ (เบราว์เซอร์บล็อก popup) — เปิด academy.rov.in.th เองแล้วใช้โหมด relay/extension', 'warn');
      setPhase('connecting');
      return;
    }
    setPhase('connecting');
    setBridgeMode('popup');
    log('เปิด academy.rov.in.th — กรุณา login บัญชี Garena/RoV ด้วยตัวเอง (ระบบไม่เก็บรหัสผ่าน)', 'info');
    linkRef.current?.sendInit({ ...settings, assistantOrigin: window.location.origin });
  };

  const checkLogin = () => {
    if (!bridgeConnected) {
      log('ยังไม่ได้เชื่อมต่อ Bridge — ติดตั้ง Bridge ก่อน (ดูหัวข้อ “เชื่อมต่อ Bridge”)', 'warn');
      setPhase('error');
      return;
    }
    linkRef.current?.sendCommand('scan');
    linkRef.current?.ping();
    setPhase((prev) => (prev === 'idle' ? 'connecting' : prev));
    log('ส่งคำสั่งตรวจสถานะ login ไปยัง Bridge', 'info');
  };

  const startAnswering = async () => {
    if (!bridgeConnected) {
      log('ยังไม่ได้เชื่อมต่อ Bridge — กด “เปิด RoV Academy” แล้วเปิดใช้งาน Bridge ในหน้านั้นก่อน', 'warn');
      setPhase('error');
      return;
    }
    if (loginStatus !== 'logged_in') {
      log(`สถานะ login คือ “${LOGIN_LABEL[loginStatus]}” — กรุณาเข้าสู่ระบบในหน้า RoV Academy ก่อน`, 'warn');
      setPhase('waiting_login');
      linkRef.current?.sendCommand('scan');
      return;
    }
    try {
      const res = await api.createRun(clientId, {
        ...(question?.chapterId ? { chapterId: question.chapterId, quizId: question.quizId } : {}),
        ...(question?.total ? { totalQuestions: question.total } : {}),
      });
      setRun(res.run);
      setRunId(res.run.id);
      liveRef.current.runId = res.run.id;
      liveRef.current.answered.clear();
      liveRef.current.recorded.clear();
      setRunning(true);
      setPhase('reading');
      linkRef.current?.sendInit({ ...settings, assistantOrigin: window.location.origin });
      linkRef.current?.sendCommand('reset');
      linkRef.current?.sendCommand('scan');
      log(`เริ่มตอบ (run ${res.run.id.slice(0, 12)}) — กำลังอ่านคำถามจากหน้าเว็บ`, 'good');
      await refreshRuns();
    } catch (err) {
      setPhase('error');
      log(`เริ่ม run ไม่สำเร็จ: ${err instanceof ApiError ? err.message : String(err)}`, 'bad');
    }
  };

  const stopAnswering = () => {
    setRunning(false);
    setPhase('stopped');
    linkRef.current?.sendCommand('clear');
    log('หยุดตอบอัตโนมัติแล้ว (Bridge ยังเชื่อมต่ออยู่)', 'warn');
  };

  const restartQuestion = () => {
    setAnswer(null);
    setChosenLetter(null);
    liveRef.current.answered.clear();
    setPhase('reading');
    linkRef.current?.sendCommand('reset');
    log('ล้างแคชคำตอบแล้วสแกนใหม่', 'info');
  };

  const retryAnalyze = async () => {
    const current = liveRef.current.question;
    if (!current) return;
    setBusy(true);
    setPhase('asking_gemini');
    liveRef.current.answered.delete(current.fingerprint);
    liveRef.current.recorded.delete(current.fingerprint);
    try {
      const res = await api.analyze({
        clientId,
        question: current.question,
        choices: current.choices,
        questionId: current.questionId || undefined,
        pageUrl: current.pageUrl || undefined,
        chapterId: current.chapterId || undefined,
        ...(liveRef.current.runId ? { runId: liveRef.current.runId } : {}),
        bypassCache: true,
      });
      applyAnalyzeResult(res, current);
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === 'object' && 'status' in (err.body as object)) {
        applyAnalyzeResult(err.body as AnalyzeResponse, current);
      } else {
        setPhase('error');
        log(`ถามใหม่ไม่สำเร็จ: ${err instanceof ApiError ? err.message : String(err)}`, 'bad');
      }
    } finally {
      setBusy(false);
    }
  };

  const chooseManually = (letter: string) => {
    setChosenLetter(letter);
    const current = liveRef.current.question;
    linkRef.current?.sendCommand('select', { answer: letter, source: 'manual', confidence: 1 });
    if (!current) return;
    const choice = current.choices.find((c) => c.id === letter);
    log(`คุณเลือกข้อ ${letter}${choice ? ` (${choice.text.slice(0, 40)})` : ''} ด้วยตัวเอง`, 'info');
    if (liveRef.current.recorded.has(`${current.fingerprint}:manual`)) return;
    liveRef.current.recorded.add(`${current.fingerprint}:manual`);
    void api
      .historyCreate({
        clientId,
        question: current.question,
        choices: current.choices,
        answer: letter,
        answerText: choice?.text ?? null,
        source: 'none',
        confidence: 0,
        reason: 'ผู้ใช้เลือกเอง (ระบบไม่มั่นใจพอ)',
        status: 'answered',
        questionId: current.questionId,
        pageUrl: current.pageUrl,
        runId: liveRef.current.runId,
        fingerprint: current.fingerprint,
      })
      .then(() => refreshHistory(liveRef.current.runId))
      .catch(() => liveRef.current.recorded.delete(`${current.fingerprint}:manual`));
  };

  const clearHistory = async () => {
    if (!window.confirm('ล้างประวัติทั้งหมดของเครื่องนี้? (ทำแล้วกู้ไม่ได้)')) return;
    try {
      const res = await api.historyDelete(clientId);
      log(`ล้างประวัติแล้ว ${res.deleted} รายการ`, 'warn');
      setRun(null);
      setRunId(null);
      setStats(EMPTY_STATS);
      await refreshHistory(null);
      await refreshRuns();
    } catch (err) {
      log(`ล้างประวัติไม่สำเร็จ: ${err instanceof ApiError ? err.message : String(err)}`, 'bad');
    }
  };

  const openRun = async (target: RunSummary) => {
    setRunId(target.id);
    setRun(target);
    liveRef.current.runId = target.id;
    await refreshHistory(target.id);
    log(`เปิดดู run ${target.id.slice(0, 12)}`, 'info');
  };

  /* -------------------------------- render ----------------------------- */

  const tone = PHASE_TONE[phase];
  const aiLabel = health ? (health.aiConfigured ? `พร้อม (${health.ai.model})` : 'ยังไม่ได้ตั้ง GEMINI_API_KEY') : 'กำลังตรวจ…';

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">
          <span className="logo" aria-hidden="true">
            🎮
          </span>
          <div>
            <h1>RoV Academy AI Assistant</h1>
            <p className="subtitle">
              ตอบบททดสอบ RoV Academy ด้วย Answer Bank + Gemini · v{health?.version ?? '?'}
            </p>
          </div>
        </div>
        <button type="button" className="mini-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? '☀️ สว่าง' : '🌙 มืด'}
        </button>
      </header>

      <div className={`phase phase-${tone}`} role="status" aria-live="polite">
        <span className="phase-dot" aria-hidden="true" />
        <span className="phase-text">{PHASE_LABEL[phase]}</span>
        {busy ? <span className="spinner" aria-hidden="true" /> : null}
      </div>

      <main className="main">
        <Section title="สถานะการเชื่อมต่อ" subtitle="RoV Academy · Login · Bridge">
          <StatusPill
            label="Bridge"
            value={bridgeConnected ? `เชื่อมต่อแล้ว (${bridgeMode === 'popup' ? 'popup' : bridgeMode === 'relay' ? 'relay' : 'พร้อม'})` : 'ยังไม่เชื่อมต่อ'}
            tone={bridgeConnected ? 'good' : 'idle'}
          />
          <StatusPill
            label="Login"
            value={LOGIN_LABEL[loginStatus]}
            tone={loginStatus === 'logged_in' ? 'good' : loginStatus === 'logging_in' ? 'info' : loginStatus === 'logged_out' ? 'warn' : 'idle'}
          />
          <StatusPill label="หน้า Quiz" value={quizDetected ? 'ตรวจพบแล้ว' : 'ยังไม่พบ'} tone={quizDetected ? 'good' : 'idle'} />
          <StatusPill label="เซิร์ฟเวอร์" value={health ? (health.status === 'ok' ? 'ออนไลน์' : 'degraded') : healthError ? 'เชื่อมต่อไม่ได้' : 'กำลังตรวจ…'} tone={health ? (health.status === 'ok' ? 'good' : 'warn') : healthError ? 'bad' : 'idle'} />
          <StatusPill label="Answer Bank" value={health ? `${health.answerBank.entries} ข้อ (${health.answerBank.source})` : '…'} tone={health && health.answerBank.configured ? 'good' : 'warn'} />
          <StatusPill label="Gemini" value={aiLabel} tone={health?.aiConfigured ? 'good' : 'warn'} />
          {captchaDetected ? <div className="alert alert-bad">🛑 ตรวจพบ CAPTCHA — ระบบหยุดทั้งหมด กรุณายืนยันด้วยตัวเอง (ไม่มีการข้าม CAPTCHA)</div> : null}
          {maintenance ? <div className="alert alert-warn">🔧 เว็บ RoV Academy แจ้งปิดปรับปรุง</div> : null}
          {bridgeHalted && !captchaDetected ? <div className="alert alert-warn">Bridge หยุดทำงานชั่วคราว</div> : null}
          {healthError ? <div className="alert alert-bad">เซิร์ฟเวอร์: {healthError}</div> : null}

          {loginSignals.length > 0 ? (
            <details className="signals">
              <summary>สัญญาณที่ใช้ตรวจ login ({loginSignals.length})</summary>
              <ul>
                {loginSignals.map((s, i) => (
                  <li key={`${s.name}-${i}`}>
                    <code>{s.name}</code> = {s.value} <span className="chip chip-dim">tier {s.tier}</span>
                  </li>
                ))}
              </ul>
              <p className="muted">ตรวจจาก DOM/สถานะเซสชันที่หน้าเว็บแสดงเท่านั้น — ไม่มีการอ่านคุกกี้ โทเคน หรือรหัสผ่าน</p>
            </details>
          ) : null}

          <div className="btn-grid">
            <Button onClick={openAcademy} full>
              🌐 เปิด RoV Academy
            </Button>
            <Button variant="ghost" onClick={checkLogin} full>
              🔎 ตรวจสอบ Login
            </Button>
            <Button variant={running ? 'ghost' : 'primary'} onClick={() => void startAnswering()} disabled={running} full>
              ▶️ เริ่มตอบคำถาม
            </Button>
            <Button variant="danger" onClick={stopAnswering} disabled={!running} full>
              ⏹ หยุด
            </Button>
            <Button variant="warn" onClick={restartQuestion} full>
              🔁 ตอบใหม่
            </Button>
            <Button variant="ghost" onClick={() => void refreshHealth()} full>
              ♻️ รีเฟรชสถานะ
            </Button>
          </div>
          {pageUrl ? (
            <p className="page-url">
              หน้าปัจจุบัน: <code>{pageUrl}</code>
            </p>
          ) : null}
        </Section>

        <InstallPanel assistantOrigin={window.location.origin} />

        <Section title="คำถามปัจจุบัน" subtitle={question ? `บท ${question.chapterId || '-'} · ข้อ ${(question.index ?? -1) + 1}/${question.total || '?'}` : 'รอ Bridge อ่านจากหน้าเว็บ'}>
          <QuestionCard
            question={question}
            answer={answer}
            busy={busy}
            chosenLetter={chosenLetter}
            onChoose={chooseManually}
            onRetry={() => void retryAnalyze()}
            phaseLabel={PHASE_LABEL[phase]}
          />
        </Section>

        <Section title="สถิติ" subtitle={run ? `run ${run.id.slice(0, 12)}` : 'รวมทุกบทของเครื่องนี้'}>
          <StatsGrid stats={stats} />
          {answer && answer.status === 'ok' ? (
            <div className="last-answer">
              <span>คำตอบล่าสุด: </span>
              <strong>
                {answer.answer} · {answer.answerText}
              </strong>
              <ConfidenceBar value={answer.confidence} />
            </div>
          ) : null}
        </Section>

        <ResultCard run={run} stats={stats} onRestart={restartQuestion} />

        <DebugPanel debug={debug} bridgeVersion={bridgeVersion} />
        <SettingsPanel settings={settings} onChange={setSettings} disabled={bridgeConnected} />
        <HistoryPanel items={history} total={historyTotal} onClear={() => void clearHistory()} onRefresh={() => void refreshHistory(runId)} loading={historyLoading} />
        <RunsPanel runs={runs} onOpen={(r) => void openRun(r)} />
        <ActivityLog lines={logs} onClear={() => setLogs([])} />
      </main>

      <footer className="footer">
        <p>
          ระบบนี้ไม่เก็บ username / password ของ Garena · ไม่ข้าม CAPTCHA · ผู้ใช้ต้อง login เองเสมอ · คำตอบเป็นเพียงตัวช่วย
          โปรดตรวจสอบก่อนกดส่ง
        </p>
        <p className="muted">
          clientId: <code>{clientId}</code> (สุ่มและเก็บในเครื่องนี้เท่านั้น ใช้แยกประวัติของแต่ละอุปกรณ์)
        </p>
      </footer>
    </div>
  );
}

export default App;

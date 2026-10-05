"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Swords,
  ArrowRight,
  Timer,
  CheckCircle2,
  XCircle,
  Trophy,
  RotateCcw,
  History,
} from "lucide-react";
import { api, post, errorMessage } from "@/lib/api";
import { Chapter, PublicQuestion, AnswerResult, Summary } from "@/lib/types";
import { PageTitle, ErrorBox, Badge } from "@/components/ui";
type Session = {
  session_id: string;
  questions: PublicQuestion[];
  total: number;
};
type HistoryRow = {
  session_id: string;
  score: number;
  total: number;
  started_at: string;
  finished_at: string | null;
};
// ไม่มีเฉลยใน session ที่ได้รับ; backend เป็นผู้ตัดสินคะแนน
export default function QuizPage() {
  const [chapters, setChapters] = useState<Chapter[]>([]),
    [selected, setSelected] = useState<string>(""),
    [count, setCount] = useState(10),
    [seconds, setSeconds] = useState(0),
    [remaining, setRemaining] = useState(0),
    [session, setSession] = useState<Session | null>(null),
    [cursor, setCursor] = useState(0),
    [result, setResult] = useState<AnswerResult | null>(null),
    [summary, setSummary] = useState<Summary | null>(null),
    [history, setHistory] = useState<HistoryRow[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(() => {
    Promise.all([
      api<Chapter[]>("/stats/chapters"),
      api<HistoryRow[]>("/quiz/history"),
    ])
      .then(([c, h]) => {
        setChapters(c);
        setHistory(h);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    setRemaining(seconds);
  }, [session?.session_id, cursor, seconds]);
  const answer = useCallback(
    async (index: number | null) => {
      if (!session || result || inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        setResult(
          await post<AnswerResult>("/quiz/answer", {
            session_id: session.session_id,
            question_id: session.questions[cursor].id,
            answer_idx: index,
          }),
        );
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [session, cursor, result],
  );
  useEffect(() => {
    if (!session || summary || result || !seconds || busy || error) return;
    const timer = setInterval(
      () => setRemaining((x) => Math.max(0, x - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [session, summary, result, seconds, busy, error]);
  useEffect(() => {
    if (
      session &&
      !summary &&
      !result &&
      seconds &&
      remaining === 0 &&
      !busy &&
      !error
    )
      void answer(null);
  }, [session, summary, result, seconds, remaining, busy, error, answer]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const s = await post<Session>("/quiz/start", {
        chapters: selected ? [Number(selected)] : [],
        count,
      });
      setCursor(0);
      setResult(null);
      setSummary(null);
      setSession(s);
      setRemaining(seconds);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function end() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      setSummary(await post<Summary>(`/quiz/end/${session.session_id}`));
      api<HistoryRow[]>("/quiz/history")
        .then(setHistory)
        .catch(() => {});
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setSession(null);
    setSummary(null);
    setResult(null);
    setCursor(0);
    setError("");
  }
  const current = session?.questions[cursor];
  return (
    <>
      <PageTitle
        eyebrow="PRACTICE ARENA"
        title="ฝึกทำควิซ"
        description="เลือกบทเรียน ทดสอบความเข้าใจ แล้วเรียนรู้จากคำตอบของคุณ"
      />
      <ErrorBox message={error} />
      {!session ? (
        <div className="grid xl:grid-cols-[1.5fr_1fr] gap-6">
          <section className="panel p-6 sm:p-8">
            <div className="flex gap-4 items-center mb-8">
              <span className="metric-icon p-3">
                <Swords size={25} />
              </span>
              <div>
                <h2 className="text-xl font-bold">พร้อมสำหรับรอบใหม่?</h2>
                <p className="text-xs text-muted mt-2">
                  ระบบจะสุ่มข้อสอบจากบทที่คุณเลือก
                </p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <label htmlFor="quiz-chapter" className="field-label">
                  บทเรียน
                </label>
                <select
                  id="quiz-chapter"
                  className="input"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">ทุกบทเรียน · สุ่มแบบรวม</option>
                  {chapters.map((c) => (
                    <option key={c.chapter_id} value={c.chapter_id}>
                      {c.chapter_id} · {c.chapter_name} ({c.total} ข้อ)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="quiz-count" className="field-label">
                    จำนวนข้อ
                  </label>
                  <input
                    id="quiz-count"
                    className="input"
                    type="number"
                    min={1}
                    max={184}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label htmlFor="quiz-timer" className="field-label">
                    เวลาต่อข้อ
                  </label>
                  <select
                    id="quiz-timer"
                    className="input"
                    value={seconds}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                  >
                    <option value={0}>ไม่จับเวลา</option>
                    <option value={15}>15 วินาที</option>
                    <option value={30}>30 วินาที</option>
                    <option value={60}>60 วินาที</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted leading-7 bg-ink rounded-lg p-4">
                หากบทที่เลือกมีข้อสอบน้อยกว่าที่ตั้งไว้ จะใช้ทุกข้อในบทนั้น
                <br />
                คำตอบบางข้อยังเป็นข้อเสนอจากบทเรียน ตรวจสถานะและหมายเหตุประกอบ
              </p>
              <button
                className="btn btn-primary w-full py-3.5"
                disabled={busy || !chapters.length || count < 1 || count > 184}
                onClick={start}
              >
                <Swords size={17} />
                {busy ? "กำลังสร้างควิซ…" : "เริ่มทำควิซ"}
                <ArrowRight size={17} />
              </button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2 className="flex gap-2 items-center">
                  <History size={17} className="text-muted" />
                  ประวัติการฝึกฝน
                </h2>
                <p>ควิซล่าสุดของคุณ</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {history.length ? (
                history.slice(0, 8).map((h) => (
                  <div
                    className="bg-ink rounded-lg p-4 flex items-center justify-between"
                    key={h.session_id}
                  >
                    <div>
                      <p className="text-xs">
                        {new Date(h.started_at).toLocaleString("th-TH", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="text-[10px] text-muted mt-2">
                        {h.finished_at ? "เล่นจบแล้ว" : "ยังไม่จบ"}
                      </p>
                    </div>
                    <strong className="text-cyan">
                      {h.score}
                      <span className="text-muted font-normal">
                        {" "}
                        / {h.total}
                      </span>
                    </strong>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted text-center py-10">
                  เริ่มควิซแรกของคุณได้เลย
                </p>
              )}
            </div>
          </section>
        </div>
      ) : summary ? (
        <div className="max-w-3xl mx-auto">
          <section className="panel p-8 text-center">
            <Trophy size={45} className="mx-auto text-amber-300 mb-5" />
            <p className="eyebrow">ROUND COMPLETED</p>
            <h2 className="text-2xl font-bold my-3">จบรอบนี้แล้ว!</h2>
            <p className="text-6xl font-bold text-cyan my-7">
              {summary.score}
              <span className="text-2xl text-muted"> / {summary.total}</span>
            </p>
            <p className="text-muted text-sm">
              ตอบถูก {Math.round((summary.score / summary.total) * 100)}% ·
              ตอบแล้ว {summary.answered} ข้อ
            </p>
            <button className="btn btn-primary mt-7" onClick={reset}>
              <RotateCcw size={17} />
              เล่นอีกครั้ง
            </button>
          </section>
          <h3 className="font-bold text-lg mt-8 mb-5">
            ทบทวนข้อที่ตอบผิด / ยังไม่ได้ตอบ ({summary.wrong_answers.length})
          </h3>
          <div className="space-y-4">
            {summary.wrong_answers.map((q) => (
              <article key={q.id} className="panel p-5">
                <p className="text-[10px] text-muted mb-3">
                  {q.chapter_name} · ข้อ {q.no}{" "}
                  {q.unanswered ? "· ยังไม่ได้ตอบ" : ""}
                </p>
                <h4 className="leading-7">{q.question}</h4>
                <p className="text-xs text-rose-300 mt-4">
                  คำตอบของคุณ:{" "}
                  {q.selected_idx === null
                    ? "ไม่ได้เลือก / หมดเวลา"
                    : q.options[q.selected_idx]}
                </p>
                <p className="text-xs text-cyan mt-2">
                  เฉลย: {q.answer_idx + 1}. {q.answer_text}
                </p>
                {q.note && (
                  <p className="text-xs text-muted leading-7 mt-3">{q.note}</p>
                )}
                <p className="text-[10px] text-muted mt-3">
                  {q.verified ? "ตรวจสอบแล้ว" : q.source_type}
                </p>
              </article>
            ))}
            {!summary.wrong_answers.length && (
              <div className="panel p-6 text-center text-cyan">
                ตอบถูกครบทุกข้อในรอบนี้
              </div>
            )}
          </div>
        </div>
      ) : (
        current && (
          <div className="max-w-3xl mx-auto">
            <section className="panel p-6 sm:p-8">
              <div className="flex justify-between items-center gap-4 mb-5">
                <span className="text-xs text-muted">
                  ข้อ {cursor + 1} / {session.total}
                </span>
                {seconds > 0 && (
                  <span
                    className={`flex gap-2 items-center text-sm ${remaining <= 5 ? "text-rose-300" : "text-cyan"}`}
                  >
                    <Timer size={17} />
                    {remaining} วินาที
                  </span>
                )}
                <span className="text-xs text-muted">
                  {current.chapter_name}
                </span>
              </div>
              <div className="progress-track mb-8">
                <div
                  className="progress-fill"
                  style={{
                    width: `${((cursor + (result ? 1 : 0)) / session.total) * 100}%`,
                  }}
                />
              </div>
              <h2 className="text-xl font-bold leading-9 mb-7">
                {current.question}
              </h2>
              <div className="space-y-3">
                {current.options.map((option, i) => (
                  <button
                    key={i}
                    disabled={busy || !!result}
                    onClick={() => answer(i)}
                    className={`option ${result ? (i === result.answer_idx ? "correct" : i === result.selected_idx ? "incorrect" : "") : ""}`}
                  >
                    <span className="option-letter">{i + 1}</span>
                    <span>{option}</span>
                    {result && i === result.answer_idx && (
                      <CheckCircle2
                        size={20}
                        className="text-cyan ml-auto shrink-0"
                      />
                    )}
                  </button>
                ))}
              </div>
              {result && (
                <div
                  className={`p-5 mt-6 rounded-lg ${result.correct ? "bg-cyan/10" : "bg-rose-400/10"}`}
                >
                  <div
                    className={`font-bold flex items-center gap-2 ${result.correct ? "text-cyan" : "text-rose-300"}`}
                  >
                    {result.correct ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <XCircle size={18} />
                    )}{" "}
                    {result.correct
                      ? "ตอบถูกแล้ว!"
                      : result.selected_idx === null
                        ? "หมดเวลาในข้อนี้"
                        : "ยังไม่ถูก ลองดูเฉลยกัน"}
                  </div>
                  <p className="text-sm leading-7 mt-3">
                    เฉลย: {result.answer_idx + 1}. {result.answer_text}
                  </p>
                  {result.note && (
                    <p className="text-xs text-muted leading-7 mt-3">
                      {result.note}
                    </p>
                  )}
                  <div className="mt-3">
                    <Badge
                      status={
                        result.verified
                          ? "verified"
                          : result.source_type === "กำกวม"
                            ? "ambiguous"
                            : result.source_type === "วิเคราะห์จากบทเรียน"
                              ? "analyzed"
                              : "reference"
                      }
                    />
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center mt-7">
                <button
                  disabled={busy}
                  className="text-muted text-xs hover:text-white"
                  onClick={() => {
                    if (
                      window.confirm(
                        "จบควิซตอนนี้? ข้อที่เหลือจะนับเป็นไม่ได้ตอบ",
                      )
                    )
                      void end();
                  }}
                >
                  จบควิซก่อนกำหนด
                </button>
                {result && (
                  <button
                    disabled={busy}
                    className="btn btn-primary"
                    onClick={() => {
                      if (cursor + 1 === session.total) void end();
                      else {
                        setCursor(cursor + 1);
                        setRemaining(seconds);
                        setResult(null);
                        setError("");
                      }
                    }}
                  >
                    {cursor + 1 === session.total ? "ดูผลคะแนน" : "ข้อถัดไป"}
                    <ArrowRight size={16} />
                  </button>
                )}
                {!result && remaining === 0 && seconds > 0 && error && (
                  <button className="btn" onClick={() => answer(null)}>
                    ส่งคำตอบหมดเวลาอีกครั้ง
                  </button>
                )}
              </div>
            </section>
            <p className="text-center text-[10px] text-muted mt-5">
              คะแนนอ้างอิงคำตอบในคลัง ·
              อ่านหลักฐานประกอบเพื่อเรียนรู้อย่างเข้าใจ
            </p>
          </div>
        )
      )}
    </>
  );
}

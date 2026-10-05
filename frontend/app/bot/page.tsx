"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Play,
  Square,
  Radio,
  Terminal,
  FlaskConical,
  Clock3,
  Download,
} from "lucide-react";
import { API, api, post, errorMessage } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { BotRun, Chapter, Log } from "@/lib/types";
import { useUser } from "@/components/shell";
import { PageTitle, ErrorBox, Badge, Empty } from "@/components/ui";
// WebSocket reconnect และ log replay ป้องกัน log หายระหว่างเปิดหน้า
export default function BotPage() {
  const user = useUser();
  const [chapters, setChapters] = useState<Chapter[]>([]),
    [selected, setSelected] = useState<number[]>([]),
    [headless, setHeadless] = useState(true),
    [delay, setDelay] = useState(3),
    [mode, setMode] = useState("demo"),
    [runs, setRuns] = useState<BotRun[]>([]),
    [active, setActive] = useState<BotRun | null>(null),
    [logs, setLogs] = useState<Log[]>([]),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const terminal = useRef<HTMLDivElement>(null);
  useEffect(() => {
    Promise.all([api<Chapter[]>("/stats/chapters"), api<BotRun[]>("/bot/runs")])
      .then(([c, r]) => {
        setChapters(c);
        setRuns(r);
        setActive(
          r.find((x) => ["queued", "running", "stopping"].includes(x.status)) ||
            r[0] ||
            null,
        );
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      api<BotRun[]>("/bot/runs")
        .then((r) => {
          setRuns(r);
          setActive((old) =>
            old ? r.find((x) => x.task_id === old.task_id) || old : null,
          );
        })
        .catch((e) => setError(errorMessage(e)));
    }, 3000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!active) return;
    setLogs([]);
    setConnected(false);
    let closed = false,
      socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<string>();
    function connect() {
      if (closed) return;
      socket = new WebSocket(
        API.replace(/^http/, "ws") + `/ws/logs/${active!.task_id}`,
      );
      socket.onopen = () => {
        socket?.send(JSON.stringify({ token: getToken() }));
        setConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "log" && !seen.has(data.id)) {
            seen.add(data.id);
            setLogs((old) => [...old, data].slice(-1000));
          }
          if (data.type === "error") setError(data.message);
        } catch {
          setError("อ่าน log ไม่สำเร็จ");
        }
      };
      socket.onerror = () => setConnected(false);
      socket.onclose = (event) => {
        setConnected(false);
        if (!closed && event.code !== 1008) timer = setTimeout(connect, 3000);
        else if (event.code === 1008 && !closed)
          setError("ไม่มีสิทธิ์ดู log หรือ session หมดอายุ");
      };
    }
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [active?.task_id]);
  useEffect(() => {
    if (terminal.current)
      terminal.current.scrollTop = terminal.current.scrollHeight;
  }, [logs]);
  const running = runs.some((r) =>
    ["queued", "running", "stopping"].includes(r.status),
  );
  async function start() {
    setBusy(true);
    setError("");
    try {
      const run = await post<BotRun>("/bot/start", {
        chapters: selected,
        headless,
        delay,
        mode,
      });
      setActive(run);
      setRuns((old) => [run, ...old]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!active) return;
    setBusy(true);
    setError("");
    try {
      const run = await post<BotRun>(`/bot/stop/${active.task_id}`);
      setActive(run);
      setRuns((old) => old.map((r) => (r.task_id === run.task_id ? run : r)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function downloadLogs() {
    const blob = new Blob(
      [logs.map((l) => `${l.time} [${l.level}] ${l.message}`).join("\n")],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rov-${active?.task_id || "logs"}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <PageTitle
        eyebrow="AUTOMATION LAB"
        title="ควบคุมบอท"
        description="ตั้งค่าการทดลอง สั่งเริ่มหรือหยุด และติดตามการทำงานแบบสด"
      />
      <ErrorBox message={error} />
      <div className="grid xl:grid-cols-[340px_1fr] gap-6">
        <section className="panel p-5 h-fit">
          <div className="flex gap-2 items-center mb-6">
            <Bot size={20} className="text-cyan" />
            <h2 className="font-bold">ตั้งค่าการทำงาน</h2>
          </div>
          <label className="field-label" htmlFor="bot-mode">
            โหมด
          </label>
          <select
            id="bot-mode"
            className="input mb-4"
            value={mode}
            disabled={running}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="demo">Demo · ทดลองในเครื่อง</option>
            {user?.is_admin && (
              <option value="academy">Academy · ระบบจริง</option>
            )}
          </select>
          <div className="bg-ink border border-slate-700 rounded-lg p-3 text-[11px] leading-6 text-muted mb-5 flex gap-2">
            <FlaskConical size={17} className="text-cyan shrink-0 mt-1" />
            <span>
              {mode === "demo"
                ? "Demo ใช้ Chromium ทดลองเลือกคำตอบและ Submit โดยไม่ติดต่อ Academy"
                : "ใช้เพื่อการศึกษา การทำข้อสอบอัตโนมัติบนระบบจริงอาจผิด ToS ต้องตั้ง selector ให้ตรงกับเว็บก่อน"}
            </span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <label className="field-label mb-0">
              บทเรียน ({selected.length})
            </label>
            <button
              disabled={running}
              className="text-[10px] text-cyan"
              onClick={() =>
                setSelected(
                  selected.length === chapters.length
                    ? []
                    : chapters.map((c) => c.chapter_id),
                )
              }
            >
              {selected.length === chapters.length
                ? "ยกเลิกทั้งหมด"
                : "เลือกทั้งหมด"}
            </button>
          </div>
          <div className="space-y-2 max-h-[290px] overflow-auto pr-1 mb-5">
            {chapters.map((c) => (
              <label key={c.chapter_id} className="chapter-check">
                <input
                  type="checkbox"
                  disabled={running}
                  checked={selected.includes(c.chapter_id)}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, c.chapter_id]
                        : old.filter((x) => x !== c.chapter_id),
                    )
                  }
                />
                <span className="flex-1">
                  {c.chapter_id} · {c.chapter_name}
                </span>
                <small className="text-muted">{c.total}</small>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label htmlFor="bot-delay" className="field-label">
                Delay (วินาที)
              </label>
              <input
                id="bot-delay"
                className="input"
                type="number"
                min={2}
                max={4}
                step={0.5}
                value={delay}
                disabled={running}
                onChange={(e) => setDelay(Number(e.target.value))}
              />
            </div>
            <label className="flex gap-2 items-center pt-6 text-xs">
              <input
                type="checkbox"
                checked={headless}
                disabled={running}
                onChange={(e) => setHeadless(e.target.checked)}
              />
              Headless
            </label>
          </div>
          <div className="flex gap-3">
            <button
              className="btn btn-primary flex-1"
              disabled={
                busy || running || !selected.length || delay < 2 || delay > 4
              }
              onClick={start}
            >
              <Play size={15} />
              {busy ? "รอสักครู่…" : "Start"}
            </button>
            <button
              className="btn btn-danger flex-1"
              disabled={
                busy ||
                !active ||
                !["queued", "running", "stopping"].includes(active.status)
              }
              onClick={stop}
            >
              <Square size={14} />
              Stop
            </button>
          </div>
          <p className="text-muted text-[10px] leading-6 mt-4">
            Redis และ Celery worker ต้องทำงาน
            <br />
            Manual login จะเปิด browser ที่เครื่อง worker
          </p>
        </section>
        <div className="min-w-0 space-y-6">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2 className="flex items-center gap-2">
                  <Terminal size={17} className="text-muted" />
                  Live Console
                </h2>
                <p>
                  {active
                    ? `Task ${active.task_id.slice(0, 8)} · ${active.result.mode?.toUpperCase() || "BOT"}`
                    : "เลือกงานจากประวัติหรือเริ่มงานใหม่"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {active && <Badge status={active.status} />}
                <span
                  className={`text-[10px] flex gap-1 items-center ${connected ? "text-cyan" : "text-muted"}`}
                >
                  <Radio size={13} />
                  {connected ? "LIVE" : "OFFLINE"}
                </span>
                <button
                  aria-label="ดาวน์โหลด log"
                  className="icon-button"
                  disabled={!logs.length}
                  onClick={downloadLogs}
                >
                  <Download size={15} />
                </button>
              </div>
            </div>
            <div className="terminal" ref={terminal}>
              {logs.length ? (
                logs.map((log) => (
                  <div key={log.id} className="terminal-line">
                    <time>
                      {new Date(log.time).toLocaleTimeString("th-TH")}
                    </time>
                    <span
                      className={
                        log.level === "error"
                          ? "text-rose-300"
                          : log.level === "success"
                            ? "text-cyan"
                            : log.level === "warning"
                              ? "text-amber-300"
                              : "text-slate-300"
                      }
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-600">
                  {active
                    ? "เชื่อมต่อ log… หากงานรอคิว ตรวจว่า Celery worker เปิดอยู่"
                    : "// Console พร้อมสำหรับการทดลองครั้งถัดไป"}
                </div>
              )}
            </div>
            {active?.result.error && (
              <div className="p-4 text-rose-300 text-xs leading-6">
                {active.result.error}
              </div>
            )}
            {active?.status === "success" && (
              <div className="p-4 text-cyan text-xs">
                {active.result.mode === "demo"
                  ? `Demo เสร็จแล้ว · ส่งคำตอบ ${active.result.submitted || 0} ข้อ`
                  : active.result.session_saved
                    ? "บันทึก Academy session สำเร็จ"
                    : `ส่งคำตอบ ${active.result.submitted || 0} ข้อ · ยังไม่ได้ยืนยันคะแนนจาก Academy`}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2 className="flex gap-2 items-center">
                  <Clock3 size={17} className="text-muted" />
                  ประวัติการรัน
                </h2>
                <p>ล่าสุด 50 ครั้ง · คลิกเพื่อดู log</p>
              </div>
              <span className="text-[10px] text-muted">
                {runs.length} ครั้ง
              </span>
            </div>
            {runs.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>เวลาที่เริ่ม</th>
                      <th>โหมด / บท</th>
                      <th>สถานะ</th>
                      <th>Task</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr
                        key={r.task_id}
                        className="cursor-pointer"
                        onClick={() => setActive(r)}
                      >
                        <td className="whitespace-nowrap">
                          {new Date(r.started_at).toLocaleString("th-TH", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="text-muted">
                          {r.result.mode?.toUpperCase() || "LOGIN"} ·{" "}
                          {r.chapters.length} บท
                        </td>
                        <td>
                          <Badge status={r.status} />
                        </td>
                        <td>
                          <button
                            className="text-cyan text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActive(r);
                            }}
                          >
                            {r.task_id.slice(0, 8)}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty text="ยังไม่มีประวัติการรัน" />
            )}
          </section>
        </div>
      </div>
    </>
  );
}

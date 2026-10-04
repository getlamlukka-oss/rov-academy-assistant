import React, { useEffect, useState, useCallback, useRef } from "react";
import { invokeFunction, startAutomation } from "@/lib/rovClient";
import StatusHeader from "@/components/rov/StatusHeader";
import KnowledgeCard from "@/components/rov/KnowledgeCard";
import GeminiCard from "@/components/rov/GeminiCard";
import BrowserCard from "@/components/rov/BrowserCard";
import ControlPanel from "@/components/rov/ControlPanel";
import ActivityLog from "@/components/rov/ActivityLog";

export default function Home() {
  const [health, setHealth] = useState(null);
  const [knowledge, setKnowledge] = useState(null);
  const [gemini, setGemini] = useState(null);
  const [geminiVerifying, setGeminiVerifying] = useState(false);
  const [geminiResult, setGeminiResult] = useState(null);
  const [uiState, setUiState] = useState("IDLE");
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const automationRef = useRef(null);
  const liveUrlRef = useRef(null);

  const addLog = useCallback((message) => {
    setLogs((prev) => [
      ...prev.slice(-99),
      { time: new Date().toLocaleTimeString("th-TH"), message },
    ]);
  }, []);

  const loadStatuses = useCallback(async () => {
    try {
      const h = await invokeFunction("getHealth", {});
      setHealth(h);
    } catch (e) {
      addLog("โหลดสถานะระบบไม่สำเร็จ");
    }
    try {
      const k = await invokeFunction("getKnowledgeStatus", {});
      setKnowledge(k);
    } catch (e) {
      /* knowledge card shows empty state */
    }
    try {
      const g = await invokeFunction("getGeminiStatus", {});
      setGemini(g);
    } catch (e) {
      /* gemini card shows untested state */
    }
  }, [addLog]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const handleVerifyGemini = async () => {
    setGeminiVerifying(true);
    setGeminiResult(null);
    try {
      const r = await invokeFunction("verifyGemini", {});
      setGeminiResult(r);
      addLog(
        r.status === "READY"
          ? "Gemini Ready — ยิง request จริงผ่าน"
          : "Gemini: " + r.status + (r.message ? " — " + r.message : "")
      );
    } catch (e) {
      setGeminiResult({ status: "ERROR", message: "เรียกใช้งานไม่สำเร็จ" });
    } finally {
      setGeminiVerifying(false);
    }
  };

  const handleStart = () => {
    if (running) return;
    setRunning(true);
    setLogs([]);
    setGeminiResult((r) => r);
    automationRef.current = startAutomation({
      onState: setUiState,
      onLog: (message) => {
        addLog(message);
        if (message && message.includes("เสร็จสมบูรณ์")) setRunning(false);
      },
    });
    // stop() from control panel flips running off immediately
    addLog("Run ID: " + automationRef.current.runId);
  };

  const handleStop = () => {
    if (automationRef.current) automationRef.current.stop();
    setRunning(false);
    addLog("หยุดการทำงานตามคำขอ");
  };

  const handleReset = () => {
    if (automationRef.current) automationRef.current.stop();
    setRunning(false);
    setUiState("IDLE");
    setLogs([]);
  };

  const kbTotal = knowledge ? knowledge.total_questions : 0;
  const worker = (health && health.browser_worker) || {};
  const workerConnected = worker.reachable === true;
  const workerConfigured = !!worker.configured;
  const workerLabel = workerConnected ? "Connected" : workerConfigured ? "Unreachable" : "Disconnected";

  const done = uiState === "COMPLETED" || uiState === "NOT_FOUND" || uiState === "ERROR";

  useEffect(() => {
    if (done) setRunning(false);
  }, [done]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-md space-y-4 px-4 py-6 pb-10">
        <StatusHeader
          kb={{
            label: kbTotal > 0 ? String(kbTotal) + " ข้อ" : "ว่าง",
            tone: kbTotal > 0 ? "ready" : "pending",
          }}
          gemini={{
            label:
              geminiResult && geminiResult.status === "READY"
                ? "Ready"
                : gemini && gemini.status === "MISSING_KEY"
                  ? "ไม่มี Key"
                  : "ยังไม่ทดสอบ",
            tone:
              geminiResult && geminiResult.status === "READY"
                ? "ready"
                : gemini && gemini.status === "MISSING_KEY"
                  ? "error"
                  : "pending",
          }}
          browser={{
            label: workerLabel,
            tone: workerConnected ? "ready" : "error",
          }}
        />
        <KnowledgeCard knowledge={knowledge} />
        <ControlPanel
          uiState={uiState}
          running={running}
          onStart={handleStart}
          onStop={handleStop}
          onReset={handleReset}
        />
        <GeminiCard
          gemini={gemini}
          verifying={geminiVerifying}
          result={geminiResult}
          onVerify={handleVerifyGemini}
        />
        <BrowserCard workerConnected={workerConnected} workerConfigured={workerConfigured} liveUrl={liveUrlRef.current} />
        <ActivityLog logs={logs} />
        <p className="pt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
          คำตอบมาจากไฟล์ Excel ของคุณเท่านั้น · ไม่พบ = หยุดทันที · ห้าม AI เดาเด็ดขาด
        </p>
      </div>
    </div>
  );
}
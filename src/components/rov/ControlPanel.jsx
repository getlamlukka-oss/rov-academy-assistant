import React from "react";
import { Play, Square, RotateCcw, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  { key: "queue", label: "เข้าคิว" },
  { key: "login", label: "Login" },
  { key: "quiz", label: "ทำแบบทดสอบ" },
  { key: "done", label: "เสร็จ" },
];

const STATE_STYLES = {
  IDLE: "border-border bg-secondary text-muted-foreground",
  CREATING_SESSION: "border-accent/50 bg-accent/10 text-accent",
  WAITING_LOGIN: "border-amber-500/50 bg-amber-500/10 text-amber-400",
  LOGGED_IN: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  READING_QUESTION: "border-accent/50 bg-accent/10 text-accent",
  MATCHING: "border-accent/50 bg-accent/10 text-accent",
  ANSWER_FOUND: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  SELECTING: "border-primary/50 bg-primary/10 text-primary",
  NEXT_QUESTION: "border-primary/50 bg-primary/10 text-primary",
  NOT_FOUND: "border-red-500/50 bg-red-500/10 text-red-400",
  COMPLETED: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  ERROR: "border-red-500/50 bg-red-500/10 text-red-400",
};

function stepIndex(state) {
  if (state === "CREATING_SESSION") return 0;
  if (state === "WAITING_LOGIN") return 1;
  if (["LOGGED_IN", "READING_QUESTION", "MATCHING", "ANSWER_FOUND", "SELECTING", "NEXT_QUESTION"].includes(state))
    return 2;
  if (state === "COMPLETED") return 4;
  return -1;
}

export default function ControlPanel({ uiState, running, onStart, onStop, onReset }) {
  const idx = stepIndex(uiState);
  return (
    <section className="rounded-2xl border border-border bg-card p-5 card-glow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-sm font-semibold text-foreground">สถานะการทำงาน</h2>
        </div>
        <span
          className={
            "rounded-full border px-2.5 py-0.5 font-mono text-xs font-medium " +
            (STATE_STYLES[uiState] || STATE_STYLES.IDLE)
          }
        >
          {uiState}
        </span>
      </div>

      {/* progress */}
      <div className="mt-5 flex items-center justify-between">
        {STEPS.map((step, i) => {
          const active = idx >= i;
          const current = idx === i;
          return (
            <div key={step.key} className="flex items-center">
              {i > 0 && (
                <div
                  className={"h-0.5 w-7 sm:w-10 " + (idx >= i ? "bg-primary" : "bg-border")}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={
                    "flex h-7 w-7 items-center justify-center rounded-full border font-mono text-xs " +
                    (current
                      ? "border-primary bg-primary/20 text-primary"
                      : active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary text-muted-foreground")
                  }
                >
                  {idx > i ? "✓" : i + 1}
                </div>
                <span
                  className={
                    "text-[10px] " + (active ? "text-foreground" : "text-muted-foreground")
                  }
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-2.5">
        <Button
          onClick={onStart}
          disabled={running}
          className="w-full bg-primary font-heading text-primary-foreground hover:bg-primary/90"
        >
          <Play className="mr-2 h-4 w-4" /> เริ่มตอบคำถาม
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          <Button
            onClick={onStop}
            disabled={!running}
            variant="outline"
            className="border-red-500/40 bg-red-500/10 font-heading text-red-400 hover:bg-red-500/20 hover:text-red-400"
          >
            <Square className="mr-2 h-4 w-4" /> หยุด
          </Button>
          <Button onClick={onReset} variant="outline" className="font-heading">
            <RotateCcw className="mr-2 h-4 w-4" /> ตอบใหม่
          </Button>
        </div>
      </div>
    </section>
  );
}
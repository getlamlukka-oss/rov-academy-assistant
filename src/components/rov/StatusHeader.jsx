import React from "react";
import { Gamepad2, BookOpen, Sparkles, Globe } from "lucide-react";

const TONES = {
  ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  error: "border-red-500/40 bg-red-500/10 text-red-400",
  neutral: "border-border bg-secondary text-muted-foreground",
};

export default function StatusHeader({ kb, gemini, browser }) {
  return (
    <header className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/40 bg-primary/15 text-primary card-glow">
          <Gamepad2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-heading text-xl font-semibold leading-tight text-foreground">
            RoV Academy Assistant
          </h1>
          <p className="text-xs text-muted-foreground">
            ผู้ช่วยตอบแบบทดสอบจากฐานคำตอบของคุณ — ห้ามเดาเด็ดขาด
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill icon={BookOpen} label="Knowledge Base" value={kb.label} tone={kb.tone} />
        <Pill icon={Sparkles} label="Gemini" value={gemini.label} tone={gemini.tone} />
        <Pill icon={Globe} label="Browser Worker" value={browser.label} tone={browser.tone} />
      </div>
    </header>
  );
}

function Pill({ icon: Icon, label, value, tone }) {
  return (
    <div
      className={
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium " +
        (TONES[tone] || TONES.neutral)
      }
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export { TONES };
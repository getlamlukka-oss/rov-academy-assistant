import React from "react";
import { BookOpen, Layers } from "lucide-react";

export default function KnowledgeCard({ knowledge }) {
  const ready = knowledge && knowledge.status === "READY";
  return (
    <section className="rounded-2xl border border-border bg-card p-5 card-glow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-sm font-semibold text-foreground">Knowledge Base</h2>
        </div>
        <span
          className={
            "rounded-full border px-2.5 py-0.5 text-xs font-medium " +
            (ready
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/40 bg-amber-500/10 text-amber-400")
          }
        >
          {ready ? "Ready" : "ยังไม่มีข้อมูล"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat value={knowledge ? knowledge.total_questions : "—"} label="คำถามในฐาน (ข้อ)" />
        <Stat value={knowledge ? knowledge.total_chapters : "—"} label="บทเรียน (บท)" />
      </div>
      {ready && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          คำตอบทั้งหมดมาจากไฟล์ Excel ของคุณเท่านั้น (Source of Truth)
        </div>
      )}
    </section>
  );
}

function Stat({ value, label }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/40 p-3">
      <div className="font-heading text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
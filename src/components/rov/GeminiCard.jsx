import React from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GeminiCard({ gemini, verifying, result, onVerify }) {
  const status = result ? result.status : gemini ? gemini.status : "UNKNOWN";
  const message = result ? result.message : gemini ? gemini.message : "กำลังตรวจสอบ...";
  const isReady = status === "READY";
  const isError = status === "ERROR";
  const isMissing = status === "MISSING_KEY";
  return (
    <section className="rounded-2xl border border-border bg-card p-5 card-glow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="font-heading text-sm font-semibold text-foreground">Gemini Semantic Match</h2>
        </div>
        <span
          className={
            "rounded-full border px-2.5 py-0.5 text-xs font-medium " +
            (isReady
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : isError || isMissing
                ? "border-red-500/40 bg-red-500/10 text-red-400"
                : "border-amber-500/40 bg-amber-500/10 text-amber-400")
          }
        >
          {isReady ? "Gemini Ready" : isMissing ? "ไม่มี Key" : isError ? "Error" : "ยังไม่ทดสอบ"}
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {isReady
          ? "ยิง request จริงผ่านแล้ว — ใช้หา Question ID เท่านั้น ห้ามสร้างเฉลย"
          : message}
      </p>
      <Button
        onClick={onVerify}
        disabled={verifying}
        className="mt-4 w-full bg-primary font-heading text-primary-foreground hover:bg-primary/90"
      >
        {verifying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังยิง request จริง...
          </>
        ) : (
          "Verify Gemini"
        )}
      </Button>
    </section>
  );
}
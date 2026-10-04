import React from "react";
import { ScrollText } from "lucide-react";

export default function ActivityLog({ logs }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 card-glow">
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-primary" />
        <h2 className="font-heading text-sm font-semibold text-foreground">บันทึกการทำงาน</h2>
      </div>
      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            ยังไม่มีการทำงาน — กด "เริ่มตอบคำถาม" เพื่อเริ่ม
          </p>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className="flex gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2"
            >
              <span className="font-mono text-[10px] text-muted-foreground">{log.time}</span>
              <span className="text-xs leading-relaxed text-foreground">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
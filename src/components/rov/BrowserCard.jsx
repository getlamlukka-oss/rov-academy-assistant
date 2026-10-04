import React from "react";
import { Globe, ExternalLink, MonitorPlay, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BrowserCard({ workerConnected, workerConfigured, liveUrl }) {
  const label = workerConnected ? "Connected" : workerConfigured ? "Unreachable" : "Disconnected";
  return (
    <section className="rounded-2xl border border-border bg-card p-5 card-glow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="font-heading text-sm font-semibold text-foreground">Browser Worker</h2>
        </div>
        <span
          className={
            "rounded-full border px-2.5 py-0.5 text-xs font-medium " +
            (workerConnected
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/40 bg-red-500/10 text-red-400")
          }
        >
          {label}
        </span>
      </div>

      {/* Live view area - honest: shows the real worker live view only when connected */}
      <div className="mt-4 flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-center">
        {workerConnected && liveUrl ? (
          <>
            <MonitorPlay className="h-6 w-6 text-accent" />
            <p className="text-xs text-muted-foreground">Live Browser พร้อมใช้งาน</p>
          </>
        ) : (
          <>
            <MonitorPlay className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {workerConfigured
                ? "Browser Worker เชื่อมต่อไม่ได้ (Unreachable)"
                : "Browser Worker ยังไม่ได้เชื่อมต่อ"}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {workerConfigured
                ? "ตรวจสอบว่า Browser Worker (Playwright/Chromium) ของคุณกำลังรันอยู่และเปิดให้แพลตฟอร์มเข้าถึงได้"
                : "ตั้งค่า BROWSER_WORKER_URL (Playwright/Chromium worker ที่คุณรันเอง) แล้ว Live Browser จริงจะแสดงที่นี่"}
            </p>
          </>
        )}
      </div>

      <Button
        onClick={() => window.open("https://academy.rov.in.th", "_blank", "noopener")}
        variant="outline"
        className="mt-4 w-full border-primary/50 bg-primary/10 font-heading text-foreground hover:bg-primary/20"
      >
        <ExternalLink className="mr-2 h-4 w-4" /> เข้าสู่ระบบ Garena
      </Button>
      <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
        ระบบไม่เก็บ username / password / OTP / CAPTCHA — คุณ Login และยืนยันตัวเองเท่านั้น
      </div>
    </section>
  );
}
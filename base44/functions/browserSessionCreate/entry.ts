import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { workerRequest } from "../../shared/browserWorker.ts";
import { rateLimit } from "../../shared/rateLimit.ts";

// Creates a real browser session on the external Playwright/Chromium worker.
// No worker configured -> WORKER_NOT_CONFIGURED (honest, never faked).
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!rateLimit("session-create:" + user.id, 5, 60000)) {
      return Response.json({ status: "RATE_LIMITED", message: "คำขอถี่เกินไป" }, { status: 429 });
    }
    const runId = crypto.randomUUID();
    const worker = await workerRequest("/sessions", { body: { runId } });
    if (!worker.ok) {
      return Response.json(
        {
          status: worker.status,
          message: worker.message || "Browser Worker ยังไม่ได้เชื่อมต่อ",
          run_id: runId,
        },
        { status: worker.status === "WORKER_NOT_CONFIGURED" ? 503 : 502 }
      );
    }
    const sessionId = String(
      (worker.data && (worker.data.sessionId || worker.data.session_id)) || ""
    ).slice(0, 100);
    if (!sessionId) {
      return Response.json(
        { status: "WORKER_ERROR", message: "Worker ไม่ได้ส่ง sessionId กลับ" },
        { status: 502 }
      );
    }
    await base44.entities.AutomationRun.create({
      run_id: runId,
      state: "CREATING_SESSION",
      answered_count: 0,
      last_result: "สร้างเซสชันกับ Browser Worker สำเร็จ",
    });
    return Response.json({
      status: "OK",
      run_id: runId,
      sessionId,
      live_url: (worker.data && (worker.data.liveUrl || worker.data.live_url)) || null,
      state: "WAITING_LOGIN",
    });
  } catch (error) {
    return Response.json(
      { status: "ERROR", message: String(error.message || error).slice(0, 200) },
      { status: 500 }
    );
  }
}
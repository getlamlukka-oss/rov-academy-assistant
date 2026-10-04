import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { workerRequest } from "../../shared/browserWorker.ts";
import { rateLimit } from "../../shared/rateLimit.ts";

const ACTIONS = [
  "start",
  "stop",
  "liveView",
  "loginStatus",
  "readQuestion",
  "selectChoice",
  "nextQuestion",
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!rateLimit("browser:" + user.id, 60, 60000)) {
      return Response.json({ status: "RATE_LIMITED", message: "คำขอถี่เกินไป" }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (!ACTIONS.includes(action)) {
      return Response.json({ status: "INVALID_ACTION", message: "action ไม่ถูกต้อง" }, { status: 400 });
    }
    const sessionId = String(body.sessionId || "").slice(0, 100);
    const runId = String(body.runId || "").slice(0, 100);
    if (!sessionId || !runId) {
      return Response.json({ status: "INVALID", message: "ต้องมี sessionId และ runId" }, { status: 400 });
    }
    const runs = await base44.entities.AutomationRun.filter({ run_id: runId }, "-updated_date", 5);
    const run = runs && runs.length ? runs[0] : null;

    const paramStr = (name, max) =>
      body.params && body.params[name] !== undefined
        ? String(body.params[name]).slice(0, max)
        : undefined;

    let path = "/sessions/" + sessionId;
    let method = "POST";
    let payload = {};
    if (action === "start") {
      path += "/start";
    } else if (action === "stop") {
      path += "/stop";
    } else if (action === "liveView") {
      path += "/live";
      method = "GET";
    } else if (action === "loginStatus") {
      path += "/login-status";
      method = "GET";
    } else if (action === "readQuestion") {
      path += "/question";
      method = "GET";
    } else if (action === "nextQuestion") {
      path += "/next";
    } else if (action === "selectChoice") {
      path += "/select";
      const fingerprint = paramStr("fingerprint", 128);
      // stale protection: reject old answer if the screen has already moved to a new question
      if (run && fingerprint && run.last_fingerprint !== fingerprint) {
        return Response.json({
          status: "STALE_FINGERPRINT",
          message: "หน้าจอเปลี่ยนข้อแล้ว - ยกเลิกการเลือกคำตอบเก่า",
        });
      }
      payload = {
        choice_number: Number(body.params && body.params.choice_number) || 0,
        fingerprint,
        question_id: paramStr("question_id", 100),
      };
    }

    const worker = await workerRequest(path, {
      method,
      body: method === "GET" ? undefined : payload,
    });
    if (!worker.ok) {
      return Response.json(
        { status: worker.status, message: worker.message },
        { status: worker.status === "WORKER_NOT_CONFIGURED" ? 503 : 502 }
      );
    }

    let newState = null;
    if (action === "start") newState = "WAITING_LOGIN";
    else if (action === "stop") newState = worker.data && worker.data.completed ? "COMPLETED" : "STOPPED";
    else if (action === "loginStatus") newState = worker.data && worker.data.loggedIn ? "LOGGED_IN" : null;
    else if (action === "readQuestion") newState = "READING_QUESTION";
    else if (action === "selectChoice") newState = "SELECTING";
    else if (action === "nextQuestion") newState = "NEXT_QUESTION";
    if (newState && run) {
      await base44.entities.AutomationRun.update(run.id, {
        state: newState,
        last_result: action + " ok",
      });
    }
    return Response.json({ status: "OK", run_state: newState, data: worker.data || {} });
  } catch (error) {
    return Response.json(
      { status: "ERROR", message: String(error.message || error).slice(0, 200) },
      { status: 500 }
    );
  }
}
import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { getGeminiKey } from "../../shared/gemini.ts";
import { workerRequest, getWorkerConfig } from "../../shared/browserWorker.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const questions = await base44.entities.Question.list("created_date", 500);
    const worker = getWorkerConfig();
    // real reachability check - WORKER_ERROR (e.g. 404) still means the host is reachable
    let reachable = null;
    if (worker.url) {
      const ping = await workerRequest("/health", { method: "GET", timeoutMs: 5000 });
      reachable = ping.ok || ping.status === "WORKER_ERROR";
    }
    return Response.json({
      status: "ok",
      app: "RoV Academy Assistant",
      time: new Date().toISOString(),
      knowledge_base: { total_questions: questions.length, ready: questions.length > 0 },
      gemini: { configured: !!getGeminiKey() },
      browser_worker: { configured: !!worker.url, reachable },
    });
  } catch (error) {
    return Response.json(
      { status: "ERROR", message: String(error.message || error).slice(0, 200) },
      { status: 500 }
    );
  }
}
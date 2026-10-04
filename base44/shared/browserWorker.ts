// Browser Worker adapter (Playwright/Chromium worker runs OUTSIDE this platform).
// If BROWSER_WORKER_URL secret is not set -> WORKER_NOT_CONFIGURED (never fake a connection).
import { secrets } from "base44:runtime";

export function getWorkerConfig() {
  const url = (secrets.get("BROWSER_WORKER_URL") || "").trim();
  const token = (secrets.get("BROWSER_WORKER_TOKEN") || "").trim();
  return { url, token };
}

function sanitizeWorkerMessage(message, token) {
  let msg = String(message || "").slice(0, 200);
  if (token) msg = msg.split(token).join("***");
  return msg;
}

export async function workerRequest(path, options) {
  const opts = options || {};
  const method = opts.method || "POST";
  const timeoutMs = opts.timeoutMs || 30000;
  const { url, token } = getWorkerConfig();
  if (!url) {
    return {
      ok: false,
      status: "WORKER_NOT_CONFIGURED",
      message: "Browser Worker ยังไม่ได้เชื่อมต่อ (ยังไม่ได้ตั้งค่า BROWSER_WORKER_URL)",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.replace(/\/+$/, "") + path, {
      method,
      headers: Object.assign(
        { "Content-Type": "application/json" },
        token ? { Authorization: "Bearer " + token } : {}
      ),
      body: method === "GET" ? undefined : JSON.stringify(opts.body || {}),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const raw = (data && (data.error || data.message)) || "HTTP " + res.status;
      return { ok: false, status: "WORKER_ERROR", message: sanitizeWorkerMessage(raw, token) };
    }
    return { ok: true, data };
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    return {
      ok: false,
      status: "WORKER_UNREACHABLE",
      message: aborted ? "หมดเวลาเชื่อมต่อ Browser Worker" : "เชื่อมต่อ Browser Worker ไม่ได้",
    };
  } finally {
    clearTimeout(timer);
  }
}
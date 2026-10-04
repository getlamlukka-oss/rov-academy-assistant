// Gemini REST client - server-side only. Key never in URL, logs or responses.
import { secrets } from "base44:runtime";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function getGeminiKey() {
  return (secrets.get("GEMINI_API_KEY") || "").trim();
}

export async function callGeminiJson(prompt, options) {
  const opts = options || {};
  const model = opts.model || "gemini-3.8-flash";
  const timeoutMs = opts.timeoutMs || 15000;
  const maxOutputTokens = opts.maxOutputTokens || 1024;
  const key = getGeminiKey();
  if (!key) return { ok: false, status: "MISSING_KEY", message: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(GEMINI_ENDPOINT + "/" + model + ":generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          response_mime_type: "application/json",
          maxOutputTokens: maxOutputTokens,
        },
      }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && data.error && data.error.message ? String(data.error.message).slice(0, 200) : "HTTP " + res.status;
      return { ok: false, status: "ERROR", message: msg };
    }
    const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text) || "";
    return { ok: true, text };
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    return { ok: false, status: "ERROR", message: aborted ? "หมดเวลา (timeout) ในการเรียก Gemini" : "เชื่อมต่อ Gemini ไม่ได้" };
  } finally {
    clearTimeout(timer);
  }
}

// Tries fallback models on transient failures (high demand / deprecated / empty reply)
export async function callGeminiJsonWithFallback(prompt, options) {
  const opts = options || {};
  const models = opts.models || ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-flash-latest"];
  const errors = [];
  for (const model of models) {
    const g = await callGeminiJson(prompt, Object.assign({}, opts, { model }));
    if (g.ok && g.text) return g;
    errors.push(model + ": " + (g.message || "การตอบกลับว่าง"));
  }
  return { ok: false, status: "ERROR", message: errors.join(" | ").slice(0, 300) };
}
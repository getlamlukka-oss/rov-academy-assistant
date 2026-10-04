import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { callGeminiJsonWithFallback } from "../../shared/gemini.ts";
import { rateLimit } from "../../shared/rateLimit.ts";

// Fires ONE minimal real request to Gemini to verify the key. Never reveals the key.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!rateLimit("gemini-verify:" + user.id, 5, 60000)) {
      return Response.json({ status: "RATE_LIMITED", message: "คำขอถี่เกินไป" }, { status: 429 });
    }
    const g = await callGeminiJsonWithFallback('ตอบด้วย JSON เท่านั้น ห้ามมีคำอื่น: {"ok": true}', { maxOutputTokens: 512, timeoutMs: 20000 });
    if (g.status === "MISSING_KEY") {
      return Response.json({ status: "MISSING_KEY", message: "ยังไม่ได้ตั้งค่า GEMINI_API_KEY ใน Secrets" });
    }
    if (!g.ok) {
      return Response.json({ status: "ERROR", message: "Gemini Error: " + (g.message || "unknown") }, { status: 502 });
    }
    let parsed = null;
    try {
      parsed = JSON.parse(g.text);
    } catch (e) {
      parsed = null;
    }
    if (!parsed || parsed.ok !== true) {
      return Response.json(
        { status: "ERROR", message: "การตอบกลับจาก Gemini ไม่ถูกต้อง: " + String(g.text).slice(0, 120) },
        { status: 502 }
      );
    }
    return Response.json({ status: "READY", message: "Gemini Ready" });
  } catch (error) {
    return Response.json(
      { status: "ERROR", message: String(error.message || error).slice(0, 200) },
      { status: 500 }
    );
  }
}
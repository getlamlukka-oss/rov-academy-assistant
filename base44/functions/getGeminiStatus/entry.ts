import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { getGeminiKey } from "../../shared/gemini.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const configured = !!getGeminiKey();
    return Response.json({
      status: configured ? "CONFIGURED" : "MISSING_KEY",
      gemini: { configured },
      message: configured
        ? "ตั้งค่า key แล้ว - ยังไม่ได้ทดสอบ กดปุ่ม Verify เพื่อยิง request จริง"
        : "ยังไม่ได้ตั้งค่า GEMINI_API_KEY",
    });
  } catch (error) {
    return Response.json(
      { status: "ERROR", message: String(error.message || error).slice(0, 200) },
      { status: 500 }
    );
  }
}
import { base44 } from "@/api/base44Client";

// Wraps backend functions; surfaces function-level error payloads instead of throwing
export async function invokeFunction(name, payload) {
  try {
    const res = await base44.functions.invoke(name, payload || {});
    return res.data ?? res;
  } catch (e) {
    const data = e && e.response && e.response.data;
    if (data && data.status) return data;
    throw e;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Full automation loop: session -> wait login -> read -> match -> select -> next -> until done
export function startAutomation({ onState, onLog }) {
  const runId = crypto.randomUUID();
  let stopped = false;
  let sessionId = null;

  const control = (action, params) =>
    invokeFunction("browserSessionControl", { runId, sessionId, action, params });

  (async () => {
    try {
      onState("CREATING_SESSION");
      onLog("เข้าคิวแล้ว - กำลังสร้างเซสชันเบราว์เซอร์กับ Browser Worker...");
      const session = await invokeFunction("browserSessionCreate", {});
      if (session.status !== "OK") {
        onState("ERROR");
        onLog(session.message || "Browser Worker ยังไม่ได้เชื่อมต่อ");
        return;
      }
      sessionId = session.sessionId;
      onLog("สร้างเซสชันสำเร็จ (" + sessionId + ")");
      const start = await control("start");
      if (start.status !== "OK") {
        onState("ERROR");
        onLog(start.message || "เริ่มเซสชันไม่สำเร็จ");
        return;
      }
      onState("WAITING_LOGIN");
      onLog("รอคุณ Login Garena ในหน้าเบราว์เซอร์ (CAPTCHA / OTP / 2FA ทำเอง ระบบไม่ bypass)...");
      let loggedIn = false;
      for (let i = 0; i < 120 && !stopped; i++) {
        await wait(5000);
        const st = await control("loginStatus");
        if (st.status === "RATE_LIMITED") {
          onState("ERROR");
          onLog(st.message);
          return;
        }
        if (st.status !== "OK") {
          onState("ERROR");
          onLog(st.message || "ตรวจสถานะ Login ไม่สำเร็จ");
          return;
        }
        if (st.data && st.data.loggedIn) {
          loggedIn = true;
          break;
        }
      }
      if (stopped) return;
      if (!loggedIn) {
        onState("ERROR");
        onLog("หมดเวลารอ Login (10 นาที)");
        return;
      }
      onState("LOGGED_IN");
      onLog("Login สำเร็จ - เริ่มอ่านคำถาม");
      let answered = 0;
      while (!stopped) {
        onState("READING_QUESTION");
        const q = await control("readQuestion");
        if (q.status !== "OK") {
          onState("ERROR");
          onLog(q.message || "อ่านคำถามไม่สำเร็จ");
          return;
        }
        const qd = q.data || {};
        if (qd.completed) {
          onState("COMPLETED");
          onLog("ทำแบบทดสอบเสร็จสมบูรณ์ - ตอบไปทั้งหมด " + answered + " ข้อ");
          return;
        }
        if (!qd.question) {
          onState("ERROR");
          onLog("ไม่พบคำถามบนหน้าจอ - หยุดการทำงาน");
          return;
        }
        onState("MATCHING");
        onLog("จับคู่คำถาม: " + qd.question);
        const m = await invokeFunction("matchQuestion", {
          runId,
          question: qd.question,
          choices: qd.choices || [],
        });
        if (m.status !== "ANSWER_FOUND") {
          onState(m.status === "NOT_FOUND" ? "NOT_FOUND" : "ERROR");
          onLog(m.message || "ไม่พบคำตอบในฐานความรู้ - หยุด (ห้ามเดา)");
          return;
        }
        onState("ANSWER_FOUND");
        onLog(
          "พบคำตอบ [" + m.match_type + "] เลือกข้อ " + m.question.choice_number + ": " + m.question.answer
        );
        onState("SELECTING");
        const sel = await control("selectChoice", {
          choice_number: m.question.choice_number,
          fingerprint: m.fingerprint,
          question_id: m.question.id,
        });
        if (sel.status === "STALE_FINGERPRINT") {
          onLog(sel.message + " - อ่านข้อปัจจุบันใหม่");
          continue;
        }
        if (sel.status !== "OK") {
          onState("ERROR");
          onLog(sel.message || "เลือกคำตอบไม่สำเร็จ");
          return;
        }
        answered += 1;
        onState("NEXT_QUESTION");
        onLog("ตอบแล้ว " + answered + " ข้อ - ไปข้อถัดไป");
        const next = await control("nextQuestion");
        if (next.status !== "OK") {
          onState("ERROR");
          onLog(next.message || "ไปข้อถัดไปไม่สำเร็จ");
          return;
        }
        await wait(1500);
      }
    } catch (e) {
      onState("ERROR");
      const msg = (e && e.response && e.response.data && e.response.data.message) || (e && e.message) || "unknown";
      onLog("เกิดข้อผิดพลาด: " + msg);
    }
  })();

  return {
    runId,
    stop: () => {
      stopped = true;
      // Best-effort cleanup so a stopped UI does not leave a remote browser session running.
      if (sessionId) {
        control("stop").catch(() => {});
      }
    },
  };
}
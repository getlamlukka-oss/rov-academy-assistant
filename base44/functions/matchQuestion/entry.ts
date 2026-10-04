import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { normalizeThai, similarity, fingerprintQuestion } from "../../shared/normalize.ts";
import { callGeminiJsonWithFallback, getGeminiKey } from "../../shared/gemini.ts";
import { rateLimit } from "../../shared/rateLimit.ts";

const FUZZY_THRESHOLD = 0.8;
const GEMINI_MIN_CONFIDENCE = 0.6;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!rateLimit("match:" + user.id, 30, 60000)) {
      return Response.json({ status: "RATE_LIMITED", message: "คำขอถี่เกินไป" }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const question = typeof body.question === "string" ? body.question.slice(0, 1000) : "";
    if (!question.trim()) {
      return Response.json({ status: "INVALID", message: "ต้องมีคำถาม" }, { status: 400 });
    }
    const runId = typeof body.runId === "string" ? body.runId.slice(0, 64) : "";
    if (!runId) {
      return Response.json({ status: "INVALID", message: "ต้องมี runId" }, { status: 400 });
    }
    const choices = Array.isArray(body.choices)
      ? body.choices.slice(0, 8).map((c) => String(c).slice(0, 300))
      : [];
    const fingerprint =
      typeof body.fingerprint === "string" && body.fingerprint
        ? body.fingerprint.slice(0, 128)
        : fingerprintQuestion(question, choices);

    // ---- duplicate / stale protection via runId + fingerprint ----
    const runs = await base44.entities.AutomationRun.filter({ run_id: runId }, "-updated_date", 5);
    const run = runs && runs.length ? runs[0] : null;
    if (run && run.last_fingerprint === fingerprint) {
      if (run.matched_question_id) {
        const rec = await base44.entities.Question.get(run.matched_question_id).catch(() => null);
        if (rec) {
          return Response.json({
            status: "ANSWER_FOUND",
            match_type: "duplicate",
            duplicate: true,
            fingerprint,
            question: {
              id: rec.id,
              chapter_code: rec.chapter_code,
              chapter_name: rec.chapter_name,
              number: rec.number,
              question: rec.question,
              answer: rec.answer,
              choice_number: rec.choice_number,
              evidence: rec.evidence,
              note: rec.note,
            },
          });
        }
      }
      return Response.json({ status: "DUPLICATE_FINGERPRINT", duplicate: true, message: "คำถามนี้กำลังถูกประมวลผลแล้ว" });
    }

    // ---- load knowledge base (Excel = source of truth) ----
    const questions = await base44.entities.Question.list("created_date", 500);
    if (!questions.length) {
      return Response.json({ status: "KB_EMPTY", message: "ฐานความรู้ยังไม่มีข้อมูล" }, { status: 503 });
    }
    const normOf = (q) => q.question_normalized || normalizeThai(q.question);
    const qn = normalizeThai(question);

    // ---- level 1+2: exact normalized match (question, disambiguated by choices) ----
    let candidates = questions.filter((q) => normOf(q) === qn);
    if (candidates.length > 1 && choices.length) {
      const normChoices = choices.map((c) => normalizeThai(c));
      candidates = candidates.filter((q) => {
        const stored = normalizeThai(q.choices || "");
        return !stored || normChoices.some((c) => stored.includes(c));
      });
    }
    let matched = null;
    let matchType = null;
    if (candidates.length === 1) {
      matched = candidates[0];
      matchType = "exact";
    } else if (candidates.length > 1) {
      matched = candidates[0];
      matchType = "exact_ambiguous";
    } else {
      // ---- level 3: fuzzy ----
      let best = null;
      let bestScore = 0;
      for (const q of questions) {
        const s = similarity(qn, normOf(q));
        if (s > bestScore) {
          bestScore = s;
          best = q;
        }
      }
      if (best && bestScore >= FUZZY_THRESHOLD) {
        matched = best;
        matchType = "fuzzy";
      } else {
        // ---- level 4: Gemini semantic match (finds Question ID ONLY - never generates answers) ----
        if (!getGeminiKey()) {
          return Response.json({
            status: "NOT_FOUND",
            match_type: "none",
            message: "ไม่พบคำถามในฐานความรู้ และ Gemini ยังไม่ได้ตั้งค่า จึงไม่สามารถจับคู่เชิงความหมายได้ - หยุด (ห้ามเดาคำตอบ)",
          });
        }
        const scored = questions
          .map((q) => ({ q, s: similarity(qn, normOf(q)) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 40);
        const listText = scored
          .map(
            (item) =>
              "ID: " + (item.q.chapter_code || "?") + "#" + item.q.number + "\nคำถาม: " + item.q.question
          )
          .join("\n---\n");
        const prompt =
          "คุณคือระบบจับคู่คำถาม ห้ามตอบคำถาม ห้ามสร้างเฉลย หน้าที่เดียวคือหา ID ของคำถามในฐานข้อมูลที่ตรงกับคำถามที่ถาม\n\n" +
          "คำถามที่ถาม:\n" + question + "\n\n" +
          "ตัวเลือกที่พบบนหน้าจอ:\n" + (choices.join("\n") || "(ไม่มี)") + "\n\n" +
          "รายการคำถามในฐานความรู้:\n" + listText + "\n\n" +
          'ตอบเป็น JSON เท่านั้น: {"id": "<ID ที่ตรงกัน หรือ NOT_FOUND>", "confidence": <0-1>}';
        const g = await callGeminiJsonWithFallback(prompt);
        if (!g.ok) {
          return Response.json({
            status: "NOT_FOUND",
            match_type: "gemini_error",
            message: "การจับคู่เชิงความหมายล้มเหลว (" + g.message + ") - หยุด ห้ามเดา",
          });
        }
        let parsed = null;
        try {
          parsed = JSON.parse(g.text);
        } catch (e) {
          parsed = null;
        }
        if (
          parsed &&
          parsed.id &&
          parsed.id !== "NOT_FOUND" &&
          typeof parsed.confidence === "number" &&
          parsed.confidence >= GEMINI_MIN_CONFIDENCE
        ) {
          const parts = String(parsed.id).split("#");
          const found = questions.find(
            (q) => q.chapter_code === parts[0] && String(q.number) === String(parts[1])
          );
          if (found) {
            matched = found;
            matchType = "gemini";
          }
        }
        if (!matched) {
          return Response.json({
            status: "NOT_FOUND",
            match_type: "none",
            message: "ไม่พบคำถามนี้ในฐานความรู้ - หยุดการทำงาน (ห้ามเดาคำตอบ)",
          });
        }
      }
    }

    // ---- record fingerprint + matched id BEFORE returning the answer (stale protection) ----
    const runFields = {
      run_id: runId,
      state: "ANSWER_FOUND",
      last_fingerprint: fingerprint,
      matched_question_id: matched.id,
      last_result: "matched " + matched.chapter_code + "#" + matched.number + " via " + matchType,
    };
    if (run) {
      await base44.entities.AutomationRun.update(run.id, runFields);
    } else {
      await base44.entities.AutomationRun.create(runFields);
    }

    return Response.json({
      status: "ANSWER_FOUND",
      match_type: matchType,
      duplicate: false,
      fingerprint,
      question: {
        id: matched.id,
        chapter_code: matched.chapter_code,
        chapter_name: matched.chapter_name,
        number: matched.number,
        question: matched.question,
        answer: matched.answer,
        choice_number: matched.choice_number,
        evidence: matched.evidence,
        note: matched.note,
      },
    });
  } catch (error) {
    return Response.json(
      { status: "ERROR", message: String(error.message || error).slice(0, 200) },
      { status: 500 }
    );
  }
}
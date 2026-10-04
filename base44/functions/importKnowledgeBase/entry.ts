import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import * as XLSX from "npm:xlsx@0.18.5";
import { normalizeThai } from "../../shared/normalize.ts";

// Deterministic Excel import (SheetJS) - reads the real workbook structure:
// Sheet "คำตอบ": รหัสบท/บท/ข้อ/คำถาม/คำตอบที่เสนอ/ตัวเลือก/หลักฐาน/หมายเหตุ
// Sheet "โจทย์ต้นฉบับ": รหัสบท/บท/ข้อ/คำถาม/ตัวเลือก 1-4/แหล่งบทเรียน (merged into choices + evidence)
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") {
      return Response.json({ error: "Forbidden - admin only" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const fileUrl = String(body.fileUrl || "");
    if (!/^https:\/\/[\w.-]+/i.test(fileUrl)) {
      return Response.json({ status: "INVALID", message: "fileUrl ไม่ถูกต้อง" }, { status: 400 });
    }
    const replace = body.replace === true;

    // fetch the real file bytes
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return Response.json({ status: "IMPORT_FAILED", message: "ดาวน์โหลดไฟล์ไม่สำเร็จ (HTTP " + fileRes.status + ")" }, { status: 422 });
    }
    const buf = new Uint8Array(await fileRes.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });

    const rowsByHeader = (sheetName) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return [];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
      // find the header row (contains "รหัสบท")
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        if (rows[i].some((c) => String(c).trim() === "รหัสบท")) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) return [];
      const headers = rows[headerIdx].map((c) => String(c).trim());
      const col = (name) => headers.indexOf(name);
      const out = [];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const get = (name) => {
          const idx = col(name);
          return idx >= 0 ? String(r[idx] === undefined ? "" : r[idx]).trim() : "";
        };
        out.push({ get, raw: r });
      }
      return out;
    };

    // ---- sheet 2: original questions with the 4 choices + source url, keyed by รหัสบท#ข้อ
    const originals = {};
    for (const row of rowsByHeader("โจทย์ต้นฉบับ")) {
      const code = row.get("รหัสบท");
      const num = row.get("ข้อ");
      if (!code || !num) continue;
      const choices = [];
      for (const h of ["ตัวเลือก 1", "ตัวเลือก 2", "ตัวเลือก 3", "ตัวเลือก 4"]) {
        const v = row.get(h);
        if (v) choices.push(v);
      }
      originals[code + "#" + num] = {
        choices,
        source: row.get("แหล่งบทเรียน"),
      };
    }

    // ---- sheet 1: answers (source of truth)
    const seen = new Set();
    const rows = [];
    for (const row of rowsByHeader("คำตอบ")) {
      const question = row.get("คำถาม");
      const answer = row.get("คำตอบที่เสนอ");
      if (!question || !answer) continue;
      const code = row.get("รหัสบท");
      const num = row.get("ข้อ");
      const key = code + "#" + num;
      if (seen.has(key)) continue;
      seen.add(key);
      const orig = originals[key];
      const choiceNumber = parseInt(row.get("ตัวเลือก"), 10);
      rows.push({
        chapter_code: code.slice(0, 40),
        chapter_name: row.get("บท").slice(0, 200),
        number: parseInt(num, 10) || 0,
        question: question.slice(0, 1000),
        question_normalized: normalizeThai(question),
        answer: answer.slice(0, 1000),
        choice_number: Number.isFinite(choiceNumber) ? choiceNumber : null,
        choices: orig && orig.choices.length
          ? orig.choices.map((c, i) => i + 1 + ". " + c).join("\n").slice(0, 2000)
          : "",
        evidence: [row.get("หลักฐาน"), orig && orig.source].filter(Boolean).join(" | ").slice(0, 500),
        note: row.get("หมายเหตุ").slice(0, 500),
      });
    }
    if (!rows.length) {
      return Response.json({ status: "IMPORT_FAILED", message: "ไม่พบข้อมูลคำถามในไฟล์ (ตรวจชื่อชีต/หัวคอลัมน์)" }, { status: 422 });
    }

    if (replace) {
      await base44.entities.Question.deleteMany({});
    }
    for (let i = 0; i < rows.length; i += 100) {
      await base44.entities.Question.bulkCreate(rows.slice(i, i + 100));
    }
    const withChoices = rows.filter((r) => r.choices).length;
    return Response.json({
      status: "IMPORTED",
      imported: rows.length,
      with_choices: withChoices,
      skipped_duplicates: seen.size - rows.length,
    });
  } catch (error) {
    return Response.json(
      { status: "ERROR", message: String(error.message || error).slice(0, 300) },
      { status: 500 }
    );
  }
}
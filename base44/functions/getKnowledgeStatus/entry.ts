import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const questions = await base44.entities.Question.list("created_date", 500);
    const chapters = {};
    for (const q of questions) {
      const code = q.chapter_code || "?";
      if (!chapters[code]) {
        chapters[code] = { chapter_code: code, chapter_name: q.chapter_name || "", count: 0 };
      }
      chapters[code].count += 1;
    }
    return Response.json({
      status: questions.length > 0 ? "READY" : "EMPTY",
      total_questions: questions.length,
      total_chapters: Object.keys(chapters).length,
      chapters: Object.values(chapters),
    });
  } catch (error) {
    return Response.json(
      { status: "ERROR", message: String(error.message || error).slice(0, 200) },
      { status: 500 }
    );
  }
}
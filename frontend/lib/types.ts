// ประเภทข้อมูลที่ใช้ร่วมกับ FastAPI
export type User = {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  created_at: string;
};
export type Question = {
  id: number;
  chapter_id: number;
  chapter_name: string;
  no: number;
  question: string;
  options: string[];
  answer_text: string;
  answer_idx: number;
  source_type: string;
  note: string;
  source_url: string;
  verified: boolean;
};
export type PublicQuestion = Omit<
  Question,
  "answer_text" | "answer_idx" | "note" | "source_url"
>;
export type Chapter = {
  chapter_id: number;
  chapter_name: string;
  total: number;
  verified: number;
  ambiguous: number;
  analyzed: number;
  reference: number;
};
export type Stats = {
  total: number;
  chapters: number;
  verified: number;
  ambiguous: number;
  analyzed: number;
  reference: number;
  quiz_played: number;
  quiz_average: number;
};
export type BotRun = {
  id: number;
  task_id: string;
  chapters: number[];
  status: string;
  started_at: string;
  finished_at: string | null;
  result: {
    mode?: string;
    submitted?: number;
    error?: string;
    message?: string;
    session_saved?: boolean;
  };
  started_by: number;
};
export type AnswerResult = {
  question_id: number;
  selected_idx: number | null;
  correct: boolean;
  answer_idx: number;
  answer_text: string;
  note: string;
  source_type: string;
  verified: boolean;
};
export type Summary = {
  session_id: string;
  score: number;
  total: number;
  answered: number;
  finished: boolean;
  wrong_answers: (Question & {
    selected_idx: number | null;
    unanswered: boolean;
  })[];
};
export type Log = {
  id: string;
  type: string;
  time: string;
  level: string;
  message: string;
};
export const statusLabels: Record<string, string> = {
  verified: "ผ่านแล้ว",
  ambiguous: "กำกวม",
  analyzed: "วิเคราะห์",
  reference: "อ้างอิงบทเรียน",
  queued: "รอคิว",
  running: "กำลังทำงาน",
  stopping: "กำลังหยุด",
  success: "สำเร็จ",
  failed: "ล้มเหลว",
  cancelled: "ยกเลิก",
};
export function statusOf(q: Question) {
  return q.verified
    ? "verified"
    : q.source_type === "กำกวม"
      ? "ambiguous"
      : q.source_type === "วิเคราะห์จากบทเรียน"
        ? "analyzed"
        : "reference";
}

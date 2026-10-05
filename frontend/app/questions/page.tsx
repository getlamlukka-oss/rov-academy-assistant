"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Search,
  BookOpen,
  CheckCheck,
  Pencil,
  ExternalLink,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { Question, Chapter, statusOf, statusLabels } from "@/lib/types";
import { useUser } from "@/components/shell";
import {
  PageTitle,
  ErrorBox,
  Loading,
  Empty,
  Badge,
  Modal,
} from "@/components/ui";
// ตารางกรองตามบท/สถานะและ popup สำหรับ admin แก้เฉลย
export default function QuestionsPage() {
  const user = useUser();
  const [rows, setRows] = useState<Question[]>([]),
    [chapters, setChapters] = useState<Chapter[]>([]),
    [chapter, setChapter] = useState(""),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Question | null>(null),
    [editing, setEditing] = useState(false),
    [index, setIndex] = useState(0),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [modalError, setModalError] = useState("");
  const close = useCallback(() => {
    setSelected(null);
    setEditing(false);
    setModalError("");
  }, []);
  useEffect(() => {
    setChapter(
      new URLSearchParams(window.location.search).get("chapter") || "",
    );
    api<Chapter[]>("/stats/chapters")
      .then(setChapters)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      setPage(0);
      const params = new URLSearchParams();
      if (chapter) params.set("chapter", chapter);
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      api<Question[]>(`/questions/?${params}`, { signal: controller.signal })
        .then(setRows)
        .catch((e) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [chapter, status, search]);
  function open(q: Question) {
    setSelected(q);
    setIndex(q.answer_idx);
    setNote(q.note);
    setEditing(false);
    setModalError("");
  }
  async function change(action: "save" | "verify" | "delete") {
    if (!selected) return;
    if (action === "delete" && !window.confirm("ลบข้อนี้ออกจากคลังข้อสอบ?"))
      return;
    setBusy(true);
    setModalError("");
    try {
      if (action === "delete") {
        await api(`/questions/${selected.id}`, { method: "DELETE" });
        setRows((old) => old.filter((q) => q.id !== selected.id));
        close();
      } else {
        const updated = await api<Question>(
          `/questions/${selected.id}${action === "verify" ? "/verify" : ""}`,
          {
            method: action === "verify" ? "PATCH" : "PUT",
            body:
              action === "save"
                ? JSON.stringify({ answer_idx: index, note })
                : undefined,
          },
        );
        setSelected(updated);
        setRows((old) => old.map((q) => (q.id === updated.id ? updated : q)));
        setEditing(false);
      }
    } catch (e) {
      setModalError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter((q) => !status || statusOf(q) === status),
    pages = Math.max(1, Math.ceil(visible.length / 15));
  return (
    <>
      <PageTitle
        eyebrow="QUESTION LIBRARY"
        title="คลังข้อสอบ"
        description="ทบทวนโจทย์ ตัวเลือก และคำตอบ พร้อมหลักฐานจากบทเรียน"
        action={
          <span className="btn">
            <BookOpen size={16} />
            {rows.length} ข้อในรายการ
          </span>
        }
      />
      <ErrorBox message={error} />
      <section className="panel">
        <div className="p-5 grid sm:grid-cols-[1fr_170px_165px] gap-3">
          <div className="relative">
            <Search size={17} className="absolute left-3 top-3.5 text-muted" />
            <input
              aria-label="ค้นหาข้อสอบ"
              className="input pl-10"
              placeholder="ค้นหาข้อความในโจทย์…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="เลือกบท"
            className="input"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
          >
            <option value="">ทุกบทเรียน</option>
            {chapters.map((c) => (
              <option key={c.chapter_id} value={c.chapter_id}>
                {c.chapter_id} · {c.chapter_name}
              </option>
            ))}
          </select>
          <select
            aria-label="เลือกสถานะ"
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">ทุกสถานะ</option>
            {["verified", "ambiguous", "analyzed", "reference"].map((s) => (
              <option key={s} value={s}>
                {statusLabels[s]}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <Loading />
        ) : visible.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>บทเรียน / ข้อ</th>
                  <th>คำถาม</th>
                  <th>คำตอบที่เสนอ</th>
                  <th>สถานะ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.slice(page * 15, (page + 1) * 15).map((q) => (
                  <tr
                    key={q.id}
                    className="cursor-pointer"
                    onClick={() => open(q)}
                  >
                    <td className="min-w-[130px]">
                      <span className="text-muted text-[10px]">
                        บท {q.chapter_id} · ข้อ {q.no}
                      </span>
                      <p className="mt-1.5">{q.chapter_name}</p>
                    </td>
                    <td className="min-w-[240px] max-w-[420px] leading-6">
                      {q.question}
                    </td>
                    <td className="min-w-[180px] max-w-[280px] text-muted leading-6">
                      {q.answer_idx + 1}. {q.answer_text}
                    </td>
                    <td>
                      <Badge status={statusOf(q)} />
                    </td>
                    <td>
                      <button
                        aria-label={`ดูบท ${q.chapter_id} ข้อ ${q.no}`}
                        className="icon-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          open(q);
                        }}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="ไม่พบข้อสอบตามเงื่อนไขที่เลือก" />
        )}
        <div className="border-t border-slate-700 p-4 flex justify-between items-center">
          <span className="text-[11px] text-muted">
            {visible.length} ข้อ · หน้า {page + 1} / {pages}
          </span>
          <div className="flex gap-2">
            <button
              aria-label="หน้าก่อนหน้า"
              disabled={page === 0}
              className="btn btn-sm"
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="หน้าถัดไป"
              disabled={page + 1 >= pages}
              className="btn btn-sm"
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
      {selected && (
        <Modal
          title={`บท ${selected.chapter_id} · ${selected.chapter_name} · ข้อ ${selected.no}`}
          onClose={close}
        >
          <ErrorBox message={modalError} />
          <div className="flex gap-2 mb-5">
            <Badge status={statusOf(selected)} />
            <span className="text-muted text-xs py-1">
              {selected.source_type}
            </span>
          </div>
          <h3 className="text-lg leading-8 font-bold mb-5">
            {selected.question}
          </h3>
          <div className="space-y-3">
            {selected.options.map((option, i) => (
              <button
                key={i}
                disabled={!editing || busy}
                onClick={() => setIndex(i)}
                className={`option ${i === (editing ? index : selected.answer_idx) ? "correct" : ""}`}
              >
                <span className="option-letter">{i + 1}</span>
                <span>{option}</span>
                {i === (editing ? index : selected.answer_idx) && (
                  <CheckCheck
                    className="ml-auto text-cyan shrink-0"
                    size={19}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="mt-5">
            <label className="field-label">หมายเหตุ / หลักฐาน</label>
            {editing ? (
              <textarea
                className="input min-h-24"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={10000}
              />
            ) : (
              <p className="text-xs text-muted leading-7 bg-ink p-4 rounded-lg">
                {selected.note || "ไม่มีหมายเหตุเพิ่มเติม"}
              </p>
            )}
          </div>
          {selected.source_url && (
            <a
              className="flex items-center gap-2 text-cyan text-xs mt-4"
              target="_blank"
              rel="noopener noreferrer"
              href={selected.source_url}
            >
              ดูบทเรียนต้นฉบับ
              <ExternalLink size={13} />
            </a>
          )}
          {user?.is_admin && (
            <div className="flex flex-wrap gap-2 mt-7 pt-5 border-t border-slate-700">
              {editing ? (
                <>
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => change("save")}
                  >
                    บันทึกคำตอบ
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => setEditing(false)}
                  >
                    ยกเลิก
                  </button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => setEditing(true)}>
                    <Pencil size={15} />
                    แก้ไข
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={busy || selected.verified}
                    onClick={() => change("verify")}
                  >
                    <CheckCheck size={15} />
                    ตรวจสอบแล้ว
                  </button>
                  <button
                    className="btn btn-danger ml-auto"
                    disabled={busy}
                    onClick={() => change("delete")}
                  >
                    <Trash2 size={14} />
                    ลบ
                  </button>
                </>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

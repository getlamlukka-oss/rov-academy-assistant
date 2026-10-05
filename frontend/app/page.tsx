"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BookOpen,
  ShieldCheck,
  CircleHelp,
  Layers3,
  ArrowRight,
  Swords,
  Bot,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { api, errorMessage } from "@/lib/api";
import { Stats, Chapter } from "@/lib/types";
import { useUser } from "@/components/shell";
import { PageTitle, ErrorBox, Loading, Empty } from "@/components/ui";
// Dashboard ใช้ตัวเลขจาก API ไม่ hardcode จำนวนข้อ
export default function Dashboard() {
  const user = useUser();
  const [stats, setStats] = useState<Stats | null>(null),
    [chapters, setChapters] = useState<Chapter[]>([]),
    [error, setError] = useState(""),
    [all, setAll] = useState(false);
  useEffect(() => {
    Promise.all([api<Stats>("/stats/"), api<Chapter[]>("/stats/chapters")])
      .then(([s, c]) => {
        setStats(s);
        setChapters(c);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const colors = ["#4fe0d2", "#7399ed", "#efbf65", "#fb8798"];
  const chart = stats
    ? [
        { name: "ผ่านแล้ว", value: stats.verified },
        { name: "อ้างอิงบทเรียน", value: stats.reference },
        { name: "วิเคราะห์", value: stats.analyzed },
        { name: "กำกวม", value: stats.ambiguous },
      ]
    : [];
  return (
    <>
      <PageTitle
        eyebrow="ACADEMY OVERVIEW"
        title="ภาพรวมการเรียนรู้"
        description={`สวัสดี ${user?.username || ""} พร้อมเพิ่มเลเวลความรู้ RoV ของคุณแล้วหรือยัง?`}
        action={
          <Link className="btn btn-primary" href="/quiz">
            <Swords size={16} />
            เริ่มฝึกทำควิซ
            <ArrowRight size={15} />
          </Link>
        }
      />
      <ErrorBox message={error} />
      {!stats && !error ? (
        <Loading />
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              {[
                {
                  label: "ข้อสอบทั้งหมด",
                  value: stats.total,
                  icon: BookOpen,
                  caption: "รวมทุกข้อในคลังข้อสอบ",
                  color: "text-cyan",
                },
                {
                  label: "ผ่านระบบแล้ว",
                  value: stats.verified,
                  icon: ShieldCheck,
                  caption: `${stats.total ? Math.round((stats.verified / stats.total) * 100) : 0}% ของข้อสอบทั้งหมด`,
                  color: "text-cyan",
                },
                {
                  label: "ข้อที่กำกวม",
                  value: stats.ambiguous,
                  icon: CircleHelp,
                  caption: "รอการตรวจสอบคำตอบ",
                  color: "text-amber-300",
                },
                {
                  label: "บทเรียนทั้งหมด",
                  value: stats.chapters,
                  icon: Layers3,
                  caption: "เรียนรู้ตั้งแต่พื้นฐานถึงฮีโร่",
                  color: "text-blue-300",
                },
              ].map((m) => (
                <div key={m.label} className="metric-card">
                  <div className="flex justify-between items-center gap-2">
                    <span className="metric-label">{m.label}</span>
                    <span className={`metric-icon ${m.color}`}>
                      <m.icon size={18} />
                    </span>
                  </div>
                  <p className="metric-value">
                    {m.value}
                    <span className="text-xs text-muted font-normal tracking-normal ml-2">
                      {m.label === "บทเรียนทั้งหมด" ? "บท" : "ข้อ"}
                    </span>
                  </p>
                  <p className="metric-caption">{m.caption}</p>
                </div>
              ))}
            </div>
            <div className="grid xl:grid-cols-[1.65fr_1fr] gap-6 mb-6">
              <div className="hero flex flex-col justify-between">
                <div>
                  <span className="badge badge-verified mb-4">
                    PRACTICE MAKES PROGRESS
                  </span>
                  <h2>
                    จากความรู้ในบทเรียน
                    <br />
                    สู่ความมั่นใจในสนามจริง
                  </h2>
                  <p>
                    สุ่มโจทย์จากบทที่คุณสนใจ ทดสอบความเข้าใจ
                    <br className="hidden sm:inline" />
                    พร้อมเฉลยและหมายเหตุหลังตอบแต่ละข้อ
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 relative z-10">
                  <Link className="btn btn-primary" href="/quiz">
                    ฝึกทำควิซ
                    <ArrowRight size={15} />
                  </Link>
                  <Link className="btn" href="/questions">
                    สำรวจคลังข้อสอบ
                    <BookOpen size={15} />
                  </Link>
                </div>
              </div>
              <div className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>สถานะข้อสอบ</h2>
                    <p>คุณภาพคำตอบในคลังทั้งหมด</p>
                  </div>
                  <span className="text-muted text-xs">{stats.total} ข้อ</span>
                </div>
                <div className="flex items-center justify-center gap-3 px-5 py-5">
                  <div className="relative w-[150px] h-[155px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          isAnimationActive={false}
                          data={chart}
                          dataKey="value"
                          innerRadius={51}
                          outerRadius={66}
                          stroke="none"
                          paddingAngle={3}
                        >
                          {chart.map((_, i) => (
                            <Cell key={i} fill={colors[i]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#13202e",
                            border: "1px solid #435264",
                            borderRadius: 8,
                            color: "#fff",
                          }}
                          itemStyle={{ color: "#fff" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <strong className="text-2xl">{stats.total}</strong>
                      <span className="text-[10px] text-muted">ข้อสอบ</span>
                    </div>
                  </div>
                  <div className="space-y-3 flex-1">
                    {chart.map((item, i) => (
                      <div
                        key={item.name}
                        className="flex items-center gap-2 text-[11px]"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: colors[i] }}
                        />
                        <span className="text-muted flex-1">{item.name}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid xl:grid-cols-[1.65fr_1fr] gap-6">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>บทเรียนใน Academy</h2>
                    <p>ภาพรวมข้อสอบและความคืบหน้าการตรวจสอบ</p>
                  </div>
                  <Link
                    href="/questions"
                    className="text-cyan text-[11px] flex gap-1 items-center"
                  >
                    ดูข้อสอบ
                    <ChevronRight size={14} />
                  </Link>
                </div>
                {!chapters.length ? (
                  <Empty text="ยังไม่มีข้อสอบ — นำเข้า Excel ที่หน้าตั้งค่า" />
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>บทเรียน</th>
                          <th>จำนวนข้อ</th>
                          <th>ผ่านแล้ว</th>
                          <th>ความคืบหน้า</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(all ? chapters : chapters.slice(0, 7)).map((c) => (
                          <tr key={c.chapter_id}>
                            <td>
                              <Link
                                className="flex items-center gap-3"
                                href={`/questions?chapter=${c.chapter_id}`}
                              >
                                <span className="text-[10px] text-muted border border-slate-600 rounded px-1.5 py-1">
                                  {c.chapter_id}
                                </span>
                                <strong className="font-normal whitespace-nowrap">
                                  {c.chapter_name}
                                </strong>
                              </Link>
                            </td>
                            <td className="text-muted">{c.total} ข้อ</td>
                            <td className="text-cyan">{c.verified}</td>
                            <td>
                              <div className="flex items-center gap-2 min-w-[90px]">
                                <div className="progress-track flex-1">
                                  <div
                                    className="progress-fill"
                                    style={{
                                      width: `${(c.verified / c.total) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted w-7">
                                  {Math.round((c.verified / c.total) * 100)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <button
                  className="w-full text-center p-4 text-xs text-muted border-t border-slate-700 hover:text-cyan"
                  onClick={() => setAll(!all)}
                >
                  {all ? "แสดงน้อยลง" : `ดูทั้งหมด ${chapters.length} บท`}
                </button>
              </section>
              <div className="space-y-5">
                <section className="panel p-6">
                  <div className="flex gap-3 items-center">
                    <span className="metric-icon">
                      <TrendingUp size={19} />
                    </span>
                    <h2 className="font-bold">การฝึกฝนของคุณ</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-5 mt-7">
                    <div>
                      <p className="text-3xl font-bold">{stats.quiz_played}</p>
                      <p className="text-xs text-muted mt-2">ควิซที่เล่นจบ</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-cyan">
                        {stats.quiz_average}
                        <span className="text-sm">%</span>
                      </p>
                      <p className="text-xs text-muted mt-2">คะแนนเฉลี่ย</p>
                    </div>
                  </div>
                  <Link
                    href="/quiz"
                    className="text-xs text-cyan flex items-center gap-2 mt-7"
                  >
                    ฝึกฝนต่อเนื่องได้ที่หน้าควิซ
                    <ArrowRight size={14} />
                  </Link>
                </section>
                <section className="panel p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Bot className="text-blue-300" size={22} />
                    <h2 className="font-bold">Automation Lab</h2>
                  </div>
                  <p className="text-xs leading-7 text-muted">
                    ทดลองบอทด้วย Playwright ติดตามสถานะ
                    <br />
                    และดู log สดได้ในหน้าเดียว
                  </p>
                  <Link className="btn w-full mt-5" href="/bot">
                    เปิดหน้าควบคุมบอท
                    <ArrowRight size={14} />
                  </Link>
                </section>
              </div>
            </div>
          </>
        )
      )}
    </>
  );
}

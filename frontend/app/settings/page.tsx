"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database,
  Radio,
  ShieldCheck,
  RefreshCw,
  Upload,
  ExternalLink,
  AlertTriangle,
  UserRound,
  Trash2,
} from "lucide-react";
import { api, post, errorMessage } from "@/lib/api";
import { BotRun, User } from "@/lib/types";
import { useUser } from "@/components/shell";
import { PageTitle, ErrorBox, Modal } from "@/components/ui";
type Health = {
  database: boolean;
  redis: boolean;
  academy_session: string;
  academy_saved_at: number | null;
};
// การล้างข้อมูลต้องพิมพ์ยืนยันและตรวจ admin ที่ backend อีกครั้ง
export default function SettingsPage() {
  const user = useUser();
  const [health, setHealth] = useState<Health | null>(null),
    [users, setUsers] = useState<User[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [danger, setDanger] = useState<"data" | "academy-session" | null>(null),
    [confirmation, setConfirmation] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const close = useCallback(() => {
    setDanger(null);
    setConfirmation("");
  }, []);
  const refresh = useCallback(async () => {
    setError("");
    try {
      setHealth(await api<Health>("/settings/status"));
      if (user?.is_admin) setUsers(await api<User[]>("/settings/users"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [user?.is_admin]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function importFile(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await api<{ added: number; skipped: number; updated: number }>(
        "/questions/import",
        { method: "POST", body },
      );
      setMessage(
        `นำเข้าสำเร็จ: เพิ่ม ${r.added} ข้อ · ข้ามข้อมูลเดิม ${r.skipped} ข้อ`,
      );
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      if (upload.current) upload.current.value = "";
    }
  }
  async function academyLogin() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const run = await post<BotRun>("/bot/academy-login");
      setMessage(
        `ส่งงานล็อกอิน ${run.task_id.slice(0, 8)} แล้ว · เปิด browser ที่เครื่อง worker ติดตาม log ได้ที่หน้าบอท`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function clear() {
    if (!danger) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/settings/${danger}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      close();
      setMessage("ล้างข้อมูลที่เลือกแล้ว");
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const expected = danger === "data" ? "DELETE DATA" : "DELETE SESSION";
  return (
    <>
      <PageTitle
        eyebrow="SYSTEM SETTINGS"
        title="ตั้งค่าระบบ"
        description="ตรวจการเชื่อมต่อ จัดการข้อมูล และดูบัญชีผู้ใช้ของคุณ"
        action={
          <button className="btn" onClick={() => void refresh()}>
            <RefreshCw size={15} />
            อัปเดตสถานะ
          </button>
        }
      />
      <ErrorBox message={error} />
      {message && (
        <div
          role="status"
          className="p-4 mb-6 border border-cyan/30 bg-cyan/10 text-cyan rounded-lg text-xs leading-7"
        >
          {message}{" "}
          <Link className="underline" href="/bot">
            ดูหน้าบอท
          </Link>
        </div>
      )}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        {[
          {
            label: "SQLite Database",
            icon: Database,
            value: health?.database
              ? "เชื่อมต่อแล้ว"
              : health
                ? "ไม่พร้อม"
                : "กำลังตรวจสอบ",
            ok: health?.database,
            caption: "ข้อมูลข้อสอบ สมาชิก และควิซ",
          },
          {
            label: "Redis Queue",
            icon: Radio,
            value: health?.redis
              ? "เชื่อมต่อแล้ว"
              : health
                ? "ไม่พร้อม"
                : "กำลังตรวจสอบ",
            ok: health?.redis,
            caption: "Queue และ real-time log",
          },
          {
            label: "Academy Session",
            icon: ShieldCheck,
            value:
              health?.academy_session === "saved_unchecked"
                ? "มีไฟล์ session"
                : "ยังไม่มี session",
            ok: health?.academy_session === "saved_unchecked",
            caption: "สถานะล็อกอินยังไม่ได้ตรวจเว็บจริง",
          },
        ].map((s) => (
          <section className="metric-card" key={s.label}>
            <div className="flex justify-between items-center gap-2">
              <h2 className="text-xs text-muted">{s.label}</h2>
              <s.icon size={18} className="text-muted" />
            </div>
            <p
              className={`font-bold text-lg mt-6 ${s.ok ? "text-cyan" : "text-amber-300"}`}
            >
              {s.value}
            </p>
            <p className="metric-caption">{s.caption}</p>
          </section>
        ))}
      </div>
      <div className="grid xl:grid-cols-2 gap-6">
        <section className="panel p-6">
          <h2 className="font-bold flex gap-2 items-center">
            <UserRound size={19} className="text-cyan" />
            ข้อมูลบัญชี
          </h2>
          <dl className="space-y-5 mt-7 text-xs">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">ชื่อผู้ใช้</dt>
              <dd>{user?.username}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">อีเมล</dt>
              <dd className="break-all">{user?.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">สิทธิ์การใช้งาน</dt>
              <dd className="text-cyan">
                {user?.is_admin ? "ผู้ดูแลระบบ (Admin)" : "สมาชิก"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">วันที่สมัคร</dt>
              <dd>
                {user && new Date(user.created_at).toLocaleDateString("th-TH")}
              </dd>
            </div>
          </dl>
        </section>
        <section className="panel p-6">
          <h2 className="font-bold flex gap-2 items-center">
            <ShieldCheck size={19} className="text-blue-300" />
            Academy Login
          </h2>
          <p className="text-xs text-muted leading-7 mt-5">
            เปิด Chromium ที่เครื่องที่รัน Celery worker เพื่อเข้าสู่ระบบ
            Academy หากมี captcha ให้ทำเองใน browser แล้วระบบจะเก็บ session
            ไว้สำหรับครั้งต่อไป
          </p>
          {health?.academy_saved_at && (
            <p className="text-[10px] text-muted mt-3">
              บันทึกล่าสุด{" "}
              {new Date(health.academy_saved_at * 1000).toLocaleString("th-TH")}
            </p>
          )}
          {user?.is_admin ? (
            <button
              className="btn mt-5"
              disabled={busy || !health?.redis}
              onClick={academyLogin}
            >
              ล็อกอิน Academy ใหม่
              <ExternalLink size={14} />
            </button>
          ) : (
            <p className="text-xs text-muted mt-5">
              เฉพาะ admin จัดการ Academy session ได้
            </p>
          )}
          <p className="text-[10px] text-muted mt-4 leading-6">
            ต้องมี desktop/display และตั้ง selector ใน .env ให้ตรงกับหน้าเว็บ
          </p>
        </section>
        {user?.is_admin && (
          <>
            <section className="panel p-6">
              <h2 className="font-bold flex items-center gap-2">
                <Upload size={18} className="text-cyan" />
                นำเข้าคลังข้อสอบ
              </h2>
              <p className="text-xs text-muted leading-7 mt-5">
                เลือก Excel ที่มีชีต “คำตอบ” และ “โจทย์ต้นฉบับ” ระบบจะตรวจ 184
                ข้อ / 40 บท และไม่เขียนทับคำตอบที่มีอยู่
              </p>
              <input
                ref={upload}
                aria-label="เลือก Excel"
                className="hidden"
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
              <button
                className="btn btn-primary mt-5"
                disabled={busy}
                onClick={() => upload.current?.click()}
              >
                <Upload size={15} />
                {busy ? "กำลังดำเนินการ…" : "เลือกไฟล์ Excel"}
              </button>
            </section>
            <section className="panel p-6 border-rose-400/30">
              <h2 className="font-bold text-rose-300 flex items-center gap-2">
                <AlertTriangle size={18} />
                Danger Zone
              </h2>
              <p className="text-xs text-muted leading-7 mt-5">
                ล้างข้อสอบและประวัติควิซ หรือเอา Academy session ออก
                คำสั่งเหล่านี้จะให้พิมพ์ข้อความยืนยันก่อนทำงาน
              </p>
              <div className="flex flex-wrap gap-3 mt-5">
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    setDanger("data");
                    setConfirmation("");
                  }}
                >
                  <Trash2 size={14} />
                  ล้างข้อมูลข้อสอบ/ควิซ
                </button>
                <button
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    setDanger("academy-session");
                    setConfirmation("");
                  }}
                >
                  ล้าง session
                </button>
              </div>
            </section>
            <section className="panel xl:col-span-2">
              <div className="panel-heading">
                <h2>ผู้ใช้ทั้งหมด</h2>
                <span className="text-muted text-xs">{users.length} บัญชี</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>ชื่อผู้ใช้</th>
                      <th>อีเมล</th>
                      <th>สิทธิ์</th>
                      <th>วันที่สมัคร</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.username}</td>
                        <td className="text-muted">{u.email}</td>
                        <td className={u.is_admin ? "text-cyan" : "text-muted"}>
                          {u.is_admin ? "Admin" : "สมาชิก"}
                        </td>
                        <td className="text-muted">
                          {new Date(u.created_at).toLocaleDateString("th-TH")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
      {danger && (
        <Modal
          title={
            danger === "data"
              ? "ล้างข้อมูลข้อสอบและควิซ"
              : "ล้าง Academy session"
          }
          onClose={close}
        >
          <ErrorBox message={error} />
          <p className="text-sm text-muted leading-7 mb-5">
            {danger === "data"
              ? "ข้อสอบและประวัติควิซจะถูกลบ คุณสามารถนำเข้า Excel ใหม่ได้"
              : "ไฟล์ Academy session จะถูกลบ และต้องล็อกอินใหม่ก่อนใช้บอท Academy"}
          </p>
          <label htmlFor="danger-confirm" className="field-label">
            พิมพ์ <strong className="text-rose-300">{expected}</strong>{" "}
            เพื่อยืนยัน
          </label>
          <input
            id="danger-confirm"
            autoComplete="off"
            className="input"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <div className="flex gap-3 mt-6">
            <button
              className="btn btn-danger"
              disabled={busy || confirmation !== expected}
              onClick={clear}
            >
              ยืนยันการล้างข้อมูล
            </button>
            <button className="btn" onClick={close}>
              ยกเลิก
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

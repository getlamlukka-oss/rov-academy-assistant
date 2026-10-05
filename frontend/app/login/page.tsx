"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  ArrowRight,
  BookOpen,
  Swords,
  Bot,
  ShieldCheck,
} from "lucide-react";
import { post, errorMessage } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { User } from "@/lib/types";
import { ErrorBox } from "@/components/ui";
// ฟอร์มสมัครและ login ส่งรหัสผ่านให้ API เท่านั้น
export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (register)
        await post<User>("/auth/register", { username, email, password });
      const result = await post<{ access_token: string }>("/auth/login", {
        username,
        password,
      });
      setToken(result.access_token);
      router.replace("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-wrap">
      <section className="login-art">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={25} fill="currentColor" />
          </div>
          <div>
            <strong>
              RoV <span>ACADEMY</span>
            </strong>
            <small>LEARN. PRACTICE. LEVEL UP.</small>
          </div>
        </div>
        <div className="relative z-10">
          <p className="eyebrow mb-7">YOUR NEXT LEVEL STARTS HERE</p>
          <h1 className="text-5xl font-bold leading-[1.4] tracking-tight">
            เข้าใจเกมมากขึ้น
            <br />
            <span className="text-cyan">เล่นได้เหนือกว่าเดิม</span>
          </h1>
          <p className="text-muted mt-6 leading-8 max-w-md">
            ทบทวนบทเรียน ฝึกทำควิซ และจัดการข้อสอบ
            <br />
            ทุกอย่างที่คุณต้องการใน Academy เดียว
          </p>
          <div className="flex gap-7 mt-10 text-sm text-slate-300">
            <span className="flex gap-2 items-center">
              <BookOpen size={18} className="text-cyan" />
              คลังข้อสอบ
            </span>
            <span className="flex gap-2 items-center">
              <Swords size={18} className="text-cyan" />
              ควิซ
            </span>
            <span className="flex gap-2 items-center">
              <Bot size={18} className="text-cyan" />
              บอท
            </span>
          </div>
        </div>
        <p className="text-xs text-muted flex items-center gap-2">
          <ShieldCheck size={15} />
          สร้างเพื่อการศึกษาและฝึกฝน
        </p>
      </section>
      <section className="login-form">
        <div className="login-card">
          <p className="eyebrow">WELCOME TO ACADEMY</p>
          <h2 className="text-3xl font-bold mt-3">
            {register ? "เริ่มต้นการเรียนรู้" : "ยินดีต้อนรับกลับมา"}
          </h2>
          <p className="text-muted text-sm mt-3">
            {register
              ? "สร้างบัญชีแล้วเริ่มฝึกฝนไปด้วยกัน"
              : "เข้าสู่ระบบเพื่อไปต่อในเส้นทางของคุณ"}
          </p>
          <div className="login-tabs">
            <button
              type="button"
              className={!register ? "active" : ""}
              onClick={() => {
                setRegister(false);
                setError("");
              }}
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              className={register ? "active" : ""}
              onClick={() => {
                setRegister(true);
                setError("");
              }}
            >
              สมัครสมาชิก
            </button>
          </div>
          <ErrorBox message={error} />
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="username" className="field-label">
                ชื่อผู้ใช้
              </label>
              <input
                id="username"
                className="input"
                autoComplete="username"
                placeholder="เช่น academy_player"
                required
                minLength={register ? 3 : 1}
                maxLength={80}
                pattern={register ? "[a-zA-Z0-9_.-]+" : undefined}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            {register && (
              <div>
                <label className="field-label" htmlFor="email">
                  อีเมล
                </label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            )}
            <div>
              <label className="field-label" htmlFor="password">
                รหัสผ่าน
              </label>
              <input
                id="password"
                className="input"
                autoComplete={register ? "new-password" : "current-password"}
                type="password"
                required
                minLength={register ? 8 : 1}
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  register ? "อย่างน้อย 8 ตัวอักษร" : "กรอกรหัสผ่านของคุณ"
                }
              />
            </div>
            <button disabled={busy} className="btn btn-primary w-full py-3.5">
              {busy
                ? "กำลังดำเนินการ…"
                : register
                  ? "สร้างบัญชี"
                  : "เข้าสู่ระบบ"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="text-[11px] text-muted text-center mt-7 leading-6">
            บัญชีแรกที่สมัครจะได้รับสิทธิ์ผู้ดูแลระบบ
            <br />
            ข้อมูลข้อสอบอ้างอิงบทเรียน Academy และอาจเป็นแพตช์เก่า
          </p>
        </div>
      </section>
    </main>
  );
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  Swords,
  Bot,
  Settings,
  LogOut,
  Menu,
  X,
  Zap,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { clearToken, validToken } from "@/lib/auth";
import { User } from "@/lib/types";
import { ErrorBox, Loading } from "./ui";
const UserContext = createContext<User | null>(null);
export function useUser() {
  return useContext(UserContext);
}
const routes = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/questions", label: "คลังข้อสอบ", icon: BookOpen },
  { href: "/quiz", label: "ฝึกทำควิซ", icon: Swords },
  { href: "/bot", label: "ควบคุมบอท", icon: Bot },
  { href: "/settings", label: "ตั้งค่าระบบ", icon: Settings },
];

// AuthGuard ตรวจ token ตอนเปิดหน้าและทุก 30 วินาที; API ตรวจ signature อีกชั้น
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    router = useRouter();
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    setMenu(false);
    if (path === "/login") {
      setReady(true);
      return;
    }
    if (!validToken()) {
      clearToken();
      router.replace("/login");
      return;
    }
    setReady(false);
    setError("");
    api<User>("/auth/me")
      .then((u) => {
        setUser(u);
        setReady(true);
      })
      .catch((e) => {
        setError(errorMessage(e));
        setReady(true);
      });
    const timer = setInterval(() => {
      if (!validToken()) {
        clearToken();
        router.replace("/login");
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [path, router]);
  if (path === "/login") return <>{children}</>;
  if (!ready) return <Loading />;
  if (error || !user)
    return (
      <main className="p-8">
        <ErrorBox message={error} />
        <button className="btn mt-4" onClick={() => window.location.reload()}>
          ลองเชื่อมต่ออีกครั้ง
        </button>
      </main>
    );
  const current = routes.find((r) => r.href === path)?.label || "Academy";
  return (
    <UserContext.Provider value={user}>
      <div className="app-shell">
        {menu && (
          <button
            aria-label="ปิดเมนู"
            className="sidebar-overlay"
            onClick={() => setMenu(false)}
          />
        )}
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <Link href="/" className="brand">
            <div className="brand-mark">
              <Zap size={25} fill="currentColor" />
            </div>
            <div>
              <strong>
                RoV <span>ACADEMY</span>
              </strong>
              <small>LEARN. PRACTICE. LEVEL UP.</small>
            </div>
          </Link>
          <p className="nav-caption">WORKSPACE</p>
          <nav aria-label="เมนูหลัก">
            {routes.map((r) => (
              <Link
                className={`nav-item ${r.href === path ? "active" : ""}`}
                href={r.href}
                key={r.href}
              >
                <r.icon size={19} />
                <span>{r.label}</span>
                {r.href === path && (
                  <ChevronRight size={15} className="ml-auto" />
                )}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="academy-note">
              <ShieldCheck size={23} className="text-cyan" />
              <strong>พื้นที่สำหรับการเรียนรู้</strong>
              <p>ฝึกทักษะ RoV ด้วยข้อสอบและคำอธิบายจากบทเรียน</p>
              <span>ACADEMY / v1.0</span>
            </div>
            <button
              className="profile"
              onClick={() => {
                clearToken();
                router.replace("/login");
              }}
            >
              <span className="avatar">
                {user.username.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-left flex-1">
                <strong>{user.username}</strong>
                <small>{user.is_admin ? "ผู้ดูแลระบบ" : "สมาชิก"}</small>
              </span>
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="flex items-center gap-3">
              <button
                aria-label="เปิดเมนู"
                className="icon-button lg:hidden"
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X size={21} /> : <Menu size={21} />}
              </button>
              <span className="text-muted text-sm hidden sm:inline">
                Workspace
              </span>
              <ChevronRight size={14} className="text-muted hidden sm:inline" />
              <span className="text-sm">{current}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="topbar-tag">
                <span />
                พร้อมเรียนรู้
              </span>
              <span className="avatar small">
                {user.username.slice(0, 2).toUpperCase()}
              </span>
            </div>
          </header>
          <main className="content">{children}</main>
          <footer className="footer">
            <span>RoV Academy • พื้นที่ฝึกฝนของคุณ</span>
            <span>สร้างเพื่อการศึกษา</span>
          </footer>
        </div>
      </div>
    </UserContext.Provider>
  );
}

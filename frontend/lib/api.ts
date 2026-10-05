import { clearToken, getToken } from "./auth";
// error มีข้อความไทยอ่านได้และส่งผู้ใช้กลับ login เมื่อ session หมดอายุ
export const API = (
  process.env.NEXT_PUBLIC_API || "http://localhost:8000"
).replace(/\/$/, "");
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(API + path, { ...init, headers, cache: "no-store" });
  } catch {
    throw new ApiError(
      "เชื่อมต่อ API ไม่ได้ ตรวจว่า FastAPI รันที่พอร์ต 8000",
      0,
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      clearToken();
      window.location.assign("/login");
    }
    const detail = data.detail;
    const message = Array.isArray(detail)
      ? detail.map((e: { msg: string }) => e.msg).join(", ")
      : typeof detail === "string"
        ? detail
        : "เกิดข้อผิดพลาด กรุณาลองใหม่";
    throw new ApiError(message, response.status);
  }
  return data as T;
}
export const post = <T>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "เกิดข้อผิดพลาด";

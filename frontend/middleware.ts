import { NextResponse } from "next/server";
// localStorage อ่านไม่ได้ใน middleware; AuthGuard ตรวจ token ฝั่ง client และ API ตรวจสิทธิ์จริง
export function middleware() {
  return NextResponse.next();
}
export const config = {
  matcher: ["/", "/questions", "/quiz", "/bot", "/settings"],
};

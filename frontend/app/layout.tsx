import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import "./globals.css";
// metadata และโครงหน้าที่ใช้ร่วมกัน
export const metadata: Metadata = {
  title: "RoV Academy | Learn & Level Up",
  description: "คลังข้อสอบ ควิซ และระบบฝึกฝน RoV Academy ในเว็บเดียว",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

import Link from "next/link";
// หน้าที่ไม่มีอยู่ในระบบ
export default function NotFound() {
  return (
    <div className="panel p-10 text-center">
      <h1 className="text-2xl font-bold">ไม่พบหน้านี้</h1>
      <Link className="btn mt-6" href="/">
        กลับหน้าภาพรวม
      </Link>
    </div>
  );
}

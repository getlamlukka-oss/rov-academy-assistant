"use client";
// แสดง error boundary แทนหน้าว่างเมื่อเกิดข้อผิดพลาดในการ render
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="panel p-8">
      <h1 className="text-xl font-bold">โหลดหน้านี้ไม่สำเร็จ</h1>
      <p className="text-muted my-4">ลองอีกครั้งหรือตรวจการเชื่อมต่อ API</p>
      <button onClick={reset} className="btn btn-primary">
        ลองอีกครั้ง
      </button>
    </div>
  );
}

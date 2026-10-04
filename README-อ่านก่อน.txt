RoV Academy Assistant - ไฟล์ระบบทั้งหมด (Source Code)

โครงสร้าง:
- src/            = หน้า UI (React + Tailwind) เช่น หน้าหลัก src/pages/Home.jsx
- base44/         = Backend (functions/) + โครงสร้างข้อมูล (entities/) + shared logic
- index.html, vite.config.js, package.json = ตั้งค่าโปรเจกต์

สิ่งที่ไม่ได้รวมใน zip นี้ (ต้องมีเอง):
- node_modules  -> สร้างใหม่ด้วยคำสั่ง: npm install
- Secrets 3 ตัว (ค่าจริงอยู่ในแพลตฟอร์ม ไม่ถูกเก็บในไฟล์):
  GEMINI_API_KEY, BROWSER_WORKER_URL, BROWSER_WORKER_TOKEN

หมายเหตุ:
- ระบบนี้รันได้เต็มรูปแบบบนแพลตฟอร์ม Base44 (ที่คุณใช้อยู่)
- Browser Worker (Playwright/Chromium) เป็นส่วนที่ต้องรันแยกบนคอมพิวเตอร์ของคุณ

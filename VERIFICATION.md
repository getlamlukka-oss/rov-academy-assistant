# ผลตรวจระบบ — 5 ตุลาคม 2026

ตรวจด้วย Python 3.12, Node.js 24.19.0, Chromium 130 (Playwright 1.48), FastAPI/Uvicorn, Celery prefork concurrency=1 และ Redis 6.2.14 ใน workspace ส่วน Compose สำหรับติดตั้งจริงใช้ Redis 7.4

## ข้อมูลจริง

นำเข้า Excel ต้นฉบับสำเร็จครบ **184 ข้อ / 40 บท** ตัวเลือกครบ 4 ข้อ เฉลยตรงกับ index ทุกข้อ สถานะเริ่มต้น: verified 6, ambiguous 3, analyzed 36, reference 139

## Automated backend tests

`python -m pytest -q`: **9 passed**

- Excel integrity, สถานะ และ import ซ้ำไม่ทับ admin edit
- JWT, บัญชีแรกเป็น admin, สิทธิ์สมาชิก, duplicate username และ password hash ไม่รั่วใน response
- Stats, chapters, ฟิลเตอร์, แก้คำตอบ และ verify
- Quiz ไม่เผยเฉลยก่อนตอบ, เจ้าของ session, answer snapshot, duplicate answer, early end, คะแนนคงเดิม
- Quiz order และ timeout/null answers
- Bot queue/status/ownership/Stop, ป้องกันงาน active ซ้อน และ Academy admin-only (unit test mock queue)
- Danger confirmation, สิทธิ์ล้างข้อมูล, เก็บบัญชีผู้ใช้ไว้
- Excel upload ผ่าน API รวมถึงไฟล์เสีย
- Question matcher, options สลับลำดับ และ unknown/mismatched question

มี deprecation warnings จาก Passlib/Starlette ของ stack ที่กำหนด ไม่มี test failure

## Frontend build

- `npm run typecheck`: ผ่าน
- `npm run build`: ผ่านทุก route
- ตรวจโค้ดที่ใช้ production build ผ่าน browser ไม่มี JavaScript runtime error

## Browser E2E จริง — 9 กลุ่มผ่าน

ใช้ DB ทดสอบแยก `/tmp/rov-e2e.db` และงาน Demo เท่านั้น:

1. ไม่มี token → redirect login → สมัคร admin → JWT → Dashboard 184 ข้อ และกราฟ Recharts
2. ฟิลเตอร์กำกวม 3 ข้อ → เลือกบท → popup → เปลี่ยนคำตอบ → verified ถูก reset → mark verified
3. เล่นควิซ 3 ข้อ ตอบผิดหนึ่งข้อ → คะแนน **2/3** และรายการข้อผิดหนึ่งข้อ
4. Timer 15 วินาทีหมดเวลา → ส่ง null → ข้อถัดไปได้ timer ใหม่ และยังตอบได้
5. UI Start → Redis queue → Celery → Chromium จริง → เลือกคำตอบ/Submit ของ Demo 3 ข้อ → WebSocket log → success
6. UI Stop งาน running → cooperative cancellation → ปิด browser → status cancelled
7. Settings DB/Redis status, Excel upload แบบ idempotent (เพิ่ม 0 / ข้าม 184), danger button ต้องพิมพ์ยืนยัน
8. ทุกหน้า authenticated ที่ viewport **390×844** ไม่มี document horizontal overflow และเมนูมือถือเปิดได้ ตารางเลื่อนใน container
9. ไม่มี browser JavaScript runtime errors

## WebSocket integration จริง

`tests/ws_e2e.py` ผ่าน:

- Token ไม่ถูกต้อง → close 1008
- สมาชิกอื่นเข้าถึง task log ของเจ้าของไม่ได้ → close 1008
- Origin นอก allowlist → ปฏิเสธ handshake 403
- เจ้าของรับ event จาก Redis/pubsub ได้
- Reconnect ได้ history replay โดย event ID ตรงกับ log เดิม
- หยุด test task ได้เมื่อจบการตรวจ

## ขอบเขตที่ยังไม่ได้ตรวจ

- ยังไม่ได้ล็อกอินหรือส่งคำตอบบน Academy จริง ไม่มีบัญชีและข้อมูล DOM สำหรับยืนยัน selectors/paths
- Academy manual login ต้องมี desktop/display ที่เครื่อง worker; ไม่สามารถเปิด browser บนเครื่องผู้ใช้จาก server ได้โดยตรง
- ไม่ได้รัน Docker Compose ใน workspace; integration ใช้ Redis binary จริงที่ติดตั้งสำหรับทดสอบแทน
- โค้ดการจับคู่และ browser flow ของ Academy พร้อมให้ตั้งค่า แต่ต้องปรับ selector และ flow ให้ตรงเว็บก่อนใช้งาน คะแนน Academy ยังไม่ถูกนำมารับรองอัตโนมัติ

## ทำ E2E ซ้ำ

สร้าง DB ชั่วคราวใหม่ นำเข้า Excel แล้วเปิด API และ Celery ด้วย `DATABASE_URL=sqlite:////tmp/rov-e2e.db` ค่าเดียวกัน เปิด Redis และ frontend ตาม README จากนั้น:

```bash
E2E_ALLOW_DISPOSABLE=true python tests/browser_e2e.py
E2E_ALLOW_DISPOSABLE=true python tests/ws_e2e.py
```

Browser E2E คาดหวังให้บัญชีที่สร้างเป็นบัญชีแรกใน DB ทดสอบ เพราะมีขั้นตอนทดสอบ admin edit ห้ามใช้กับ DB ใช้งานจริง การตรวจภาพอยู่ใน `artifacts/` และไม่รวมใน source ZIP

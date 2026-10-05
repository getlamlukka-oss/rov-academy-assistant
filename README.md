# RoV Academy Web App

เว็บภาษาไทยสำหรับนำเข้า Excel, จัดการข้อสอบ, ฝึกควิซ และทดลอง automation ผ่านหน้าเว็บเดียว รองรับมือถือ ไม่มี Telegram

## สิ่งที่มีในโปรเจกต์

- Next.js 14 + TypeScript + Tailwind + Recharts: `/`, `/login`, `/questions`, `/quiz`, `/bot`, `/settings`
- FastAPI + SQLAlchemy + SQLite WAL: JWT, สิทธิ์ admin, CRUD, สถิติ และ quiz sessions
- Celery + Redis: งานเบื้องหลัง, Stop แบบ cooperative, log pub/sub พร้อม replay และดาวน์โหลด log
- Playwright: **Demo ที่ทดลองจริงใน Chromium ในเครื่อง** และ adapter สำหรับ Academy
- Excel ต้นฉบับรวมอยู่ใน `data/RoV_Academy_Answers_แก้ชีส.xlsx`

**ใช้เพื่อการศึกษาเท่านั้น** การใช้บอททำข้อสอบบน Academy จริงอาจขัดกับข้อกำหนดของผู้ให้บริการ

## ข้อมูลจาก Excel ที่ตรวจแล้ว

นำเข้าจากชีต `คำตอบ` และ `โจทย์ต้นฉบับ` จับคู่ด้วย `(รหัสบท, ข้อ)` ไม่สร้างตัวเลือกเพิ่มและไม่ใช้ข้อมูลจำลองแทน Excel

| รายการ | จำนวน |
|---|---:|
| ข้อสอบ | 184 |
| บทเรียน | 40 |
| ผ่านระบบแล้ว | 6 |
| กำกวม | 3 |
| วิเคราะห์จากบทเรียน | 36 |
| อ้างอิงบทเรียน | 139 |

ตรวจตัวเลือกครบ 4 ข้อ ตรวจคำตอบตรงกับตัวเลือก และตรวจโจทย์ตรงกันทั้งสองชีต หมายเหตุ/URL ถูกเก็บทั้งหมด บางบทมี 3, 6 หรือ 8 ข้อ บอทใช้จำนวนจริงจาก DB ไม่สมมุติว่าทุกบทมี 8 ข้อ

`answer_idx` ใน DB/API ใช้ **0..3**; Excel และ UI ใช้เลข **1..4** การนำเข้าซ้ำจะข้ามข้อเดิม เพื่อเก็บคำตอบที่ admin แก้แล้ว หากต้องการทับให้ใช้ `run_import.py --overwrite`

## ติดตั้ง (Python 3.11–3.12, Node.js 20+, Docker Compose)

รันจากโฟลเดอร์ `rov-academy-web`:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
python scripts/setup_env.py
python scripts/clean_data.py
python scripts/run_import.py
docker compose up -d redis
cd frontend
npm ci
cp .env.example .env.local
cd ..
```

Windows ใช้ `.venv\Scripts\activate` แทน `source` หาก Chromium แจ้ง dependency ขาด บน Linux ใช้ `playwright install-deps chromium`

`setup_env.py` สร้าง `.env` พร้อม JWT_SECRET แบบสุ่ม 64 ตัวอักษรและไม่ทับ `.env` เดิม ถ้าคัดลอก `.env.example` เอง ต้องแทนค่า placeholder ด้วย secret ที่สุ่มจริง API จะไม่เปิดด้วย placeholder

เปิดสาม terminal ที่ activate virtualenv แล้ว:

```bash
# terminal 1 — API (รันจาก root โปรเจกต์)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# terminal 2 — worker (รันจาก root โปรเจกต์)
celery -A worker.celery_app worker -l info --concurrency=1

# terminal 3 — หน้าเว็บ
cd frontend
npm run dev
```

เปิด **http://localhost:3000** สมัครบัญชีแรกเพื่อรับสิทธิ์ admin จากนั้นใช้ทุกฟีเจอร์จากหน้าเว็บ API docs: **http://localhost:8000/docs**

บน Windows Celery prefork ไม่รองรับ ใช้ WSL2 หรือ `--pool=solo --concurrency=1` สำหรับการทดลองในเครื่อง

## วิธีใช้งาน

1. Dashboard แสดงจำนวนข้อ สถานะทั้งสี่ กราฟ ตารางบท และสถิติควิซของบัญชีปัจจุบัน
2. Questions ค้นข้อความ กรองบท/สถานะ เปิดรายละเอียด Admin แก้เฉลย/หมายเหตุ ตรวจสอบ และลบได้ เมื่อเปลี่ยนเฉลยจะยกเลิก verified จนกว่าจะตรวจใหม่
3. Quiz เลือกบทหรือรวมทุกบท เลือกจำนวนข้อและเวลา (ไม่จับเวลา/15/30/60 วินาที) แสดงเฉลยหลังตอบ สรุปคะแนนและข้อที่ผิด/ไม่ได้ตอบ มีประวัติในหน้าเดียวกัน
4. Bot เลือก **Demo** ก่อน เลือกบท Headless และ delay 2–4 วินาที Start แล้วดู console สด Stop หยุดที่จุดตรวจถัดไปพร้อมปิด browser ดู log งานเก่าจากประวัติได้
5. Settings ตรวจ DB/Redis/ไฟล์ session, นำเข้า Excel ผ่านเว็บ, ดูสมาชิก (admin) และล้างข้อมูลด้วยข้อความยืนยัน

## Academy adapter: ส่วนที่ต้องตั้งก่อนใช้ระบบจริง

ยัง **ไม่ได้ทดสอบ Academy จริง** เพราะไม่มีบัญชี/DOM ของหน้า quiz ค่า selector และ chapter path ใน `.env.example` เป็นตัวอย่างที่ต้องตรวจเอง ระบบไม่อ้างว่า selector เหล่านี้ใช้กับเว็บจริงได้ทันที

| ตัวแปร | ต้องชี้ไปที่ |
|---|---|
| `SEL_USERNAME`, `SEL_PASSWORD`, `SEL_LOGIN_BTN` | ช่องและปุ่มล็อกอินอัตโนมัติ |
| `SEL_AUTHENTICATED` | element ที่ปรากฏเมื่อเข้าสู่ระบบสำเร็จ |
| `SEL_QUESTION` | ข้อความโจทย์เดียวของข้อปัจจุบัน |
| `SEL_OPTIONS` | element ที่กดได้ทั้ง 4 ตัวเลือก ข้อความต้องตรงตัวเลือกใน Excel |
| `SEL_SUBMIT` | ปุ่มส่งคำตอบ |
| `SEL_NEXT` | ปุ่มไปข้อถัดไป (ถ้ามี) |
| `SEL_COMPLETE` | element ที่บอกว่าจบบทแล้ว |
| `ACADEMY_CHAPTER_PATH` | path ที่มี `{chapter}` เช่น `/chapter/{chapter}/quiz` |
| `ACADEMY_LOGIN_PATH` | path ของ login |

ใช้ CSS selectors: โค้ดตรวจการเปลี่ยนข้อด้วย `document.querySelector` ตั้ง path ให้ตรงหน้า quiz จริง และปรับ `worker/browser.py` หากเว็บมีขั้นตอนเริ่มบท/iframe/flow อื่นเพิ่มเติม

### Manual login และ captcha

ตั้ง `ACADEMY_MANUAL_LOGIN=true` แล้วรัน:

```bash
python scripts/academy_login.py --user-id 1
```

หรือกด **ล็อกอิน Academy ใหม่** ที่ Settings (admin) ระบบจะส่งงานให้ Celery เปิด Chromium **บนเครื่องที่รัน worker** ไม่ใช่บนเครื่องของผู้ใช้ที่เปิดหน้าเว็บ ถ้า backend อยู่บน server ที่ไม่มี desktop ต้องจัด display/VNC บนเครื่อง worker หรือรัน worker บนเครื่องที่มีหน้าจอ ไม่สามารถเปิด browser ที่เครื่องผู้ใช้จาก HTTP request ได้โดยตรง

ผู้ใช้ทำ captcha เอง ระบบจะรอ `SEL_AUTHENTICATED` สูงสุด 300 วินาทีแล้วบันทึก state ไฟล์ state มีอยู่ **ไม่ได้หมายความว่า session ยังไม่หมดอายุ** Settings จึงระบุ “มีไฟล์ session / ยังไม่ได้ตรวจเว็บจริง”

ถ้า session เก่าหมดอายุในโหมด headless ให้ล็อกอินใหม่ผ่าน Settings หรือปิด headless บอท Academy ใช้ได้เฉพาะ admin เพราะทุกคนใช้ session Academy ไฟล์เดียว

### การจับคู่และผลการรัน

- จับคู่โจทย์ที่ตรงกันหลังปรับ Unicode/ช่องว่าง และจำกัดภายในบทเดียวกัน
- เมื่อตัวเลือกสลับลำดับ เลือกตามข้อความคำตอบ ถ้าข้อความซ้ำจนตัดสินไม่ได้จะหยุด
- ถ้าข้อกำกวมยังไม่ verified, โจทย์ไม่พบ, ตัวเลือกเปลี่ยน, หน้าไม่เปลี่ยน หรือไม่พบ completion จะหยุดและบันทึก failed
- `success` หมายถึง flow ส่งคำตอบ/จบบทสำเร็จ **ไม่ได้หมายถึง Academy ให้คะแนนเต็ม** ไม่เปลี่ยน verified อัตโนมัติหลังคลิก Submit
- log สาธารณะไม่แสดงรหัสผ่าน/Playwright trace ที่อาจมี credential
- ระบบรองรับหนึ่งงานที่ active ต่อครั้ง เพื่อป้องกันการใช้ session เดียวกันชนกัน
- งาน queued หยุดด้วย revoke; งาน running หยุดแบบ cooperative อาจรอ navigation/locator timeout สูงสุดประมาณ 30 วินาที หาก worker ถูกปิดหรือฆ่ากะทันหันต้องตรวจ DB/worker และสถานะงานก่อนเริ่มใหม่

## API

ทุก endpoint ของข้อมูลต้องแนบ `Authorization: Bearer <JWT>` ยกเว้น `/health`, `/auth/register`, `/auth/login` โดย admin endpoints ตรวจสิทธิ์จาก DB

| กลุ่ม | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Questions | `GET /questions/?chapter=30&status=verified&search=...`, `GET /questions/{chapter}/{no}`, `PUT /questions/{id}`, `PATCH /questions/{id}/verify`, `DELETE /questions/{id}`, `POST /questions/import` (multipart .xlsx) |
| Stats | `GET /stats/`, `GET /stats/chapters` |
| Quiz | `POST /quiz/start`, `POST /quiz/answer`, `GET /quiz/summary/{session_id}`, `POST /quiz/end/{session_id}`, `GET /quiz/history` |
| Bot | `POST /bot/start`, `POST /bot/stop/{task_id}`, `GET /bot/status/{task_id}`, `GET /bot/runs`, `POST /bot/academy-login` |
| Settings | `GET /settings/status`, `GET /settings/users`, `DELETE /settings/data`, `DELETE /settings/academy-session` |
| WebSocket | `WS /ws/logs/{task_id}` |

ตัวอย่าง payload:

```json
{"chapters":[30,31],"count":10}
```

```json
{"session_id":"...","question_id":1,"answer_idx":1}
```

`answer_idx: null` หมายถึงหมดเวลา/ข้ามข้อ เวลาต่อข้อเป็นฟีเจอร์ฝั่ง UI สำหรับฝึกฝน ไม่ใช่ข้อจำกัดเวลาฝั่ง server สำหรับการแข่งขัน

```json
{"chapters":[30],"mode":"demo","headless":true,"delay":3}
```

WebSocket ส่ง JWT เป็น **message แรก** ภายใน 10 วินาที เพื่อไม่ให้ token ติด URL/access log:

```json
{"token":"<JWT>"}
```

Server ตรวจเจ้าของงาน/สิทธิ์ admin และ origin แล้ว replay log ล่าสุดสูงสุด 1000 บรรทัด (TTL 7 วัน) ตามด้วย pub/sub Native WebSocket ฝั่ง UI reconnect และตัด log ซ้ำด้วย event ID ตรวจ JWT หมดอายุระหว่างเชื่อมต่อด้วย

Quiz ไม่ส่ง answer/note ก่อนตอบ ไม่รับคำตอบซ้ำหรือตอบนอกลำดับ ไม่ให้ผู้ใช้อื่นอ่าน session และเก็บ snapshot ของข้อสอบตอนเริ่ม จึงรักษาคะแนนเดิมแม้ admin แก้หรือลบข้อสอบภายหลัง

## ค่าตั้งค่าและข้อมูลลับ

- JWT ใน localStorage ชื่อ `rov_token`; AuthGuard ตรวจ expiration และ API ตรวจ signature จริง
- Middleware อ่าน localStorage ไม่ได้ จึงใช้ client AuthGuard; middleware ไม่ใช่ขอบเขตตรวจสิทธิ์
- `.env`, DB, cookie/storage state และ node_modules อยู่ใน `.gitignore` และไม่รวมในไฟล์ ZIP
- ใช้ bcrypt 4.0.1 ให้เข้ากับ passlib 1.7.4 และใช้ python-jose 3.5.0 แทน 3.3.0 ตามแพตช์ความปลอดภัย Next.js อยู่ที่ 14.2.35
- ห้ามเผยแพร่ API ที่เปิดสมัคร first-admin ก่อนสร้าง admin ของคุณ และต้องใช้ HTTPS/reverse proxy พร้อมตั้ง CORS ถ้าจะเปิดใช้นอก localhost
- `NEXT_PUBLIC_API` ต้องตั้งใน `frontend/.env.local` ก่อน build ถ้า API อยู่คนละเครื่อง ค่า `.env` ที่ root ใช้กับ Python ไม่ได้ส่งเข้า Next.js อัตโนมัติ
- ถ้าต้องการใช้ Chromium ที่ติดตั้งอยู่แล้ว ตั้ง `PLAYWRIGHT_EXECUTABLE_PATH` เป็น absolute path
- Redis ใน Compose bind เฉพาะ `127.0.0.1` ไม่เปิดพอร์ตสู่ภายนอก

## ทดสอบ

```bash
pip install -r requirements-dev.txt
python -m pytest -q
cd frontend
npm run typecheck
npm run build
```

ชุดทดสอบสร้าง SQLite ชั่วคราว ไม่มีผลกับ DB ใช้งานจริง ตรวจข้อมูล 184 ข้อ, import ซ้ำ, JWT/สิทธิ์, สถิติ/ฟิลเตอร์, แก้เฉลย, quiz snapshot, ตอบซ้ำ, ตอบผิดลำดับ, timeout, เจ้าของงานบอท, Stop, danger confirmation, upload และ option matching

ผลการตรวจจริงเพิ่มเติมอยู่ใน `VERIFICATION.md` ไม่มีการล็อกอินหรือส่งคำตอบไป Academy จริงในชุดทดสอบ

## ไฟล์สำคัญ

```text
backend/       FastAPI, database, models, auth, importer, quiz, routers, WebSocket
worker/        Celery, Playwright, login, matcher, log events, tasks
scripts/       setup_env, clean_data, run_import, academy_login, build_bundle
frontend/      Next.js config, lib, components, app pages
data/          Excel ต้นฉบับ
tests/         regression tests และ browser E2E สำหรับ DB ทดสอบ
```

รัน `python scripts/build_bundle.py` เพื่อสร้าง ZIP และเอกสารโค้ดเต็มทุกไฟล์โดยแสดง path แยกชัดเจน

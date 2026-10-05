"""E2E จริง: ใช้เฉพาะ server ที่รันกับ DB ทดสอบ และไม่ติดต่อ Academy"""

import os
import re
import sys
import time
from pathlib import Path
from uuid import uuid4
import httpx
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
if os.getenv("E2E_ALLOW_DISPOSABLE") != "true":
    sys.exit("ต้องตั้ง E2E_ALLOW_DISPOSABLE=true และใช้ DB ทดสอบที่แยกจากข้อมูลใช้งานจริง")

API = os.getenv("E2E_API", "http://localhost:8000")
WEB = os.getenv("E2E_WEB", "http://localhost:3000")
output = ROOT / "artifacts"
output.mkdir(exist_ok=True)
username = "e2e_" + uuid4().hex[:8]
password = uuid4().hex
checks = []


def passed(message):
    checks.append(message)
    print("PASS:", message, flush=True)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True, executable_path=os.getenv("PLAYWRIGHT_EXECUTABLE_PATH") or None
    )
    context = browser.new_context(viewport={"width": 1440, "height": 1050})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(WEB)
    expect(page.get_by_role("heading", name="ยินดีต้อนรับกลับมา")).to_be_visible()
    page.get_by_role("button", name="สมัครสมาชิก", exact=True).click()
    page.get_by_label("ชื่อผู้ใช้", exact=True).fill(username)
    page.get_by_label("อีเมล", exact=True).fill(f"{username}@example.com")
    page.get_by_label("รหัสผ่าน", exact=True).fill(password)
    page.get_by_role("button", name="สร้างบัญชี", exact=True).click()
    expect(page.get_by_role("heading", name="ภาพรวมการเรียนรู้")).to_be_visible(
        timeout=15000
    )
    token = page.evaluate("localStorage.getItem('rov_token')")
    headers = {"Authorization": "Bearer " + token}
    with httpx.Client(base_url=API, headers=headers, trust_env=False) as api:
        user = api.get("/auth/me").json()
        assert user["is_admin"], "E2E นี้ต้องรันกับ DB ใหม่เพื่อให้บัญชีแรกเป็น admin"
        assert api.get("/stats/").json()["total"] == 184
        expect(page.get_by_text("184", exact=True).first).to_be_visible()
        expect(page.locator(".recharts-pie-sector")).to_have_count(4)
        page.screenshot(path=str(output / "dashboard-desktop.png"), full_page=True)
        passed(
            "Unauthenticated redirect → register first admin → JWT → Dashboard 184 questions"
        )

        page.get_by_role("link", name="คลังข้อสอบ", exact=True).click()
        expect(page.get_by_role("heading", name="คลังข้อสอบ", exact=True)).to_be_visible()
        page.get_by_label("เลือกสถานะ").select_option("ambiguous")
        expect(page.get_by_text("3 ข้อในรายการ", exact=True)).to_be_visible()
        page.get_by_label("เลือกสถานะ").select_option("")
        page.get_by_label("เลือกบท").select_option("38")
        button = page.get_by_role("button", name="ดูบท 38 ข้อ 1")
        expect(button).to_be_visible()
        button.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        q = api.get("/questions/38/1").json()
        dialog.get_by_role("button", name="แก้ไข", exact=True).click()
        dialog.locator("button.option").nth((q["answer_idx"] + 1) % 4).click()
        dialog.locator("textarea").fill("E2E: ทดสอบแก้เฉลยบน DB ทดสอบ")
        dialog.get_by_role("button", name="บันทึกคำตอบ", exact=True).click()
        expect(dialog.get_by_role("button", name="แก้ไข", exact=True)).to_be_visible()
        assert not api.get("/questions/38/1").json()["verified"]
        dialog.get_by_role("button", name="ตรวจสอบแล้ว", exact=True).click()
        expect(
            dialog.get_by_role("button", name="ตรวจสอบแล้ว", exact=True)
        ).to_be_disabled()
        dialog.get_by_role("button", name="ปิด", exact=True).click()
        passed(
            "Questions filter, detail modal, admin edits answer, verification reset and re-verify"
        )

        page.get_by_role("link", name="ฝึกทำควิซ", exact=True).click()
        page.get_by_label("บทเรียน", exact=True).select_option("30")
        page.get_by_label("จำนวนข้อ", exact=True).fill("3")
        page.get_by_role("button", name="เริ่มทำควิซ", exact=True).click()
        questions = api.get("/questions/?chapter=30").json()
        for i in range(3):
            options = page.locator("button.option")
            expect(options).to_have_count(4)
            text = page.locator("h2").inner_text()
            q = next(q for q in questions if q["question"] == text)
            index = (q["answer_idx"] + 1) % 4 if i == 0 else q["answer_idx"]
            options.nth(index).click()
            next_button = page.get_by_role(
                "button", name="ดูผลคะแนน" if i == 2 else "ข้อถัดไป", exact=True
            )
            expect(next_button).to_be_visible()
            next_button.click()
        expect(page.get_by_role("heading", name="จบรอบนี้แล้ว!")).to_be_visible()
        expect(
            page.get_by_role("heading", name="ทบทวนข้อที่ตอบผิด / ยังไม่ได้ตอบ (1)")
        ).to_be_visible()
        assert api.get("/quiz/history").json()[0]["score"] == 2
        page.screenshot(path=str(output / "quiz-summary.png"), full_page=True)
        passed(
            "Quiz 3 questions, immediate answer feedback, final score 2/3 and wrong answer review"
        )

        page.get_by_role("button", name="เล่นอีกครั้ง", exact=True).click()
        page.get_by_label("จำนวนข้อ", exact=True).fill("2")
        page.get_by_label("เวลาต่อข้อ", exact=True).select_option("15")
        page.get_by_role("button", name="เริ่มทำควิซ", exact=True).click()
        expect(page.get_by_text("หมดเวลาในข้อนี้", exact=True)).to_be_visible(
            timeout=20000
        )
        page.get_by_role("button", name="ข้อถัดไป", exact=True).click()
        page.wait_for_timeout(2000)
        expect(page.locator("button.option").first).to_be_enabled()
        expect(page.get_by_text("หมดเวลาในข้อนี้", exact=True)).to_have_count(0)
        page.locator("button.option").first.click()
        page.get_by_role("button", name="ดูผลคะแนน", exact=True).click()
        expect(page.get_by_role("heading", name="จบรอบนี้แล้ว!")).to_be_visible()
        passed("Timed quiz timeout submits null; next question receives a fresh timer")

        page.get_by_role("link", name="ควบคุมบอท", exact=True).click()
        expect(page.get_by_label("โหมด", exact=True)).to_be_visible()
        page.get_by_text("30 · MOBA101", exact=True).click()
        page.get_by_label("Delay (วินาที)", exact=True).fill("2")
        page.get_by_role("button", name="Start", exact=True).click()
        expect(page.get_by_text("[DEMO] บท 30 ข้อ 1:", exact=False)).to_be_visible(
            timeout=20000
        )
        expect(
            page.get_by_text("Demo เสร็จแล้ว · ส่งคำตอบ 3 ข้อ", exact=True)
        ).to_be_visible(timeout=20000)
        assert api.get("/bot/runs").json()[0]["status"] == "success"
        assert page.locator(".terminal-line").count() >= 5
        page.screenshot(path=str(output / "bot-console.png"), full_page=True)
        passed(
            "UI Start → Redis → Celery → real Chromium demo → WebSocket logs → success"
        )

        page.get_by_text("31 · เลน", exact=True).click()
        page.get_by_label("Delay (วินาที)", exact=True).fill("4")
        page.get_by_role("button", name="Start", exact=True).click()
        expect(page.get_by_text("[DEMO] บท 30 ข้อ 1:", exact=False)).to_be_visible(
            timeout=20000
        )
        page.get_by_role("button", name="Stop", exact=True).click()
        expect(page.get_by_text("หยุดงานแล้วและปิด browser", exact=True)).to_be_visible(
            timeout=15000
        )
        assert api.get("/bot/runs").json()[0]["status"] == "cancelled"
        passed(
            "Running bot Stop → cooperative cancellation → browser closes → cancelled"
        )

        page.get_by_role("link", name="ตั้งค่าระบบ", exact=True).click()
        expect(page.get_by_role("heading", name="ตั้งค่าระบบ", exact=True)).to_be_visible()
        assert api.get("/settings/status").json()["redis"]
        page.locator("input[type=file]").set_input_files(
            str(ROOT / "data/RoV_Academy_Answers_แก้ชีส.xlsx")
        )
        expect(
            page.get_by_text("นำเข้าสำเร็จ: เพิ่ม 0 ข้อ · ข้ามข้อมูลเดิม 184 ข้อ", exact=False)
        ).to_be_visible()
        page.get_by_role("button", name="ล้างข้อมูลข้อสอบ/ควิซ", exact=True).click()
        expect(
            page.get_by_role("button", name="ยืนยันการล้างข้อมูล", exact=True)
        ).to_be_disabled()
        page.get_by_role("button", name="ยกเลิก", exact=True).click()
        passed(
            "Settings live DB/Redis health, browser Excel upload and danger confirmation guard"
        )

        page.set_viewport_size({"width": 390, "height": 844})
        for path, title in [
            ("/", "ภาพรวมการเรียนรู้"),
            ("/questions", "คลังข้อสอบ"),
            ("/quiz", "ฝึกทำควิซ"),
            ("/bot", "ควบคุมบอท"),
            ("/settings", "ตั้งค่าระบบ"),
        ]:
            page.goto(WEB + path)
            expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()
            assert page.evaluate(
                "document.documentElement.scrollWidth <= window.innerWidth"
            ), f"Horizontal overflow: {path}"
            page.screenshot(
                path=str(output / f'mobile-{path.strip("/") or "dashboard"}.png'),
                full_page=True,
            )
        page.get_by_role("button", name="เปิดเมนู", exact=True).click()
        expect(page.locator(".sidebar")).to_be_in_viewport()
        passed(
            "390px mobile: all five authenticated pages fit viewport, navigation menu works"
        )
        assert not errors, errors
        passed("No browser JavaScript runtime errors")
    context.close()
    browser.close()

(output / "browser-e2e-results.txt").write_text("\n".join(checks), encoding="utf-8")
print(f"ผ่าน browser E2E ทั้งหมด {len(checks)} กลุ่ม", flush=True)

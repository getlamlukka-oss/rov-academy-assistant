"""Playwright browser flows with per-user storage state and verified Academy transitions."""

import html
import os
from contextlib import contextmanager
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from backend.config import ACADEMY_BASE, academy_storage_for
from worker.auth import selector
from worker.matcher import match_question, option_index


class AcademyFlowError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(f"{code}: {message}")


@contextmanager
def browser_session(headless=True, user_id=None, use_state=True):
    storage = academy_storage_for(user_id) if user_id is not None else None
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=headless,
            executable_path=os.getenv("PLAYWRIGHT_EXECUTABLE_PATH") or None,
        )
        try:
            context = browser.new_context(
                storage_state=str(storage) if storage and storage.exists() and use_state else None
            )
            context.set_default_timeout(15000)
            context.set_default_navigation_timeout(30000)
            try:
                yield context, context.new_page()
            finally:
                context.close()
        finally:
            browser.close()


def _visible(page, css):
    loc = page.locator(css)
    return bool(loc.count() and loc.first.is_visible())


def _assert_not_logged_out(page):
    login_path = os.getenv("ACADEMY_LOGIN_PATH", "/login").rstrip("/")
    if login_path and login_path in page.url.rstrip("/"):
        raise AcademyFlowError("SESSION_EXPIRED", "Academy redirect กลับหน้า login")


def demo_chapter(page, rows, events, delay):
    completed = 0
    for q in rows:
        events.check()
        options = "".join(
            f'<label><input type="radio" name="answer" value="{i}"/> <span data-option>{html.escape(value)}</span></label><br/>'
            for i, value in enumerate(q.options)
        )
        page.set_content(
            f'<main><h1 data-question>{html.escape(q.question)}</h1><form id="quiz">{options}<button type="submit" data-submit>Submit</button></form><p id="result"></p></main>'
        )
        page.evaluate("""() => document.querySelector('#quiz').addEventListener('submit', e => {
          e.preventDefault(); const selected=document.querySelector('input:checked');
          document.querySelector('#result').textContent=selected ? selected.value : 'missing';
        })""")
        matched = match_question(page.locator("[data-question]").inner_text(), rows)
        index = option_index(matched, page.locator("[data-option]").all_inner_texts())
        page.locator("input[type=radio]").nth(index).check()
        page.locator("[data-submit]").click()
        if page.locator("#result").inner_text() != str(q.answer_idx):
            raise AcademyFlowError("ANSWER_VERIFY_FAILED", "ทดสอบ browser เลือกคำตอบไม่ตรง")
        completed += 1
        events.log(f"[DEMO] บท {q.chapter_id} ข้อ {q.no}: เลือก {index + 1} และ Submit สำเร็จ")
        events.wait(delay)
    return completed


def academy_chapter(page, rows, chapter, events, delay):
    path = os.getenv("ACADEMY_CHAPTER_PATH", "/chapter/{chapter}/quiz").format(chapter=chapter)
    page.goto(ACADEMY_BASE + "/" + path.lstrip("/"), wait_until="domcontentloaded")
    _assert_not_logged_out(page)
    question_sel = selector("SEL_QUESTION", "[data-question]")
    options_sel = selector("SEL_OPTIONS", "[data-option]")
    complete_sel = selector("SEL_COMPLETE", "[data-complete]")
    submit_sel = selector("SEL_SUBMIT", "button[data-submit]")
    next_sel = selector("SEL_NEXT", "button[data-next]")
    seen, completed = set(), 0

    for _ in range(len(rows)):
        events.check()
        _assert_not_logged_out(page)
        if _visible(page, complete_sel):
            return completed
        if not page.locator(question_sel).count():
            raise AcademyFlowError("SELECTOR_CHANGED", f"ไม่พบ question selector: {question_sel}")
        text = page.locator(question_sel).first.inner_text().strip()
        try:
            q = match_question(text, rows)
        except ValueError as exc:
            raise AcademyFlowError("QUESTION_NOT_FOUND", str(exc)) from exc
        if q.id in seen:
            raise AcademyFlowError("QUESTION_STUCK", "Academy ยังแสดงโจทย์เดิม")
        if q.source_type == "กำกวม" and not q.verified:
            raise AcademyFlowError("ANSWER_UNVERIFIED", f"บท {chapter} ข้อ {q.no} กำกวม")
        seen.add(q.id)
        options = page.locator(options_sel)
        if not options.count():
            raise AcademyFlowError("SELECTOR_CHANGED", f"ไม่พบ option selector: {options_sel}")
        try:
            index = option_index(q, options.all_inner_texts())
        except ValueError as exc:
            raise AcademyFlowError("OPTION_NOT_FOUND", str(exc)) from exc
        options.nth(index).click()
        if not page.locator(submit_sel).count():
            raise AcademyFlowError("SELECTOR_CHANGED", f"ไม่พบ submit selector: {submit_sel}")
        page.locator(submit_sel).first.click()
        events.log(f"บท {chapter} ข้อ {q.no}: ส่งตัวเลือก {index + 1}; กำลังตรวจผลจาก Academy")
        events.wait(delay)
        _assert_not_logged_out(page)

        # A submit is counted only after observable Academy progress: completion or question change.
        if _visible(page, complete_sel):
            completed += 1
            events.log(f"บท {chapter} ข้อ {q.no}: Academy ยืนยัน completion")
            return completed
        next_button = page.locator(next_sel)
        if next_button.count() and next_button.first.is_visible():
            next_button.first.click()
        try:
            page.wait_for_function(
                """({question, complete, previous}) => {
                  const done=document.querySelector(complete);
                  if(done && done.getClientRects().length) return true;
                  const q=document.querySelector(question);
                  return q && q.innerText.trim() !== previous.trim();
                }""",
                arg={"question": question_sel, "complete": complete_sel, "previous": text},
            )
        except PlaywrightTimeoutError as exc:
            raise AcademyFlowError("SUBMIT_NOT_VERIFIED", "Submit แล้วแต่ไม่พบ completion หรือคำถามใหม่") from exc
        _assert_not_logged_out(page)
        completed += 1
        events.log(f"บท {chapter} ข้อ {q.no}: ตรวจพบ Academy progress แล้ว")

    if not _visible(page, complete_sel):
        raise AcademyFlowError("CHAPTER_NOT_COMPLETE", "ครบจำนวนข้อใน DB แต่ Academy ยังไม่แสดง completion")
    return completed

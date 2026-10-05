"""สถานะงานใน DB เป็นแหล่งจริง; stop ไม่ฆ่า process กลาง transaction"""

import logging
from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import select
from backend.database import SessionLocal, init_db
from backend.models import BotRun, Question, utcnow
from backend.quiz import lock_write
from backend.config import env_bool, academy_storage_for, REDIS_URL
from worker.celery_app import celery_app
from worker.events import Events, Cancelled
from worker.browser import browser_session, demo_chapter, academy_chapter
from worker.auth import ensure_login
from worker.session_lock import academy_session_lock

logger = logging.getLogger(__name__)


def claim(task_id):
    init_db()
    with SessionLocal() as db:
        lock_write(db)
        run = db.scalar(select(BotRun).where(BotRun.task_id == task_id))
        if run is None or run.status != "queued":
            db.rollback()
            return False
        run.status = "running"
        db.commit()
        return True


def finish(task_id, status, result):
    with SessionLocal() as db:
        lock_write(db)
        run = db.scalar(select(BotRun).where(BotRun.task_id == task_id))
        if run:
            if run.status in {"stopping", "cancelled"}:
                status = "cancelled"
            run.status = status
            run.result = {**run.result, **result}
            run.finished_at = utcnow()
            db.commit()


def execute(task_id, operation):
    if not claim(task_id):
        return {"status": "cancelled"}
    events = Events(task_id)
    try:
        events.check()
        result = operation(events)
        events.check()
        finish(task_id, "success", result)
        events.log("งานเสร็จสมบูรณ์", "success")
        return result
    except Cancelled:
        finish(task_id, "cancelled", {"message": "หยุดงานตามคำสั่งผู้ใช้"})
        events.log("หยุดงานแล้วและปิด browser", "warning")
        return {"status": "cancelled"}
    except Exception as error:
        # ไม่เผย Playwright trace ที่อาจมี credential; อ่านรายละเอียดเฉพาะเครื่อง worker
        safe = (
            str(error)
            if isinstance(error, ValueError)
            else f"{type(error).__name__}: งานล้มเหลว ตรวจ browser/selector/Redis และ log ที่เครื่อง worker"
        )
        finish(task_id, "failed", {"error": safe})
        try:
            events.log(safe, "error")
        except Exception:
            logger.error("ไม่สามารถเผยแพร่ log ของงาน %s", task_id)
        return {"status": "failed", "error": safe}


@celery_app.task(bind=True, name="worker.tasks.run_auto_answer")
def run_auto_answer(self, chapters, headless, delay, user_id, mode="demo"):
    def operation(events):
        if mode not in {"demo", "academy"} or not 2 <= delay <= 4:
            raise ValueError("ตั้งค่าบอทไม่ถูกต้อง")
        if mode == "academy" and not academy_storage_for(user_id).exists():
            raise ValueError("SESSION_MISSING: กรุณาสร้าง Academy session ของผู้ใช้นี้ก่อน")
        events.log(f"เริ่มโหมด {mode.upper()} / {len(chapters)} บท")
        with SessionLocal() as db:
            rows = db.scalars(
                select(Question)
                .where(Question.chapter_id.in_(chapters))
                .order_by(Question.chapter_id, Question.no)
            ).all()
        results = []
        def run_browser():
            with browser_session(headless, user_id=user_id, use_state=mode == "academy") as (context, page):
                if mode == "academy": ensure_login(page, context, user_id, events)
                for chapter in chapters:
                    selected = [q for q in rows if q.chapter_id == chapter]
                    if not selected: raise ValueError(f"ไม่มีข้อสอบบท {chapter}")
                    events.check()
                    events.log(f"เริ่มบท {chapter}: {selected[0].chapter_name} ({len(selected)} ข้อ)")
                    count = demo_chapter(page, selected, events, delay) if mode == "demo" else academy_chapter(page, selected, chapter, events, delay)
                    results.append({"chapter_id": chapter, "submitted": count})
        if mode == "academy":
            with academy_session_lock(user_id): run_browser()
        else: run_browser()
        return {
            "mode": mode,
            "chapters": results,
            "submitted": sum(x["submitted"] for x in results),
            "academy_verified": mode == "academy",
        }

    return execute(self.request.id, operation)


@celery_app.task(bind=True, name="worker.tasks.login_academy")
def login_academy(self, user_id):
    def operation(events):
        with academy_session_lock(user_id):
            with browser_session(headless=False, user_id=user_id, use_state=False) as (context, page):
                ensure_login(page, context, user_id, events, force=True)
        return {"session_saved": True}

    return execute(self.request.id, operation)

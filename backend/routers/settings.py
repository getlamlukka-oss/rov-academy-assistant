"""ตรวจสุขภาพและคำสั่งล้างข้อมูลที่ต้องยืนยันข้อความบนเว็บ"""

from fastapi import APIRouter, Depends, HTTPException
from redis import Redis, RedisError
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session
from backend.auth import current_user, admin_user
from backend.config import REDIS_URL, ACADEMY_STORAGE
from backend.database import get_db
from backend.models import BotRun, Question, QuizSession, User
from backend.schemas import DangerIn, UserOut
from backend.quiz import lock_write

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/status")
def status(_=Depends(current_user), db: Session = Depends(get_db)):
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    try:
        redis_ok = bool(
            Redis.from_url(REDIS_URL, socket_connect_timeout=1, socket_timeout=1).ping()
        )
    except RedisError:
        redis_ok = False
    # ไฟล์ state มีอยู่ไม่ได้รับประกันว่ายังล็อกอินอยู่จริง
    return {
        "database": db_ok,
        "redis": redis_ok,
        "academy_session": "saved_unchecked" if ACADEMY_STORAGE.exists() else "missing",
        "academy_saved_at": (
            ACADEMY_STORAGE.stat().st_mtime if ACADEMY_STORAGE.exists() else None
        ),
    }


@router.get("/users", response_model=list[UserOut])
def users(_=Depends(admin_user), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.id)).all()


@router.delete("/data")
def clear_data(data: DangerIn, _=Depends(admin_user), db: Session = Depends(get_db)):
    if data.confirmation != "DELETE DATA":
        raise HTTPException(400, "กรุณายืนยันด้วย DELETE DATA")
    lock_write(db)
    if db.scalar(
        select(BotRun).where(BotRun.status.in_(["queued", "running", "stopping"]))
    ):
        raise HTTPException(409, "หยุดบอทก่อนล้างข้อมูล")
    db.execute(delete(QuizSession))
    db.execute(delete(Question))
    db.commit()
    return {"cleared": True}


@router.delete("/academy-session")
def clear_session(data: DangerIn, _=Depends(admin_user), db: Session = Depends(get_db)):
    if data.confirmation != "DELETE SESSION":
        raise HTTPException(400, "กรุณายืนยันด้วย DELETE SESSION")
    lock_write(db)
    if db.scalar(
        select(BotRun).where(BotRun.status.in_(["queued", "running", "stopping"]))
    ):
        raise HTTPException(409, "หยุดบอทก่อนล้าง session")
    ACADEMY_STORAGE.unlink(missing_ok=True)
    db.commit()
    return {"cleared": True}

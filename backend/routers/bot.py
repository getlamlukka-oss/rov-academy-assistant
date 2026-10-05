"""ควบคุม queue โดยบันทึก run ก่อนส่งงานและตรวจเจ้าของทุก endpoint"""

from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from redis import Redis, RedisError
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.config import REDIS_URL, academy_storage_for
from backend.auth import current_user, admin_user
from backend.database import get_db
from backend.models import BotRun, Question, utcnow
from backend.schemas import BotStart, RunOut
from backend.quiz import lock_write
from worker.tasks import run_auto_answer, login_academy
from worker.celery_app import celery_app

router = APIRouter(prefix="/bot", tags=["Bot"])


def own_run(db, task_id, user):
    run = db.scalar(select(BotRun).where(BotRun.task_id == task_id))
    if run is None or (run.started_by != user.id and not user.is_admin):
        raise HTTPException(404, "ไม่พบงาน")
    return run


def queue_run(db, user, chapters, task, kwargs):
    try:
        Redis.from_url(REDIS_URL, socket_connect_timeout=2, socket_timeout=2).ping()
    except RedisError:
        raise HTTPException(503, "เชื่อมต่อ Redis ไม่ได้ กรุณาเปิด Redis")
    lock_write(db)
    active = db.scalar(
        select(BotRun).where(BotRun.status.in_(["queued", "running", "stopping"]))
    )
    if active:
        raise HTTPException(409, "มีงานกำลังทำงานอยู่ กรุณารอหรือหยุดงานก่อน")
    run = BotRun(
        task_id=str(uuid4()),
        chapters=chapters,
        started_by=user.id,
        status="queued",
        result={"mode": kwargs.get("mode", "login")},
    )
    db.add(run)
    db.commit()
    try:
        task.apply_async(kwargs=kwargs, task_id=run.task_id)
    except Exception:
        run.status = "failed"
        run.finished_at = utcnow()
        run.result = {"error": "ส่งงานเข้า queue ไม่สำเร็จ"}
        db.commit()
        raise HTTPException(503, "ส่งงานเข้า queue ไม่สำเร็จ")
    return run


@router.post("/start", response_model=RunOut)
def start(data: BotStart, user=Depends(current_user), db: Session = Depends(get_db)):
    chapters = sorted(set(data.chapters))
    valid = set(db.scalars(select(Question.chapter_id).distinct()).all())
    if not set(chapters).issubset(valid):
        raise HTTPException(400, "มีบทที่ไม่อยู่ในฐานข้อมูล")
    return queue_run(
        db,
        user,
        chapters,
        run_auto_answer,
        dict(
            chapters=chapters,
            headless=data.headless,
            delay=data.delay,
            user_id=user.id,
            mode=data.mode,
        ),
    )


@router.post("/academy-login", response_model=RunOut)
def academy_login(user=Depends(current_user), db: Session = Depends(get_db)):
    return queue_run(db, user, [], login_academy, {"user_id": user.id})


@router.get("/academy-session")
def academy_session(user=Depends(current_user)):
    path = academy_storage_for(user.id)
    if not path.exists(): return {"exists": False, "user_id": user.id}
    stat = path.stat()
    return {"exists": True, "user_id": user.id, "updated_at": stat.st_mtime, "size": stat.st_size}


@router.post("/stop/{task_id}", response_model=RunOut)
def stop(task_id: str, user=Depends(current_user), db: Session = Depends(get_db)):
    lock_write(db)
    run = own_run(db, task_id, user)
    if run.status not in {"queued", "running", "stopping"}:
        return run
    try:
        Redis.from_url(REDIS_URL, socket_timeout=2).setex(
            f"rov:cancel:{task_id}", 86400, "1"
        )
        if run.status == "queued":
            celery_app.control.revoke(task_id, terminate=False)
            run.status = "cancelled"
            run.finished_at = utcnow()
        else:
            run.status = "stopping"
        db.commit()
    except RedisError:
        raise HTTPException(503, "Redis ไม่พร้อม ไม่สามารถหยุดงานได้")
    return run


@router.get("/runs", response_model=list[RunOut])
def runs(user=Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(BotRun).order_by(BotRun.id.desc()).limit(50)
    if not user.is_admin:
        stmt = stmt.where(BotRun.started_by == user.id)
    return db.scalars(stmt).all()


@router.get("/status/{task_id}", response_model=RunOut)
def status(task_id: str, user=Depends(current_user), db: Session = Depends(get_db)):
    return own_run(db, task_id, user)

"""ควิซและประวัติจำกัดเฉพาะเจ้าของ session"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.auth import current_user
from backend.database import get_db
from backend.models import QuizSession
from backend.schemas import QuizStart, QuizAnswer
from backend import quiz

router = APIRouter(prefix="/quiz", tags=["Quiz"])


@router.post("/start")
def start(data: QuizStart, user=Depends(current_user), db: Session = Depends(get_db)):
    return quiz.start_session(db, user.id, data)


@router.post("/answer")
def answer(data: QuizAnswer, user=Depends(current_user), db: Session = Depends(get_db)):
    return quiz.submit_answer(db, user.id, data)


@router.get("/history")
def history(user=Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(QuizSession)
        .where(QuizSession.user_id == user.id)
        .order_by(QuizSession.started_at.desc())
        .limit(50)
    ).all()
    return [
        dict(
            session_id=s.id,
            score=s.score,
            total=s.total,
            started_at=s.started_at,
            finished_at=s.finished_at,
        )
        for s in rows
    ]


@router.get("/summary/{session_id}")
def summary(session_id: str, user=Depends(current_user), db: Session = Depends(get_db)):
    return quiz.summary(quiz.owned_session(db, session_id, user.id))


@router.post("/end/{session_id}")
def end(session_id: str, user=Depends(current_user), db: Session = Depends(get_db)):
    return quiz.end_session(db, user.id, session_id)

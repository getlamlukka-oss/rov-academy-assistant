"""สถิติจาก DB จริงและใช้สถานะที่ไม่ซ้อนกัน"""

from collections import Counter, defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from backend.auth import current_user
from backend.database import get_db
from backend.models import Question, QuizSession
from backend.crud import question_status

router = APIRouter(
    prefix="/stats", tags=["Stats"], dependencies=[Depends(current_user)]
)


@router.get("/")
def stats(db: Session = Depends(get_db), user=Depends(current_user)):
    questions = db.scalars(select(Question)).all()
    counts = Counter(question_status(q) for q in questions)
    sessions = db.scalars(
        select(QuizSession).where(
            QuizSession.user_id == user.id, QuizSession.finished_at.is_not(None)
        )
    ).all()
    return {
        "total": len(questions),
        "chapters": len({q.chapter_id for q in questions}),
        "verified": counts["verified"],
        "ambiguous": counts["ambiguous"],
        "analyzed": counts["analyzed"],
        "reference": counts["reference"],
        "quiz_played": len(sessions),
        "quiz_average": (
            round(sum(s.score / s.total * 100 for s in sessions) / len(sessions), 1)
            if sessions
            else 0
        ),
    }


@router.get("/chapters")
def chapters(db: Session = Depends(get_db)):
    result = {}
    for q in db.scalars(select(Question).order_by(Question.chapter_id, Question.no)):
        item = result.setdefault(
            q.chapter_id,
            {
                "chapter_id": q.chapter_id,
                "chapter_name": q.chapter_name,
                "total": 0,
                "verified": 0,
                "ambiguous": 0,
                "analyzed": 0,
                "reference": 0,
            },
        )
        item["total"] += 1
        item[question_status(q)] += 1
    return list(result.values())

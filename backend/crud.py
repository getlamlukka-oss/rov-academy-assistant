"""ฟังก์ชันค้นข้อสอบและแปลงสถานะให้ใช้ร่วมกันทุกหน้า"""

from sqlalchemy import select
from backend.models import Question


def question_status(q):
    if q.verified:
        return "verified"
    if q.source_type == "กำกวม":
        return "ambiguous"
    if q.source_type == "วิเคราะห์จากบทเรียน":
        return "analyzed"
    return "reference"


def list_questions(db, chapter=None, status=None, search=None):
    stmt = select(Question).order_by(Question.chapter_id, Question.no)
    if chapter is not None:
        stmt = stmt.where(Question.chapter_id == chapter)
    if search:
        stmt = stmt.where(Question.question.contains(search, autoescape=True))
    rows = db.scalars(stmt).all()
    return [q for q in rows if not status or question_status(q) == status]

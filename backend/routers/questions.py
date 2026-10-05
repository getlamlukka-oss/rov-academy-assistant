"""อ่านข้อสอบได้เมื่อเข้าสู่ระบบ; การเปลี่ยนคำตอบจะยกเลิกสถานะ verified"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select
from sqlalchemy.orm import Session
from pathlib import Path
import tempfile
from backend.auth import current_user, admin_user
from backend.database import get_db
from backend.models import Question
from backend.schemas import QuestionOut, QuestionUpdate
from backend.crud import list_questions
from backend.importer import clean_workbook, import_records

router = APIRouter(
    prefix="/questions", tags=["Questions"], dependencies=[Depends(current_user)]
)


@router.get("/", response_model=list[QuestionOut])
def listing(
    chapter: int | None = None,
    status: str | None = Query(
        None, pattern="^(verified|ambiguous|analyzed|reference)$"
    ),
    search: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
):
    return list_questions(db, chapter, status, search)


@router.post("/import")
def upload(
    file: UploadFile = File(...), db: Session = Depends(get_db), _=Depends(admin_user)
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(400, "กรุณาเลือกไฟล์ .xlsx")
    content = file.file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "ไฟล์ต้องไม่เกิน 10 MB")
    try:
        with tempfile.NamedTemporaryFile(suffix=".xlsx") as tmp:
            tmp.write(content)
            tmp.flush()
            records = clean_workbook(Path(tmp.name))
        return import_records(db, records)
    except Exception as error:
        db.rollback()
        raise HTTPException(400, f"นำเข้าไม่ได้: {error}")


@router.get("/{chapter}/{no}", response_model=QuestionOut)
def detail(chapter: int, no: int, db: Session = Depends(get_db)):
    q = db.scalar(
        select(Question).where(Question.chapter_id == chapter, Question.no == no)
    )
    if q is None:
        raise HTTPException(404, "ไม่พบข้อสอบ")
    return q


@router.put("/{id}", response_model=QuestionOut)
def update(
    id: int, data: QuestionUpdate, db: Session = Depends(get_db), _=Depends(admin_user)
):
    q = db.get(Question, id)
    if q is None:
        raise HTTPException(404, "ไม่พบข้อสอบ")
    if q.answer_idx != data.answer_idx:
        q.verified = False
        q.source_type = "วิเคราะห์จากบทเรียน"
    q.answer_idx = data.answer_idx
    q.answer_text = q.options[data.answer_idx]
    q.note = data.note
    db.commit()
    return q


@router.patch("/{id}/verify", response_model=QuestionOut)
def verify(id: int, db: Session = Depends(get_db), _=Depends(admin_user)):
    q = db.get(Question, id)
    if q is None:
        raise HTTPException(404, "ไม่พบข้อสอบ")
    q.verified = True
    db.commit()
    return q


@router.delete("/{id}")
def delete(id: int, db: Session = Depends(get_db), _=Depends(admin_user)):
    q = db.get(Question, id)
    if q is None:
        raise HTTPException(404, "ไม่พบข้อสอบ")
    db.delete(q)
    db.commit()
    return {"deleted": id}

"""ตรวจคะแนนบน server; ล็อก transaction กันตอบซ้ำและไม่เผยเฉลยก่อนตอบ"""

import random
from fastapi import HTTPException
from sqlalchemy import select, text
from backend.models import Question, QuizSession, utcnow


def lock_write(db):
    # เริ่ม transaction ใหม่ก่อนอ่าน/แก้ session เพื่อกัน request พร้อมกัน
    db.rollback()
    if db.bind.dialect.name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))


def owned_session(db, session_id, user_id):
    session = db.get(QuizSession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(404, "ไม่พบควิซ")
    return session


def start_session(db, user_id, payload):
    stmt = select(Question)
    if payload.chapters:
        stmt = stmt.where(Question.chapter_id.in_(payload.chapters))
    rows = list(db.scalars(stmt).all())
    if not rows:
        raise HTTPException(400, "ไม่มีข้อสอบในบทที่เลือก")
    selected = random.SystemRandom().sample(rows, min(payload.count, len(rows)))
    snapshots = [
        dict(
            id=q.id,
            chapter_id=q.chapter_id,
            chapter_name=q.chapter_name,
            no=q.no,
            question=q.question,
            options=q.options,
            answer_idx=q.answer_idx,
            answer_text=q.answer_text,
            note=q.note,
            source_type=q.source_type,
            verified=q.verified,
        )
        for q in selected
    ]
    session = QuizSession(
        user_id=user_id,
        chapters=payload.chapters,
        question_ids=[q.id for q in selected],
        snapshots=snapshots,
        answers={},
        score=0,
        total=len(selected),
    )
    db.add(session)
    db.commit()
    public = [
        {k: v for k, v in q.items() if k not in {"answer_idx", "answer_text", "note"}}
        for q in snapshots
    ]
    return {"session_id": session.id, "questions": public, "total": session.total}


def submit_answer(db, user_id, payload):
    lock_write(db)
    session = owned_session(db, payload.session_id, user_id)
    if session.finished_at:
        raise HTTPException(409, "ควิซจบแล้ว")
    q = next((q for q in session.snapshots if q["id"] == payload.question_id), None)
    if q is None:
        raise HTTPException(400, "ข้อนี้ไม่อยู่ในควิซ")
    key = str(q["id"])
    if key in session.answers:
        raise HTTPException(409, "ตอบข้อนี้ไปแล้ว")
    expected = session.question_ids[len(session.answers)]
    if expected != q["id"]:
        raise HTTPException(409, "กรุณาตอบตามลำดับ")
    correct = payload.answer_idx == q["answer_idx"]
    result = dict(
        question_id=q["id"],
        selected_idx=payload.answer_idx,
        correct=correct,
        answer_idx=q["answer_idx"],
        answer_text=q["answer_text"],
        note=q["note"],
        source_type=q["source_type"],
        verified=q["verified"],
    )
    session.answers = {**session.answers, key: result}
    session.score += int(correct)
    db.commit()
    return result


def summary(session):
    wrong = []
    for q in session.snapshots:
        answer = session.answers.get(str(q["id"]))
        if answer is None or not answer["correct"]:
            wrong.append(
                {
                    **q,
                    "selected_idx": answer["selected_idx"] if answer else None,
                    "unanswered": answer is None,
                }
            )
    finished = session.finished_at is not None
    return {
        "session_id": session.id,
        "score": session.score,
        "total": session.total,
        "answered": len(session.answers),
        "finished": finished,
        "finished_at": session.finished_at,
        "wrong_answers": wrong if finished else [],
    }


def end_session(db, user_id, session_id):
    lock_write(db)
    session = owned_session(db, session_id, user_id)
    if not session.finished_at:
        session.finished_at = utcnow()
        db.commit()
    return summary(session)

"""ตารางข้อมูลหลัก; ควิซเก็บ snapshot เพื่อไม่ให้การแก้ข้อสอบเปลี่ยนคะแนนย้อนหลัง"""

from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (UniqueConstraint("chapter_id", "no"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    chapter_id: Mapped[int] = mapped_column(index=True)
    chapter_name: Mapped[str] = mapped_column(String(200))
    no: Mapped[int] = mapped_column(Integer)
    question: Mapped[str] = mapped_column(Text)
    options: Mapped[list] = mapped_column(JSON)
    answer_text: Mapped[str] = mapped_column(Text)
    answer_idx: Mapped[int] = mapped_column(Integer)  # ใช้ 0..3 ทุกส่วนของระบบ
    source_type: Mapped[str] = mapped_column(String(100))
    note: Mapped[str] = mapped_column(Text, default="")
    source_url: Mapped[str] = mapped_column(Text, default="")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(254))
    hashed_pw: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class BotRun(Base):
    __tablename__ = "bot_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    chapters: Mapped[list] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    started_by: Mapped[int] = mapped_column(ForeignKey("users.id"))


class QuizSession(Base):
    __tablename__ = "quiz_sessions"
    id: Mapped[str] = mapped_column(
        String(64), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    chapters: Mapped[list] = mapped_column(JSON)
    question_ids: Mapped[list] = mapped_column(JSON)
    snapshots: Mapped[list] = mapped_column(JSON)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

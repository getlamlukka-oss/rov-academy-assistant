"""ตรวจ payload และไม่ส่ง password hash ออกจาก API"""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9_\-.]+$")
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_bytes(cls, value):
        if len(value.encode()) > 72:
            raise ValueError("รหัสผ่านต้องไม่เกิน 72 bytes")
        return value

    @field_validator("email")
    @classmethod
    def valid_email(cls, value):
        if "@" not in value or "." not in value.split("@")[-1]:
            raise ValueError("อีเมลไม่ถูกต้อง")
        return value.strip().lower()


class LoginIn(BaseModel):
    username: str
    password: str = Field(max_length=72)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str
    is_admin: bool
    created_at: datetime


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    chapter_id: int
    chapter_name: str
    no: int
    question: str
    options: list[str]
    answer_text: str
    answer_idx: int
    source_type: str
    note: str
    source_url: str
    verified: bool
    created_at: datetime
    updated_at: datetime


class QuestionUpdate(BaseModel):
    answer_idx: int = Field(ge=0, le=3)
    note: str = Field(default="", max_length=10000)


class QuizStart(BaseModel):
    chapters: list[int] = Field(default_factory=list, max_length=100)
    count: int = Field(default=10, ge=1, le=184)


class QuizAnswer(BaseModel):
    session_id: str
    question_id: int
    answer_idx: int | None = Field(default=None, ge=0, le=3)


class BotStart(BaseModel):
    chapters: list[int] = Field(min_length=1, max_length=40)
    headless: bool = True
    delay: float = Field(default=3, ge=2, le=4)
    mode: Literal["demo", "academy"] = "demo"


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: str
    chapters: list[int]
    status: str
    started_at: datetime
    finished_at: datetime | None
    result: dict
    started_by: int


class DangerIn(BaseModel):
    confirmation: str

"""สมาชิกคนแรกเป็น admin โดยล็อก SQLite ก่อนตรวจจำนวนสมาชิก"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from backend.auth import create_token, pwd, current_user
from backend.database import get_db
from backend.models import User
from backend.quiz import lock_write
from backend.schemas import RegisterIn, LoginIn, UserOut
from backend.rate_limit import limit

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: RegisterIn, request: Request, db: Session = Depends(get_db)):
    limit(request, "register", 5, 300)
    lock_write(db)
    count = db.scalar(select(func.count(User.id)))
    user = User(
        username=data.username.lower(),
        email=data.email,
        hashed_pw=pwd.hash(data.password),
        is_admin=count == 0,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "ชื่อผู้ใช้นี้ถูกใช้แล้ว")
    return user


@router.post("/login")
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    limit(request, "login", 10, 60)
    user = db.scalar(select(User).where(User.username == data.username.lower()))
    try:
        valid = user is not None and pwd.verify(data.password, user.hashed_pw)
    except ValueError:
        valid = False
    if not valid:
        raise HTTPException(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    return {
        "access_token": create_token(user),
        "token_type": "bearer",
        "user": UserOut.model_validate(user),
    }


@router.get("/me", response_model=UserOut)
def me(user=Depends(current_user)):
    return user

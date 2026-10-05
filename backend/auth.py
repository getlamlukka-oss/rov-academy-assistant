"""JWT มีวันหมดอายุและตรวจสิทธิ์จาก DB ทุกครั้ง"""

from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from backend import config
from backend.database import get_db
from backend.models import User

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def create_token(user):
    expires = datetime.now(timezone.utc) + timedelta(minutes=config.JWT_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user.id), "exp": expires, "iat": datetime.now(timezone.utc)},
        config.JWT_SECRET,
        algorithm=config.JWT_ALG,
    )


def token_user(token, db):
    try:
        claims = jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=[config.JWT_ALG],
            options={"require_exp": True, "require_sub": True},
        )
        user = db.get(User, int(claims["sub"]))
        if user is None:
            raise ValueError("user missing")
        return user
    except (JWTError, ValueError, TypeError, KeyError):
        raise HTTPException(
            401, "กรุณาเข้าสู่ระบบใหม่", headers={"WWW-Authenticate": "Bearer"}
        )


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(401, "กรุณาเข้าสู่ระบบ")
    return token_user(credentials.credentials, db)


def admin_user(user=Depends(current_user)):
    if not user.is_admin:
        raise HTTPException(403, "เฉพาะผู้ดูแลระบบ")
    return user

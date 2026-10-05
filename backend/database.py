"""SQLite แบบ WAL ลดปัญหาการเขียนพร้อมกันของ API และ worker"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from backend.config import DATABASE_URL

engine = create_engine(
    DATABASE_URL,
    connect_args=(
        {"check_same_thread": False, "timeout": 30}
        if DATABASE_URL.startswith("sqlite")
        else {}
    ),
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def sqlite_settings(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()


def get_db():
    with SessionLocal() as db:
        try:
            yield db
        except Exception:
            db.rollback()
            raise


def init_db():
    from backend import models  # โหลด models ก่อนสร้างตาราง

    Base.metadata.create_all(engine)

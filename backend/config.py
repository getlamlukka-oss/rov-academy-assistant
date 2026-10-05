"""อ่านค่าตั้งค่าโดยใช้ path เดียวกันทั้ง API และ worker"""

import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def env_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).lower() in {"true", "1", "yes"}


def local_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./rov.db")
if DATABASE_URL.startswith("sqlite:///") and not DATABASE_URL.endswith(":memory:"):
    DATABASE_URL = "sqlite:///" + str(local_path(DATABASE_URL[10:]))
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
ACADEMY_BASE = os.getenv("ACADEMY_BASE", "https://academy.rov.in.th").rstrip("/")
ACADEMY_STORAGE = local_path(os.getenv("ACADEMY_STORAGE", "./data/academy_sessions"))


def academy_storage_for(user_id: int) -> Path:
    """Return a dedicated Playwright storage-state path for one local app user."""
    base = ACADEMY_STORAGE
    # Backward-compatible: if a .json path was configured, use its parent as session directory.
    directory = base.parent / (base.stem + "_sessions") if base.suffix == ".json" else base
    return directory / f"user_{int(user_id)}.json"
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")


def validate_config():
    if len(JWT_SECRET) < 32 or JWT_SECRET.startswith("change_me"):
        raise RuntimeError(
            "กรุณารัน python scripts/setup_env.py หรือตั้ง JWT_SECRET แบบสุ่มอย่างน้อย 32 ตัวอักษร"
        )
    if JWT_ALG != "HS256":
        raise RuntimeError("ระบบนี้รองรับ JWT_ALG=HS256")

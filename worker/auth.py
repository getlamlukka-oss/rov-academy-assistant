"""ล็อกอินผ่าน selector ที่ตั้งค่าได้; captcha ใช้ผู้ใช้ล็อกอินเอง"""

import os
import time
from pathlib import Path
from backend.config import ACADEMY_BASE, academy_storage_for, env_bool


def selector(name, default):
    return os.getenv(name, default)


def save_state(context, user_id: int):
    storage = academy_storage_for(user_id)
    storage.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(str(storage) + ".tmp")
    context.storage_state(path=str(temporary))
    temporary.chmod(0o600)
    temporary.replace(storage)


def ensure_login(page, context, user_id: int, events=None, force=False):
    authenticated = selector("SEL_AUTHENTICATED", "[data-academy-user]")
    page.goto(
        ACADEMY_BASE + os.getenv("ACADEMY_LOGIN_PATH", "/login"),
        wait_until="domcontentloaded",
    )
    if (
        not force
        and page.locator(authenticated).count()
        and page.locator(authenticated).first.is_visible()
    ):
        return
    manual = env_bool("ACADEMY_MANUAL_LOGIN", True)
    if manual:
        if events:
            events.log("รอการล็อกอินในหน้าต่าง browser ของเครื่องที่รัน worker")
    else:
        raise ValueError("รองรับเฉพาะ manual login เพื่อไม่จัดเก็บรหัสผ่าน Academy")
    deadline = time.monotonic() + int(os.getenv("ACADEMY_LOGIN_TIMEOUT", "300"))
    while time.monotonic() < deadline:
        if events:
            events.check()
        if (
            page.locator(authenticated).count()
            and page.locator(authenticated).first.is_visible()
        ):
            save_state(context, user_id)
            if events:
                events.log("ล็อกอินสำเร็จและบันทึก Academy session แล้ว")
            return
        page.wait_for_timeout(500)
    raise ValueError(
        "ไม่พบสถานะล็อกอินภายในเวลาที่กำหนด ตรวจ SEL_AUTHENTICATED หรือทำ manual login ใหม่"
    )

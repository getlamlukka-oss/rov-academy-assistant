"""สร้าง .env ที่มี secret แบบสุ่มและไม่ทับค่าที่ผู้ใช้ตั้งไว้แล้ว"""

from pathlib import Path
import secrets

root = Path(__file__).resolve().parent.parent
path = root / ".env"
if path.exists():
    print(".env มีอยู่แล้ว ไม่เขียนทับ")
else:
    content = (
        (root / ".env.example")
        .read_text()
        .replace("change_me_to_random_long_string", secrets.token_hex(32))
    )
    path.write_text(content)
    path.chmod(0o600)
    print("สร้าง .env พร้อม JWT_SECRET แล้ว")

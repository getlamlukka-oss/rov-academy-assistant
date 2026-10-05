"""log แบบมี ID, เก็บย้อนหลัง 1000 บรรทัด 7 วัน และรองรับ cooperative stop"""

import json
import time
from uuid import uuid4
from redis import Redis
from backend.config import REDIS_URL
from backend.models import utcnow


class Cancelled(Exception):
    pass


class Events:
    def __init__(self, task_id):
        self.task_id = task_id
        self.redis = Redis.from_url(
            REDIS_URL, decode_responses=True, socket_connect_timeout=3, socket_timeout=3
        )

    def log(self, message, level="info"):
        value = json.dumps(
            {
                "id": str(uuid4()),
                "type": "log",
                "time": utcnow().isoformat(),
                "level": level,
                "message": message,
            },
            ensure_ascii=False,
        )
        pipe = self.redis.pipeline()
        key = f"rov:history:{self.task_id}"
        pipe.rpush(key, value)
        pipe.ltrim(key, -1000, -1)
        pipe.expire(key, 604800)
        pipe.publish(f"rov:logs:{self.task_id}", value)
        pipe.execute()

    def check(self):
        if self.redis.exists(f"rov:cancel:{self.task_id}"):
            raise Cancelled("หยุดงานตามคำสั่งผู้ใช้")

    def wait(self, seconds):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.check()
            time.sleep(min(0.2, max(0, deadline - time.monotonic())))

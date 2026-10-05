"""ใช้ prefork/concurrency=1 เพื่อให้ browser ปิดอย่างถูกต้องเมื่อจบงาน"""

from celery import Celery
from backend.config import REDIS_URL

celery_app = Celery(
    "rov_academy", broker=REDIS_URL, backend=REDIS_URL, include=["worker.tasks"]
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    task_track_started=True,
    result_expires=86400,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=3500,
    task_time_limit=3600,
    broker_transport_options={"visibility_timeout": 7200},
)

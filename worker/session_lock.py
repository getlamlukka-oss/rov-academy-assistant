"""Distributed lock so two workers cannot use one user's Academy session concurrently."""
import os
from contextlib import contextmanager
from redis import Redis
from redis.exceptions import LockError
from backend.config import REDIS_URL
class SessionBusyError(ValueError): pass
@contextmanager
def academy_session_lock(user_id:int):
    client=Redis.from_url(REDIS_URL,socket_connect_timeout=3,socket_timeout=3,decode_responses=True)
    lock=client.lock(f'rov:academy-session:{int(user_id)}',timeout=int(os.getenv('ACADEMY_SESSION_LOCK_TTL','3700')),blocking_timeout=int(os.getenv('ACADEMY_SESSION_LOCK_WAIT','2')))
    acquired=False
    try:
        acquired=lock.acquire(blocking=True)
        if not acquired: raise SessionBusyError('SESSION_BUSY: Academy session ของผู้ใช้นี้กำลังถูกใช้งานโดยงานอื่น')
        yield
    finally:
        if acquired:
            try: lock.release()
            except LockError: pass
        client.close()

"""Fixed-window limiter for sensitive authentication endpoints."""
from fastapi import HTTPException, Request
from redis import Redis, RedisError
from backend.config import REDIS_URL
def limit(request:Request,bucket:str,limit_count:int,window_seconds:int):
    host=request.client.host if request.client else 'unknown'; key=f'rov:rate:{bucket}:{host}'
    client=Redis.from_url(REDIS_URL,socket_connect_timeout=1,socket_timeout=1)
    try:
        count=client.incr(key)
        if count==1: client.expire(key,window_seconds)
        if count>limit_count: raise HTTPException(429,'ส่งคำขอถี่เกินไป กรุณารอสักครู่')
    except RedisError: return
    finally: client.close()

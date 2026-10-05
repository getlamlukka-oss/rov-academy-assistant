"""ทดสอบ WebSocket/Redis จริงกับ server และ DB ทดสอบเท่านั้น"""

import json
import os
import sys
import time
from uuid import uuid4
import httpx
from websockets.sync.client import connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

if os.getenv("E2E_ALLOW_DISPOSABLE") != "true":
    sys.exit("ต้องตั้ง E2E_ALLOW_DISPOSABLE=true และใช้ DB ทดสอบ")

api_url = os.getenv("E2E_API", "http://localhost:8000")
web_origin = os.getenv("E2E_WEB", "http://localhost:3000")


def account(client):
    username = "ws_" + uuid4().hex[:10]
    password = uuid4().hex
    response = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": username + "@example.com",
            "password": password,
        },
    )
    response.raise_for_status()
    response = client.post(
        "/auth/login", json={"username": username, "password": password}
    )
    response.raise_for_status()
    return response.json()["access_token"]


with httpx.Client(base_url=api_url, trust_env=False) as client:
    owner, outsider = account(client), account(client)
    headers = {"Authorization": "Bearer " + owner}
    response = client.post(
        "/bot/start",
        headers=headers,
        json={"chapters": [30], "delay": 2, "mode": "demo"},
    )
    response.raise_for_status()
    task_id = response.json()["task_id"]
    url = api_url.replace("http", "ws", 1) + "/ws/logs/" + task_id
    for token in ["invalid", outsider]:
        with connect(url, origin=web_origin) as ws:
            ws.send(json.dumps({"token": token}))
            try:
                ws.recv(timeout=5)
                raise AssertionError("ต้องปฏิเสธ token นี้")
            except ConnectionClosed as error:
                assert error.code == 1008
    print("PASS: invalid token and another user cannot read task logs", flush=True)
    try:
        with connect(url, origin="https://untrusted.example"):
            raise AssertionError("ต้องปฏิเสธ Origin นี้")
    except InvalidStatus as error:
        assert error.response.status_code == 403
    print("PASS: untrusted WebSocket Origin denied before authentication", flush=True)

    with connect(url, origin=web_origin) as ws:
        ws.send(json.dumps({"token": owner}))
        first = None
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            event = json.loads(ws.recv(timeout=5))
            if event["type"] == "log":
                first = event
                break
        assert first and first["id"]
    with connect(url, origin=web_origin) as ws:
        ws.send(json.dumps({"token": owner}))
        replay = json.loads(ws.recv(timeout=5))
        assert replay["id"] == first["id"]
    print(
        "PASS: owner gets real log events and reconnect replays persistent history",
        flush=True,
    )
    response = client.post("/bot/stop/" + task_id, headers=headers)
    response.raise_for_status()
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        status = client.get("/bot/status/" + task_id, headers=headers).json()["status"]
        if status in {"cancelled", "success"}:
            break
        time.sleep(0.2)
    assert status in {"cancelled", "success"}
    print("PASS: test task cleaned up", flush=True)

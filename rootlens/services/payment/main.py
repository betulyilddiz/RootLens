import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Payment Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
mode = "normal"

class ModeUpdate(BaseModel):
    mode: str

@app.get("/health")
def health():
    return {"service": "payment", "status": "up", "mode": mode}

@app.post("/admin/mode")
def update_mode(payload: ModeUpdate):
    global mode
    if payload.mode not in {"normal", "slow", "down"}:
        raise HTTPException(status_code=400, detail="Mode normal, slow veya down olmalı.")
    mode = payload.mode
    return {"mode": mode}

@app.post("/pay")
async def pay():
    if mode == "down":
        raise HTTPException(status_code=503, detail="Payment service is unavailable")
    if mode == "slow":
        await asyncio.sleep(3)
    return {"payment_status": "approved", "mode": mode}

import os
import time
import uuid
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Order Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
payment_url = os.getenv("PAYMENT_URL", "http://localhost:8001")
analyzer_url = os.getenv("ANALYZER_URL", "http://localhost:8002")

async def publish_event(status: str, latency_ms: float, detail: str, trace_id: str):
    event = {"service": "payment-service", "status": status, "latency_ms": latency_ms, "detail": detail, "trace_id": trace_id, "source": "synthetic"}
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            await client.post(f"{analyzer_url}/events", json=event)
    except httpx.HTTPError:
        pass

@app.get("/health")
def health():
    return {"service": "order", "status": "up"}

@app.post("/orders")
async def create_order():
    started = time.perf_counter()
    trace_id = uuid.uuid4().hex[:12]
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.post(f"{payment_url}/pay")
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        if response.status_code >= 500:
            await publish_event("error", latency_ms, "Ödeme servisi yanıt vermiyor.", trace_id)
            raise HTTPException(status_code=502, detail="Ödeme servisi kullanılamıyor.")
        if latency_ms > 2000:
            await publish_event("slow", latency_ms, "Ödeme servisi normalden yavaş yanıt verdi.", trace_id)
        else:
            await publish_event("ok", latency_ms, "Ödeme başarılı.", trace_id)
        return {"order_status": "created", "payment": response.json(), "latency_ms": latency_ms, "trace_id": trace_id}
    except httpx.TimeoutException:
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        await publish_event("timeout", latency_ms, "Ödeme servisi zaman aşımına uğradı.", trace_id)
        raise HTTPException(status_code=504, detail="Ödeme servisi zaman aşımına uğradı.")
    except httpx.HTTPError:
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        await publish_event("error", latency_ms, "Ödeme servisine erişilemedi.", trace_id)
        raise HTTPException(status_code=502, detail="Ödeme servisine erişilemedi.")

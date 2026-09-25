import asyncio
import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


DB_PATH = "data/rootlens.db"
DEFAULT_TARGET = "Astronomy Shop Demo"
DEFAULT_JAEGER_URL = "http://jaeger:16686/jaeger/ui"
SOURCE_NAMES = ("Prometheus", "Jaeger", "OpenSearch")


def now():
    return datetime.now(timezone.utc).isoformat()


def connection():
    os.makedirs("data", exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def initialise():
    with connection() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            prometheus_url TEXT NOT NULL,
            jaeger_url TEXT NOT NULL,
            logs_url TEXT NOT NULL,
            poll_seconds INTEGER NOT NULL DEFAULT 30,
            updated_at TEXT NOT NULL
            )"""
        )
        db.execute(
            """CREATE TABLE IF NOT EXISTS observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            source TEXT NOT NULL,
            status TEXT NOT NULL,
            detail TEXT NOT NULL
            )"""
        )
        db.execute(
            """CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            severity TEXT NOT NULL,
            service TEXT NOT NULL,
            title TEXT NOT NULL,
            evidence TEXT NOT NULL,
            confidence INTEGER NOT NULL
            )"""
        )
        db.execute(
            """INSERT OR IGNORE INTO connections
            (id, name, prometheus_url, jaeger_url, logs_url, poll_seconds, updated_at)
            VALUES (1, ?, ?, ?, ?, 30, ?)""",
            (
                DEFAULT_TARGET,
                os.getenv("PROMETHEUS_URL", "http://prometheus:9090"),
                os.getenv("JAEGER_URL", DEFAULT_JAEGER_URL),
                os.getenv("OPENSEARCH_URL", "http://opensearch:9200"),
                now(),
            ),
        )

        # v4 used Jaeger's root route, although Astronomy Shop serves the UI below /jaeger/ui.
        legacy = db.execute("SELECT jaeger_url FROM connections WHERE id = 1").fetchone()
        if legacy and legacy["jaeger_url"].rstrip("/") == "http://jaeger:16686":
            db.execute(
                "UPDATE connections SET jaeger_url=?, updated_at=? WHERE id=1",
                (DEFAULT_JAEGER_URL, now()),
            )


def settings():
    with connection() as db:
        return dict(db.execute("SELECT * FROM connections WHERE id = 1").fetchone())


def record(source, status, detail):
    with connection() as db:
        db.execute(
            "INSERT INTO observations (created_at, source, status, detail) VALUES (?, ?, ?, ?)",
            (now(), source, status, detail),
        )


def url(base, suffix):
    return f"{base.rstrip('/')}{suffix}"


async def collect():
    cfg = settings()
    result = {"prometheus": False, "jaeger": False, "logs": False}

    async with httpx.AsyncClient(timeout=6) as client:
        try:
            response = await client.get(
                url(cfg["prometheus_url"], "/api/v1/query"),
                params={"query": "up"},
            )
            response.raise_for_status()
            targets = len(response.json().get("data", {}).get("result", []))
            record("Prometheus", "connected", f"Metrik kaynağı erişilebilir; {targets} hedef sorgulandı.")
            result["prometheus"] = True
        except (httpx.HTTPError, ValueError) as exc:
            record("Prometheus", "unavailable", f"Metrikler sorgulanamadı: {exc}")

        try:
            response = await client.get(url(cfg["jaeger_url"], "/"))
            response.raise_for_status()
            record("Jaeger", "connected", "Trace kaynağı erişilebilir.")
            result["jaeger"] = True
        except httpx.HTTPError as exc:
            record("Jaeger", "unavailable", f"Trace kaynağına ulaşılamadı: {exc}")

        try:
            response = await client.get(url(cfg["logs_url"], "/_cat/indices"), params={"format": "json"})
            response.raise_for_status()
            record("OpenSearch", "connected", f"Log kaynağı erişilebilir; {len(response.json())} indeks bulundu.")
            result["logs"] = True
        except (httpx.HTTPError, ValueError) as exc:
            record("OpenSearch", "unavailable", f"Loglar sorgulanamadı: {exc}")

    return result


async def watcher():
    while True:
        try:
            await collect()
        except Exception:
            pass
        await asyncio.sleep(max(10, settings()["poll_seconds"]))


@asynccontextmanager
async def lifespan(app):
    initialise()
    task = asyncio.create_task(watcher())
    yield
    task.cancel()


app = FastAPI(title="RootLens", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionForm(BaseModel):
    name: str
    prometheus_url: str
    jaeger_url: str
    logs_url: str
    poll_seconds: int = 30


@app.get("/health")
def health():
    return {"status": "ok", "mode": "observability-only"}


@app.get("/connection")
def get_connection():
    return settings()


@app.put("/connection")
def update_connection(form: ConnectionForm):
    with connection() as db:
        db.execute(
            """UPDATE connections
            SET name=?, prometheus_url=?, jaeger_url=?, logs_url=?, poll_seconds=?, updated_at=?
            WHERE id=1""",
            (
                form.name.strip(),
                form.prometheus_url.strip(),
                form.jaeger_url.strip(),
                form.logs_url.strip(),
                max(10, form.poll_seconds),
                now(),
            ),
        )
    return settings()


@app.post("/collect/now")
async def collect_now():
    return await collect()


@app.get("/dashboard")
def dashboard():
    cfg = settings()
    with connection() as db:
        observations = [
            dict(row)
            for row in db.execute("SELECT * FROM observations ORDER BY id DESC LIMIT 18").fetchall()
        ]
        incidents = [
            dict(row)
            for row in db.execute("SELECT * FROM incidents ORDER BY id DESC LIMIT 20").fetchall()
        ]

    latest = {}
    for row in observations:
        latest.setdefault(row["source"], row)
    sources = [
        {
            "name": name,
            "status": latest.get(name, {}).get("status", "waiting"),
            "detail": latest.get(name, {}).get("detail", "Henüz kontrol edilmedi."),
        }
        for name in SOURCE_NAMES
    ]
    connected = sum(item["status"] == "connected" for item in sources)
    state = "healthy" if connected == len(SOURCE_NAMES) else "attention" if connected else "waiting"

    return {
        "target": cfg["name"],
        "poll_seconds": cfg["poll_seconds"],
        "state": state,
        "sources": sources,
        "incidents": incidents,
        "last_checked": observations[0]["created_at"] if observations else None,
        "mode": "observability-only",
        "ai": {
            "status": "planned",
            "label": "Sonraki aşama",
            "description": "Bu ilk sürümde yapay zekâ modeli aktif değildir. RootLens şu an gerçek telemetriyi toplar ve kaynakların erişilebilirliğini gösterir.",
            "next_steps": [
                "Kural tabanlı anomali eşikleri",
                "Normal davranışı öğrenen anomali modeli",
                "Metrik, log ve trace kanıtlarıyla otomatik kök neden açıklaması",
            ],
        },
    }

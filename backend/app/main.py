"""
PhishGuard — FastAPI application entry point.
"""
import time
from contextlib import asynccontextmanager
from pathlib import Path

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.api.auth import router as auth_router
from app.api.campaigns import router as campaigns_router
from app.api.targets import router as targets_router
from app.api.tracking import router as tracking_router

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    log.info("phishguard.startup", env=settings.ENVIRONMENT)

    # BASE_URL/FRONTEND_URL feed straight into tracking pixels, click
    # redirects, and the sim-landing link embedded in every sent email —
    # if ENVIRONMENT=production but either is still its localhost default,
    # every link in every sent email is dead on arrival for the recipient.
    # render.yaml marks both `sync: false` precisely so this can't happen
    # silently; this is the last line of defense if someone deploys without
    # filling them in on the dashboard.
    if settings.is_production:
        if settings.BASE_URL.startswith("http://localhost"):
            log.error("config.base_url_not_set", detail="BASE_URL is still localhost in production — tracking links will be unreachable")
        if any(o.startswith("http://localhost") for o in settings.frontend_origins):
            log.error("config.frontend_url_not_set", detail="FRONTEND_URL is still localhost in production — CORS will reject the real frontend")

    # Warm up ChromaDB collection on startup, self-seeding if it's empty —
    # normally a no-op since the Docker image already bakes the patterns in
    # at build time, but this is cheap insurance against a deploy path (or
    # host) where that didn't happen.
    try:
        from app.rag.vectorstore import ensure_seeded
        count = ensure_seeded()
        log.info("rag.ready", patterns=count)
    except Exception as e:
        log.warning("rag.warmup_failed", error=str(e))

    yield

    log.info("phishguard.shutdown")


app = FastAPI(
    title="PhishGuard API",
    description="AI-powered phishing simulation platform for security awareness training.",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
)

# ── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    # Every Vercel preview deployment gets its own random *.vercel.app
    # subdomain — listing each one in FRONTEND_URL by hand isn't workable,
    # so preview URLs are matched by pattern instead. Harmless in local dev
    # (nothing served from vercel.app there) and scoped to a domain only
    # Vercel itself issues, not a security loosening.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Timing ───────────────────────────────────────────────────────────────────

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """
    Surfaces per-request latency as an X-Process-Time response header and a
    terminal warning for anything slow, so a regression (e.g. a cold Neon
    connection, an N+1 query) is visible immediately instead of only showing
    up as "the UI feels slow" with no lead on where to look.
    """
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time"] = f"{duration_ms:.1f}ms"
    if duration_ms > 200:
        log.warning("slow_request", path=request.url.path, method=request.method, duration_ms=round(duration_ms, 1))
    return response

# ── Routers ───────────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(campaigns_router, prefix=API_PREFIX)
app.include_router(targets_router, prefix=API_PREFIX)
app.include_router(tracking_router)   # /track/* — no versioning prefix (links go in emails)

# Uploaded campaign images (logos, screenshots pasted into the email body).
_static_dir = Path("static")
_static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_static_dir)), name="static")


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "environment": settings.ENVIRONMENT}


# ── Global error handler ──────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    log.error("unhandled_exception", path=str(request.url), error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred"},
    )

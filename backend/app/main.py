"""
PhishGuard — FastAPI application entry point.
"""
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

    # Warm up ChromaDB collection on startup
    try:
        from app.rag.vectorstore import collection_count
        count = collection_count()
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
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(campaigns_router, prefix=API_PREFIX)
app.include_router(targets_router, prefix=API_PREFIX)
app.include_router(tracking_router)   # /track/* — no versioning prefix (links go in emails)


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

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps: build tools for packages without prebuilt wheels.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first for layer caching.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Seed ChromaDB into the image itself (downloads the embedding model + builds
# the pattern collection once, at build time). Hosts with no persistent disk
# on their free tier (e.g. Render) wipe ./chroma_db on every restart —  baking
# it into the image means it survives restarts without needing a volume.
RUN python scripts/seed_chromadb.py

EXPOSE 8000

# Apply migrations, then start the API. $PORT is set by PaaS hosts (Render,
# etc) at runtime; falls back to 8000 for local/compose use.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

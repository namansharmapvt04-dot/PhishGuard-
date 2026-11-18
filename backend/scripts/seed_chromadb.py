"""
Seed ChromaDB with real-world phishing pattern templates.
Run once before starting the app:
  python scripts/seed_chromadb.py

The pattern data itself lives in app/rag/seed_patterns.py (shared with
vectorstore.py's own runtime ensure_seeded() safety net) — this script is
just the one-off build-time entry point Docker runs.
"""
import sys
import os

# Add backend root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.rag.vectorstore import upsert_patterns, collection_count
from app.rag.seed_patterns import PHISHING_PATTERNS

if __name__ == "__main__":
    print(f"Seeding {len(PHISHING_PATTERNS)} phishing patterns into ChromaDB...")
    count = upsert_patterns(PHISHING_PATTERNS)
    total = collection_count()
    print(f"[OK] Seeded {count} patterns. Collection now has {total} total patterns.")

"""
ChromaDB vector store for phishing patterns.
Provides semantic retrieval of similar phishing templates.
"""
from __future__ import annotations
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings
from chromadb.utils import embedding_functions

from app.config import settings

_chroma_client: Optional[chromadb.Client] = None
_collection = None

# ONNX MiniLM via onnxruntime — same model family as sentence-transformers'
# all-MiniLM-L6-v2, but without pulling in torch (~300-700MB resident just on
# import, which alone blew past Render free tier's 512MB RAM cap).
_embedding_fn = embedding_functions.DefaultEmbeddingFunction()


def _get_client() -> chromadb.Client:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIR,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _chroma_client


def _get_collection():
    global _collection
    if _collection is None:
        client = _get_client()
        _collection = client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
            embedding_function=_embedding_fn,
        )
    return _collection


def retrieve_patterns(query: str, k: Optional[int] = None) -> list[dict]:
    """
    Retrieve the top-k most similar phishing patterns for a given query.
    Returns list of dicts with keys: id, document, metadata, distance.
    """
    k = k or settings.RAG_TOP_K
    collection = _get_collection()

    results = collection.query(
        query_texts=[query],
        n_results=k,
        include=["documents", "metadatas", "distances"],
    )

    patterns = []
    for i in range(len(results["ids"][0])):
        patterns.append({
            "id": results["ids"][0][i],
            "document": results["documents"][0][i],
            "metadata": results["metadatas"][0][i],
            "distance": results["distances"][0][i],
        })
    return patterns


def upsert_patterns(patterns: list[dict]) -> int:
    """
    Upsert phishing patterns into ChromaDB.
    Each pattern dict must have: id, text, metadata (dict).
    Returns count of upserted patterns.
    """
    collection = _get_collection()
    ids = [p["id"] for p in patterns]
    documents = [p["text"] for p in patterns]
    metadatas = [p.get("metadata", {}) for p in patterns]

    # No explicit `embeddings=` — the collection's embedding_function (set in
    # _get_collection) computes them from `documents` automatically.
    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )
    return len(patterns)


def collection_count() -> int:
    return _get_collection().count()

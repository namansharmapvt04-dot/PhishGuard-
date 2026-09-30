"""
ChromaDB vector store for phishing patterns.
Provides semantic retrieval of similar phishing templates.
"""
import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

from app.config import settings

_chroma_client: chromadb.PersistentClient | None = None
_embedding_model: SentenceTransformer | None = None
_collection = None


def _get_client() -> chromadb.PersistentClient:
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIR,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _chroma_client


def _get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        # all-MiniLM-L6-v2 runs on CPU, fast, ~80MB
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedding_model


def _get_collection():
    global _collection
    if _collection is None:
        client = _get_client()
        _collection = client.get_or_create_collection(
            name=settings.CHROMA_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def embed(texts: list[str]) -> list[list[float]]:
    model = _get_embedding_model()
    return model.encode(texts, convert_to_numpy=True).tolist()


def retrieve_patterns(query: str, k: int | None = None) -> list[dict]:
    """
    Retrieve the top-k most similar phishing patterns for a given query.
    Returns list of dicts with keys: id, document, metadata, distance.
    """
    k = k or settings.RAG_TOP_K
    collection = _get_collection()

    query_embedding = embed([query])[0]
    results = collection.query(
        query_embeddings=[query_embedding],
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
    embeddings = embed(documents)

    collection.upsert(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
        embeddings=embeddings,
    )
    return len(patterns)


def collection_count() -> int:
    return _get_collection().count()

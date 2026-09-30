"""
Server-Sent Events helpers for streaming campaign generation progress
to the frontend in real time.
"""
import json
from typing import AsyncGenerator


def sse_format(event: str, data: dict) -> str:
    """Format a dict as an SSE message string."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def agent_progress_stream(
    events: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Yield SSE messages for a list of agent progress events.
    Each event dict must have at minimum: { "event": str, "data": dict }
    """
    for ev in events:
        yield sse_format(ev["event"], ev["data"])


# Standard event types the frontend listens for
class SSEEvent:
    PIPELINE_STARTED = "pipeline_started"
    NODE_STARTED = "node_started"
    NODE_COMPLETED = "node_completed"
    RAGAS_SCORED = "ragas_scored"
    RETRY = "retry"
    PIPELINE_COMPLETED = "pipeline_completed"
    PIPELINE_FAILED = "pipeline_failed"
    STATE_CHANGED = "state_changed"

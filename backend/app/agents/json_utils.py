r"""
Shared JSON parsing for LLM outputs.

LLMs occasionally emit JSON with invalid backslash escapes (e.g. a literal
backslash-d or backslash-bracket inside a string value, from imitating
regex/markdown-ish text in the prompt context) — valid JSON only allows a
fixed set of escape sequences, so json.loads raises "Invalid \escape" on
anything else. Also strips markdown code fences, in case the model wraps
its JSON in triple-backtick fences despite being told not to.
"""
import json
import re

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
_BAD_ESCAPE_RE = re.compile(r'\\(?!["\\/bfnrtu])')


def safe_json_loads(text: str) -> dict:
    text = _FENCE_RE.sub("", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        repaired = _BAD_ESCAPE_RE.sub(r"\\\\", text)
        return json.loads(repaired)

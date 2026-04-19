"""LiteLLM-backed position extraction (roadmap section 6).

v0.1 default provider is Azure OpenAI (GPT-5.4 deployment). The LLM is
asked for strict JSON-schema output with per-field confidence and a
source span; the deterministic validation layer then annotates each
row before it reaches the review UI. The LLM never computes derived
values -- only extracts what is written in the paste.

Tests replace `litellm.completion` via unittest.mock; the real Azure
endpoint is only hit via a separate manual eval script (not in CI).
"""

import json
from datetime import UTC, datetime

import litellm

from .config import settings
from .schemas import ExtractedPosition, ExtractionResult
from .validation import annotate

_SYSTEM_PROMPT = """You extract stock/ETF/fund positions from pasted portfolio text.

Return a JSON object {"positions": [...]}. For each holding include:
- ticker: exact symbol shown, uppercase (e.g. "VTI", "BRK.B", "BTC-USD")
- shares: number of shares or units as a float
- cost_basis: total cost basis in USD if shown, else null
- confidence: 0.0-1.0 reflecting your certainty
- source_span: exact substring from the paste you extracted this row from

Rules:
- Extract only what is written. Do not infer or compute any derived value.
- Do not invent tickers. Map fund names to tickers only if the symbol appears in the text.
- Ignore cash balance lines unless tracked as an explicit position (e.g. "CASH", money-market symbol).
- Return positions in the order they appear in the paste.
"""

_JSON_SCHEMA = {
    "name": "positions",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "positions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ticker": {"type": "string"},
                        "shares": {"type": "number"},
                        "cost_basis": {"type": ["number", "null"]},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "source_span": {"type": "string"},
                    },
                    "required": [
                        "ticker",
                        "shares",
                        "cost_basis",
                        "confidence",
                        "source_span",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["positions"],
        "additionalProperties": False,
    },
}


class LLMNotConfiguredError(RuntimeError):
    """Raised when required LLM provider settings are missing."""


def _model_string() -> str:
    if settings.llm_provider != "azure":
        raise LLMNotConfiguredError(
            f"llm_provider={settings.llm_provider!r} not supported in v0.1 (azure only)"
        )
    if not settings.azure_deployment_name:
        raise LLMNotConfiguredError("AZURE_DEPLOYMENT_NAME not configured")
    return f"azure/{settings.azure_deployment_name}"


def extract_positions(text: str) -> ExtractionResult:
    """Send paste text to the configured LLM, parse + validate the response."""
    model = _model_string()
    response = litellm.completion(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        api_key=settings.azure_api_key,
        api_base=settings.azure_api_base,
        api_version=settings.azure_api_version,
        response_format={"type": "json_schema", "json_schema": _JSON_SCHEMA},
    )
    content = response.choices[0].message.content
    raw = json.loads(content)
    positions = [ExtractedPosition(**p) for p in raw["positions"]]
    return ExtractionResult(
        positions=annotate(positions),
        model=model,
        extracted_at=datetime.now(UTC),
    )

"""LiteLLM-backed position extraction (docs/architecture.md LLM extraction).

v0.1 default provider is Azure OpenAI (GPT-5.4 deployment). The LLM is
asked for strict JSON-schema output with per-field confidence and a
source span; the deterministic validation layer then annotates each
row before it reaches the review UI. The LLM never computes derived
values -- only extracts what is written in the paste.

Tests replace `litellm.completion` via unittest.mock; the real Azure
endpoint is only hit via a separate manual eval script (not in CI).
"""

import json
from dataclasses import dataclass
from datetime import UTC, datetime

import litellm

from .config import settings
from .merge_extract import merge_duplicate_tickers
from .schemas import ASSET_CLASS_OPTIONS, ExtractedPosition, ExtractionResult
from .validation import annotate

_ASSET_CLASS_ENUM: list[str] = [o.value for o in ASSET_CLASS_OPTIONS]
_VALID_ASSET_CLASS_SET: frozenset[str] = frozenset(_ASSET_CLASS_ENUM)

_SYSTEM_PROMPT = """You extract portfolio holdings from brokerage statement text: stocks, ETFs, funds,
cash and cash equivalents, US Treasury debt, and similar line items the statement lists with values.

Return a JSON object with: positions, statement_account_name, statement_account_name_confidence,
matched_account_id, matched_account_confidence. All keys are required by the schema (use null where unknown).

For each position include:
- ticker: exact symbol shown, uppercase (e.g. "VTI", "BRK.B", "BTC-USD")
- shares: number of shares or units as a float
- cost_basis: total cost basis in USD if shown, else null
- market_value: total market value / current value in USD if shown, else null
- confidence: 0.0-1.0 reflecting your certainty
- source_span: exact substring from the text you extracted this row from

Also from the statement header/labels:
- statement_account_name: account or registration name as printed, or null if absent/unclear
- statement_account_name_confidence: 0.0-1.0 or null

Account matching (critical):
- You receive a JSON array of accounts with id, label, and type. Set matched_account_id to EXACTLY one
  of those ids if the statement clearly refers to that account, otherwise null.
- matched_account_confidence: 0.0-1.0 or null; null matched_account_id must use null here.
- Never invent account ids. Only the listed ids are valid; if unsure, use null for both.

Rules for positions:
- Extract only what is written. Do not infer or compute any derived value.
- Do not invent tickers for equities/ETFs. Map fund names to tickers only if the symbol appears in the text.
- **Cash and cash equivalents:** Include them when the statement lists them as holdings (core cash, bank
  deposit / FDIC sweep, money market funds such as SWVXX, SNAXX, SPRXX, SPAXX, etc.). If there is a dollar
  balance but no symbol in the Symbol column, use ticker **CASH** with shares = 1.0, market_value = the
  balance shown, cost_basis = null unless the statement gives it.
- **US Treasury bills/notes/bonds:** Include each listed line (US T-Bill, Treasury Note, etc.). Prefer a
  printed trade symbol when it already matches a normal ticker (e.g. "T 4.25 05/15/28"). When the line
  shows **only a CUSIP** (9-character alphanumeric ID, e.g. "912828ZT0"), use the CUSIP as-is for ticker.
- Return positions in the order they appear in the statement.
"""

_JSON_SCHEMA = {
    "name": "extraction",
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
                        "market_value": {"type": ["number", "null"]},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "source_span": {"type": "string"},
                    },
                    "required": [
                        "ticker",
                        "shares",
                        "cost_basis",
                        "market_value",
                        "confidence",
                        "source_span",
                    ],
                    "additionalProperties": False,
                },
            },
            "statement_account_name": {"type": ["string", "null"]},
            "statement_account_name_confidence": {"type": ["number", "null"]},
            "matched_account_id": {"type": ["integer", "null"]},
            "matched_account_confidence": {"type": ["number", "null"]},
        },
        "required": [
            "positions",
            "statement_account_name",
            "statement_account_name_confidence",
            "matched_account_id",
            "matched_account_confidence",
        ],
        "additionalProperties": False,
    },
}

_CLASSIFY_SYSTEM_PROMPT = """You classify a single market ticker into OpenPortfolio's asset_class taxonomy.

Return a JSON object with:
- asset_class: exactly one of the allowed enum values
- confidence: 0.0-1.0 (use low values when the symbol is ambiguous or unknown)
- reasoning: one short factual sentence (no numbers, no advice)

You only receive the ticker symbol — use general knowledge of common ETFs, stocks, and funds."""

_CLASSIFY_JSON_SCHEMA = {
    "name": "ticker_classify",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "asset_class": {"type": "string", "enum": _ASSET_CLASS_ENUM},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reasoning": {"type": "string"},
        },
        "required": ["asset_class", "confidence", "reasoning"],
        "additionalProperties": False,
    },
}


@dataclass(frozen=True)
class TickerClassificationResult:
    asset_class: str
    confidence: float
    reasoning: str
    model: str


class LLMNotConfiguredError(RuntimeError):
    """Raised when required LLM provider settings are missing."""


SUPPORTED_PROVIDERS = ("azure", "ollama")


def _provider_config() -> tuple[str, dict[str, str]]:
    """Resolve the LiteLLM model string + per-provider kwargs.

    Kwargs go into ``litellm.completion`` alongside ``model`` and the
    response_format. Returning them here keeps the adapter table-driven
    -- v0.2 adds Anthropic / OpenAI-direct / Gemini by extending this
    branch, not the call site.
    """
    provider = settings.llm_provider
    if provider == "azure":
        if not settings.azure_deployment_name:
            raise LLMNotConfiguredError("AZURE_DEPLOYMENT_NAME not configured")
        model = f"azure/{settings.azure_deployment_name}"
        return model, {
            "api_key": settings.azure_api_key,
            "api_base": settings.azure_api_base,
            "api_version": settings.azure_api_version,
        }
    if provider == "ollama":
        if not settings.llm_model:
            raise LLMNotConfiguredError("LLM_MODEL not configured for ollama")
        model = f"ollama/{settings.llm_model}"
        return model, {"api_base": settings.ollama_api_base}
    raise LLMNotConfiguredError(
        f"llm_provider={provider!r} not supported in v0.1 "
        f"(pick one of {SUPPORTED_PROVIDERS})"
    )


def _user_content_for_extract(
    text: str, accounts: list[tuple[int, str, str]] | None
) -> str:
    acc_json = json.dumps(
        [{"id": a[0], "label": a[1], "type": a[2]} for a in (accounts or [])],
        ensure_ascii=False,
    )
    return (
        "Accounts you may match (use matched_account_id only for one of these ids, or null):\n"
        f"{acc_json}\n\n"
        f"---\n\n"
        f"Statement text to extract from:\n\n"
        f"{text}"
    )


def _coerce_matched_id(raw: object) -> int | None:
    if raw is None:
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float) and float(raw).is_integer():
        return int(raw)
    return None


def extract_positions(
    text: str, accounts: list[tuple[int, str, str]] | None = None
) -> ExtractionResult:
    """Send statement text to the configured LLM, parse + validate the response."""
    model, kwargs = _provider_config()
    allowed_ids = {t[0] for t in (accounts or [])}
    response = litellm.completion(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": _user_content_for_extract(text, accounts)},
        ],
        response_format={"type": "json_schema", "json_schema": _JSON_SCHEMA},
        **kwargs,
    )
    content = response.choices[0].message.content
    raw = json.loads(content)
    positions_in = [ExtractedPosition(**p) for p in raw["positions"]]
    positions_out = merge_duplicate_tickers(annotate(positions_in))

    stmt_name = raw.get("statement_account_name")
    if stmt_name is not None and not isinstance(stmt_name, str):
        stmt_name = str(stmt_name)

    stmt_name_conf: float | None = None
    v = raw.get("statement_account_name_confidence")
    if v is not None:
        stmt_name_conf = float(v)

    mid = _coerce_matched_id(raw.get("matched_account_id"))
    mconf: float | None = None
    mv = raw.get("matched_account_confidence")
    if mv is not None:
        mconf = float(mv)

    warnings: list[str] = []
    if mid is not None and mid not in allowed_ids:
        warnings.append(
            f"Invalid matched_account_id {mid!r} (not in user accounts); cleared to null."
        )
        mid = None
        mconf = None

    return ExtractionResult(
        positions=positions_out,
        model=model,
        extracted_at=datetime.now(UTC),
        statement_account_name=stmt_name,
        statement_account_name_confidence=stmt_name_conf,
        matched_account_id=mid,
        matched_account_confidence=mconf,
        extraction_warnings=warnings,
    )


def classify_ticker(ticker: str) -> TickerClassificationResult | None:
    """LLM-only asset_class hint for a ticker (paste review). Returns None on failure."""
    try:
        model, kwargs = _provider_config()
        response = litellm.completion(
            model=model,
            messages=[
                {"role": "system", "content": _CLASSIFY_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f'Ticker: "{ticker.strip()}"\nReturn the JSON object.',
                },
            ],
            response_format={"type": "json_schema", "json_schema": _CLASSIFY_JSON_SCHEMA},
            **kwargs,
        )
        content = response.choices[0].message.content
        raw = json.loads(content)
        ac = raw["asset_class"]
        if ac not in _VALID_ASSET_CLASS_SET:
            return None
        conf = float(raw["confidence"])
        if conf < 0 or conf > 1:
            return None
        return TickerClassificationResult(
            asset_class=ac,
            confidence=conf,
            reasoning=str(raw["reasoning"]),
            model=model,
        )
    except (LLMNotConfiguredError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None
    except Exception:
        # LiteLLM / network — treat as unavailable (tests mock success path only).
        return None

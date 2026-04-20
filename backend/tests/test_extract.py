"""Tests for extract_positions and the POST /api/extract endpoint.

`litellm.completion` is replaced with a unittest.mock that returns
pre-recorded JSON captured from a real Azure run. This keeps CI
deterministic, offline, and free of provider cost. A separate manual
eval script (not in this branch) hits real Azure when prompts change
and re-records the `*_llm.json` snapshots.
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.llm import LLMNotConfiguredError, classify_ticker, extract_positions
from app.main import app

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name: str) -> tuple[str, str]:
    text = (FIXTURES / f"{name}.txt").read_text()
    llm_json = (FIXTURES / f"{name}_llm.json").read_text()
    return text, llm_json


def _mock_response(json_text: str) -> MagicMock:
    resp = MagicMock()
    resp.choices = [MagicMock()]
    resp.choices[0].message.content = json_text
    return resp


@pytest.fixture
def azure_configured() -> None:
    # LLMNotConfiguredError fires if deployment name is blank; set a
    # placeholder for the duration of each test.
    settings.llm_provider = "azure"
    settings.azure_deployment_name = "test-deployment"


# --- extract_positions ----------------------------------------------------


def test_raises_when_provider_unsupported() -> None:
    settings.llm_provider = "anthropic"
    with pytest.raises(LLMNotConfiguredError, match="not supported"):
        extract_positions("anything")


def test_raises_when_deployment_missing() -> None:
    settings.llm_provider = "azure"
    settings.azure_deployment_name = ""
    with pytest.raises(LLMNotConfiguredError, match="AZURE_DEPLOYMENT_NAME"):
        extract_positions("anything")


def test_raises_when_ollama_model_missing() -> None:
    settings.llm_provider = "ollama"
    settings.llm_model = ""
    with pytest.raises(LLMNotConfiguredError, match="LLM_MODEL"):
        extract_positions("anything")


def test_ollama_model_string_and_api_base() -> None:
    settings.llm_provider = "ollama"
    settings.llm_model = "llama3.1"
    settings.ollama_api_base = "http://ollama:11434"
    text, llm_json = _load("vanguard")

    with patch(
        "app.llm.litellm.completion", return_value=_mock_response(llm_json)
    ) as mock:
        result = extract_positions(text)

    assert result.model == "ollama/llama3.1"
    kwargs = mock.call_args.kwargs
    assert kwargs["model"] == "ollama/llama3.1"
    assert kwargs["api_base"] == "http://ollama:11434"
    # Azure-only kwargs must not leak through to Ollama.
    assert "api_key" not in kwargs
    assert "api_version" not in kwargs


@pytest.mark.parametrize(
    "fixture,expected_tickers",
    [
        ("fidelity", ["VTI", "VXUS", "BND", "aapl"]),
        ("vanguard", ["VTI", "BND", "VXUS"]),
        ("schwab", ["SPY", "QQQ", "GLD", "BTC-USD"]),
    ],
)
def test_extract_fixture(
    azure_configured: None, fixture: str, expected_tickers: list[str]
) -> None:
    text, llm_json = _load(fixture)
    with patch("app.llm.litellm.completion", return_value=_mock_response(llm_json)):
        result = extract_positions(text)

    assert [p.ticker for p in result.positions] == expected_tickers
    assert result.model == "azure/test-deployment"
    assert result.extracted_at is not None


def test_extract_applies_validation(azure_configured: None) -> None:
    text, llm_json = _load("fidelity")
    with patch("app.llm.litellm.completion", return_value=_mock_response(llm_json)):
        result = extract_positions(text)

    by_ticker = {p.ticker: p for p in result.positions}
    # Lowercase 'aapl' fails the ticker regex and is annotated.
    assert by_ticker["aapl"].validation_errors
    assert "does not match" in by_ticker["aapl"].validation_errors[0]
    # Well-formed rows stay clean.
    assert by_ticker["VTI"].validation_errors == []
    assert by_ticker["BND"].validation_errors == []


def test_extract_preserves_confidence_and_cost_basis(azure_configured: None) -> None:
    text, llm_json = _load("schwab")
    with patch("app.llm.litellm.completion", return_value=_mock_response(llm_json)):
        result = extract_positions(text)

    by_ticker = {p.ticker: p for p in result.positions}
    assert by_ticker["SPY"].cost_basis == 48000.0
    assert by_ticker["BTC-USD"].confidence == 0.95


def test_extract_preserves_market_value(azure_configured: None) -> None:
    # Vanguard paste has no cost basis column, so market_value is the only
    # usable dollar figure -- exercises the fallback path the allocation
    # engine will rely on in M2.3.
    text, llm_json = _load("vanguard")
    with patch("app.llm.litellm.completion", return_value=_mock_response(llm_json)):
        result = extract_positions(text)

    by_ticker = {p.ticker: p for p in result.positions}
    assert by_ticker["VTI"].market_value == 49064.00
    assert by_ticker["VTI"].cost_basis is None
    assert by_ticker["BND"].market_value == 5433.75


def test_extract_passes_azure_credentials(azure_configured: None) -> None:
    settings.azure_api_key = "test-key"
    settings.azure_api_base = "https://test.openai.azure.com"
    settings.azure_api_version = "2025-03-01-preview"
    text, llm_json = _load("vanguard")

    with patch(
        "app.llm.litellm.completion", return_value=_mock_response(llm_json)
    ) as mock:
        extract_positions(text)

    kwargs = mock.call_args.kwargs
    assert kwargs["model"] == "azure/test-deployment"
    assert kwargs["api_key"] == "test-key"
    assert kwargs["api_base"] == "https://test.openai.azure.com"
    assert kwargs["api_version"] == "2025-03-01-preview"
    assert kwargs["response_format"]["type"] == "json_schema"


# --- POST /api/extract ----------------------------------------------------


def test_extract_endpoint_requires_admin_token(azure_configured: None) -> None:
    settings.admin_token = "secret"
    client = TestClient(app)
    r = client.post("/api/extract", json={"text": "ignored"})
    assert r.status_code == 401


def test_extract_endpoint_returns_annotated_positions(azure_configured: None) -> None:
    settings.admin_token = "secret"
    text, llm_json = _load("fidelity")

    with patch("app.llm.litellm.completion", return_value=_mock_response(llm_json)):
        client = TestClient(app)
        r = client.post(
            "/api/extract",
            headers={"X-Admin-Token": "secret"},
            json={"text": text},
        )

    assert r.status_code == 200
    body = r.json()
    tickers = [p["ticker"] for p in body["positions"]]
    assert tickers == ["VTI", "VXUS", "BND", "aapl"]
    # Validation errors surface in the response body (review UI consumes them).
    aapl = next(p for p in body["positions"] if p["ticker"] == "aapl")
    assert aapl["validation_errors"]


def test_recorded_fixtures_parse_as_valid_json() -> None:
    # Guard against malformed snapshot drift on future re-records.
    for fixture in ("fidelity", "vanguard", "schwab"):
        _, llm_json = _load(fixture)
        parsed = json.loads(llm_json)
        assert "positions" in parsed
        assert len(parsed["positions"]) > 0


# --- classify_ticker -------------------------------------------------------


def test_classify_ticker_parses_llm_response(azure_configured: None) -> None:
    llm_json = json.dumps(
        {
            "asset_class": "equity",
            "confidence": 0.9,
            "reasoning": "US total market ETF.",
        }
    )
    with patch("app.llm.litellm.completion", return_value=_mock_response(llm_json)):
        result = classify_ticker("VTI")
    assert result is not None
    assert result.asset_class == "equity"
    assert result.confidence == 0.9
    assert "ETF" in result.reasoning


def test_classify_ticker_returns_none_on_invalid_asset_class(
    azure_configured: None,
) -> None:
    llm_json = json.dumps(
        {
            "asset_class": "not_a_real_class",
            "confidence": 0.9,
            "reasoning": "bad",
        }
    )
    with patch("app.llm.litellm.completion", return_value=_mock_response(llm_json)):
        assert classify_ticker("X") is None

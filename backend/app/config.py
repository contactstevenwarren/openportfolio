from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    database_url: str = "sqlite:////data/openportfolio.db"
    admin_token: str = ""

    # LLM provider config. Azure OpenAI is the v0.1 default (GPT-5.4
    # deployment); Ollama arrives in M5. LiteLLM addresses Azure as
    # "azure/<deployment_name>".
    # "azure" | "ollama". Azure is the v0.1 default; Ollama is the local
    # alternative (roadmap Principles). Backlog: additional providers;
    # Anthropic / OpenAI-direct / Gemini.
    llm_provider: str = "azure"
    azure_api_key: str = ""
    azure_api_base: str = ""
    azure_api_version: str = ""
    azure_deployment_name: str = ""

    # Ollama local-LLM settings. `llm_model` is the model tag (e.g.
    # "llama3.1", "qwen2.5-coder"); LiteLLM addresses it as
    # "ollama/<model>". `ollama_api_base` points at the running daemon
    # -- defaults to Docker Desktop's host-to-container shortcut so the
    # FastAPI container can reach a daemon on the Mac host.
    llm_model: str = "llama3.1"
    ollama_api_base: str = "http://host.docker.internal:11434"

    # yfinance look-through is authoritative in architecture but Yahoo's
    # own taxonomy ("US Stocks", "Bonds") doesn't line up with our
    # classifications (equity/fixed_income/...). M5 will add the
    # normalization layer; until then we keep the yfinance adapter in
    # place but off, and treat data/lookthrough.yaml as the source of
    # truth. Flipping this to true before M5 lands will produce garbage
    # rings -- tested here only via mocks.
    lookthrough_yfinance_enabled: bool = False

    # Drift bands vs target allocation (v0.2 -- 4-band redesign). Env:
    # DRIFT_TOLERANCE_PCT, DRIFT_ACT_PCT, DRIFT_URGENT_PCT. Absolute
    # drift within tolerance is ``ok`` (no-trade band); above tolerance
    # but at-or-below act is ``watch``; above act but at-or-below urgent
    # is ``act``; above urgent is ``urgent``. The rebalance trigger
    # fires when any class is in ``act`` or ``urgent`` (|drift| > act).
    drift_tolerance_pct: float = 3.0
    drift_act_pct: float = 5.0
    drift_urgent_pct: float = 10.0

    # PDF statement text extraction (v0.4). Reject when extracted text
    # exceeds this budget (no silent truncate).
    pdf_max_extract_chars: int = 100_000


settings = Settings()

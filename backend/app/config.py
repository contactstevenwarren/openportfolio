from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    database_url: str = "sqlite:////data/openportfolio.db"
    admin_token: str = ""

    # LLM provider config. Azure OpenAI is the v0.1 default (GPT-5.4
    # deployment); Ollama arrives in M5. LiteLLM addresses Azure as
    # "azure/<deployment_name>".
    llm_provider: str = "azure"
    azure_api_key: str = ""
    azure_api_base: str = ""
    azure_api_version: str = ""
    azure_deployment_name: str = ""

    # yfinance look-through is authoritative in the roadmap but Yahoo's
    # own taxonomy ("US Stocks", "Bonds") doesn't line up with our
    # classifications (equity/fixed_income/...). M5 will add the
    # normalization layer; until then we keep the yfinance adapter in
    # place but off, and treat data/lookthrough.yaml as the source of
    # truth. Flipping this to true before M5 lands will produce garbage
    # rings -- tested here only via mocks.
    lookthrough_yfinance_enabled: bool = False


settings = Settings()

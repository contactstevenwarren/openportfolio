from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # extra="ignore" so loading a shared .env with LLM/Azure keys doesn't error here;
    # those keys land in the LLM adapter in M2.
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    database_url: str = "sqlite:////data/openportfolio.db"
    admin_token: str = ""


settings = Settings()

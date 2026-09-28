from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="EVALUATION_", env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./var/evaluation.db"
    artifact_dir: Path = Path("var/artifacts")
    # No implicit administrator. Configure distinct high-entropy tokens in the environment.
    admin_token: str = ""
    reader_token: str = ""
    upstream_url: str = ""
    upstream_token: str = ""
    worker_enabled: bool = True
    ticket_seconds: int = 120

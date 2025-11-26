import json
from pathlib import Path
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parents[2]
DATABASE_CONFIG_PATH = BASE_DIR / "conf" / "database.json"


def load_database_url() -> str:
    """Load the database URL from backend/conf/database.json."""
    if DATABASE_CONFIG_PATH.exists():
        data = json.loads(DATABASE_CONFIG_PATH.read_text(encoding="utf-8"))
        driver = data.get("driver", "postgresql+psycopg2")
        user = data.get("user")
        password = data.get("password", "")
        host = data.get("host", "localhost")
        port = data.get("port", 5432)
        database = data.get("database")

        if not user or not database:
            raise ValueError("database.json must include 'user' and 'database' fields")

        credentials = user
        if password:
            credentials = f"{user}:{quote_plus(password)}"

        return f"{driver}://{credentials}@{host}:{port}/{database}"

    # Fallback for development environments where the config file is not provided
    return "sqlite:///../app.db"


class Settings(BaseSettings):
    # API Configuration
    GEMINI_API_KEY: str = ""
    GEMINI_BASE_URL: str = "https://aihubmix.com/v1"

    # Database
    DATABASE_URL: str = Field(default_factory=load_database_url)

    # Security
    SECRET_KEY: str = "ai-image-editor-secret-key-2025"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # File Storage
    UPLOAD_DIR: str = "./uploads"
    OUTPUT_DIR: str = "./outputs"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    class Config:
        env_file = ".env"


def get_settings() -> "Settings":
    return Settings()


settings = get_settings()

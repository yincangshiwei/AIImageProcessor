from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # API Configuration
    GEMINI_API_KEY: str = ""
    GEMINI_BASE_URL: str = "https://aihubmix.com/v1"
    
    # Database
    DATABASE_URL: str = "sqlite:///../app.db"
    
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

settings = Settings()
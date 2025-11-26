#!/usr/bin/env python3
import sys
print(f"Python path: {sys.path}")
print(f"Python executable: {sys.executable}")

try:
    import sqlalchemy
    print(f"SQLAlchemy version: {sqlalchemy.__version__}")
except ImportError as e:
    print(f"SQLAlchemy import error: {e}")

try:
    from app.database import engine, get_db
    from app.models import Base
    print("App modules imported successfully")
except ImportError as e:
    print(f"App import error: {e}")

if __name__ == "__main__":
    import uvicorn
    print("Starting server...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000)
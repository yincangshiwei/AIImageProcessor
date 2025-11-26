from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import shutil
from typing import List, Optional
import uuid
from datetime import datetime
import json

# Delayed imports to avoid early database connection
# from app.database import engine, get_db
# from app.models import Base
from app.api import auth, images, cases, users
from app.routers import generations
from app.core.config import settings

app = FastAPI(
    title="AI图像编辑平台 API",
    description="炫酷的AI图像编辑平台后端服务",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "http://localhost:5177",
        "http://127.0.0.1:5177"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Application startup event"""
    # Import and setup database on startup
    from app.database import engine
    from app.models import Base
    
    # Create database tables
    Base.metadata.create_all(bind=engine)
    
    # Create directories
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    os.makedirs("static", exist_ok=True)

# Create directories (fallback)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
os.makedirs("static", exist_ok=True)

# Static files
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Include API routers
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])
app.include_router(images.router, prefix="/api/images", tags=["图像处理"])
app.include_router(cases.router, prefix="/api/cases", tags=["案例管理"])
app.include_router(users.router, prefix="/api/users", tags=["用户管理"])
app.include_router(generations.router, prefix="/api/v1", tags=["图像生成"])

@app.get("/")
async def root():
    return {
        "message": "AI图像编辑平台 API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
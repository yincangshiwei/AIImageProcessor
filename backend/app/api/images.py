from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuthCode, GenerationRecord
from app.core.gemini import GeminiImageProcessor
from app.core.config import settings
import os
import uuid
import json
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import time

router = APIRouter()

class GenerateRequest(BaseModel):
    auth_code: str
    mode_type: str  # "multi" or "puzzle"
    prompt_text: str
    output_count: int = 1
    image_paths: Optional[List[str]] = None

class GenerateResponse(BaseModel):
    success: bool
    message: str
    output_images: Optional[List[str]] = None
    credits_used: Optional[int] = None
    processing_time: Optional[int] = None

@router.post("/upload")
async def upload_images(files: List[UploadFile] = File(...), auth_code: str = Form(...)):
    """上传图像文件"""
    # Verify auth code
    db = next(get_db())
    user = db.query(AuthCode).filter(AuthCode.code == auth_code).first()
    if not user:
        raise HTTPException(status_code=404, detail="授权码不存在")
    
    uploaded_files = []
    
    for file in files:
        # Check file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail=f"不支持的文件类型: {file.content_type}")
        
        # Generate unique filename
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4().hex}.{file_extension}"
        
        # Create user directory
        user_dir = os.path.join(settings.UPLOAD_DIR, auth_code)
        os.makedirs(user_dir, exist_ok=True)
        
        # Save file
        file_path = os.path.join(user_dir, unique_filename)
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        uploaded_files.append({
            "original_name": file.filename,
            "saved_path": file_path,
            "url": f"/uploads/{auth_code}/{unique_filename}"
        })
    
    return {
        "success": True,
        "message": f"成功上传 {len(uploaded_files)} 张图像",
        "files": uploaded_files
    }

@router.post("/generate", response_model=GenerateResponse)
async def generate_images(
    request: GenerateRequest,
    db: Session = Depends(get_db)
):
    """生成图像"""
    # Verify auth code and credits
    user = db.query(AuthCode).filter(AuthCode.code == request.auth_code).first()
    if not user:
        return GenerateResponse(
            success=False,
            message="授权码不存在"
        )
    
    # Calculate credits needed
    credits_needed = request.output_count * 10  # 10 credits per output image
    
    if user.credits < credits_needed:
        return GenerateResponse(
            success=False,
            message=f"积分不足，需要 {credits_needed} 积分，当前余额 {user.credits} 积分"
        )
    
    try:
        # Initialize Gemini processor
        processor = GeminiImageProcessor(
            api_key=settings.GEMINI_API_KEY,
            base_url=settings.GEMINI_BASE_URL
        )
        
        start_time = time.time()
        
        # Process images
        output_images = await processor.process_images(
            image_paths=request.image_paths or [],
            prompt_text=request.prompt_text,
            output_count=request.output_count,
            auth_code=request.auth_code
        )
        
        processing_time = int(time.time() - start_time)
        
        # Deduct credits
        user.credits -= credits_needed
        db.commit()
        
        # Save generation record
        record = GenerationRecord(
            auth_code=request.auth_code,
            mode_type=request.mode_type,
            input_images=json.dumps(request.image_paths or []),
            prompt_text=request.prompt_text,
            output_count=request.output_count,
            output_images=json.dumps(output_images),
            credits_used=credits_needed,
            processing_time=processing_time
        )
        db.add(record)
        db.commit()
        
        return GenerateResponse(
            success=True,
            message="图像生成成功",
            output_images=output_images,
            credits_used=credits_needed,
            processing_time=processing_time
        )
        
    except Exception as e:
        return GenerateResponse(
            success=False,
            message=f"生成失败: {str(e)}"
        )
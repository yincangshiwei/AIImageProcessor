from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuthCode, GenerationRecord
from app.core.credits_manager import (
    get_total_available_credits,
    get_team_credits,
    deduct_credits,
    resolve_model_credit_cost,
)
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
    model_name: Optional[str] = None

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
    
    target_model_name = (request.model_name or settings.DEFAULT_IMAGE_MODEL_NAME).strip()
    _, unit_cost = resolve_model_credit_cost(db, target_model_name)
    credits_needed = unit_cost * max(1, request.output_count)

    if credits_needed > 0:
        available_credits = get_total_available_credits(user)
        team_balance = get_team_credits(user)
        personal_balance = user.credits or 0
        if available_credits < credits_needed:
            return GenerateResponse(
                success=False,
                message=(
                    f"积分不足，需要 {credits_needed} 积分，"
                    f"团队余额 {team_balance} · 个人余额 {personal_balance}"
                ),
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
            auth_code=request.auth_code,
            model_name=target_model_name,
        )
        
        processing_time = int(time.time() - start_time)
        
        # Deduct credits (team first)
        if credits_needed > 0:
            deduct_credits(db, user, credits_needed)
        
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
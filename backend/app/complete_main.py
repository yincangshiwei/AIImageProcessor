from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import shutil
from typing import List, Optional, Literal
import uuid
from datetime import datetime
import json
import sqlite3
from pydantic import BaseModel, Field
import asyncio
from app.core.gemini import GeminiImageProcessor
from app.core.config import settings

app = FastAPI(
    title="AI图像编辑平台 API",
    description="炫酷的AI图像编辑平台后端服务",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directories
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
os.makedirs("static", exist_ok=True)

# Mount static files
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Database helper
def get_db_connection():
    conn = sqlite3.connect('/workspace/app.db')
    conn.row_factory = sqlite3.Row
    return conn

# Pydantic models
class AuthRequest(BaseModel):
    code: str

class AuthResponse(BaseModel):
    success: bool
    message: str
    user_data: Optional[dict] = None

DEFAULT_MODULE_NAME = "AI图像:多图模式"
MODULE_NAME_BY_LEGACY_MODE = {
    "multi": DEFAULT_MODULE_NAME,
    "puzzle": "AI图像:拼图模式-图像拼接",
    "puzzle_image_merge": "AI图像:拼图模式-图像拼接",
    "puzzle_custom_canvas": "AI图像:拼图模式-自定义画布",
}


def map_legacy_mode_to_module(legacy_mode: Optional[str]) -> str:
    if not legacy_mode:
        return DEFAULT_MODULE_NAME
    return MODULE_NAME_BY_LEGACY_MODE.get(legacy_mode, DEFAULT_MODULE_NAME)


class GenerateRequest(BaseModel):
    auth_code: str
    module_name: str = DEFAULT_MODULE_NAME
    media_type: Literal["image", "video"] = "image"
    prompt_text: str
    output_count: int = 1
    legacy_mode_type: Optional[str] = Field(None, alias="mode_type")

    class Config:
        allow_population_by_field_name = True


class GenerateResponse(BaseModel):
    success: bool
    message: str
    output_images: Optional[List[str]] = None
    credits_used: Optional[int] = None
    processing_time: Optional[int] = None

@app.get("/")
async def root():
    return {
        "message": "AI图像编辑平台 API",
        "version": "1.0.0",
        "status": "running",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy", 
        "timestamp": datetime.utcnow().isoformat(),
        "database": "connected",
        "ai_engine": "ready"
    }

# Auth endpoints
@app.post("/api/auth/verify", response_model=AuthResponse)
async def verify_auth_code(request: AuthRequest):
    """验证授权码"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM auth_codes WHERE code = ?", (request.code,))
        auth_code = cursor.fetchone()
        
        if not auth_code:
            return AuthResponse(
                success=False,
                message="授权码不存在"
            )
        
        if auth_code[4] != 'active':  # status
            return AuthResponse(
                success=False,
                message=f"授权码状态异常: {auth_code[4]}"
            )
        
        return AuthResponse(
            success=True,
            message="验证成功",
            user_data={
                "code": auth_code[1],
                "credits": auth_code[2],
                "expire_time": auth_code[3],
                "status": auth_code[4]
            }
        )
    
    except Exception as e:
        return AuthResponse(
            success=False,
            message=f"系统错误: {str(e)}"
        )
    finally:
        conn.close()

@app.get("/api/auth/user-info/{code}")
async def get_user_info(code: str):
    """获取用户信息"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM auth_codes WHERE code = ?", (code,))
        auth_code = cursor.fetchone()
        
        if not auth_code:
            return {"error": "授权码不存在"}
        
        return {
            "code": auth_code[1],
            "credits": auth_code[2],
            "status": auth_code[4],
            "expire_time": auth_code[3],
            "created_at": auth_code[5]
        }
    
    except Exception as e:
        return {"error": f"系统错误: {str(e)}"}
    finally:
        conn.close()

# Image processing endpoints
@app.post("/api/images/upload")
async def upload_images(files: List[UploadFile] = File(...), auth_code: str = Form(...)):
    """上传图像文件"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify auth code
    cursor.execute("SELECT * FROM auth_codes WHERE code = ?", (auth_code,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=404, detail="授权码不存在")
    
    if user[4] != 'active':
        raise HTTPException(status_code=403, detail="授权码未激活")
    
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

@app.post("/api/images/generate", response_model=GenerateResponse)
async def generate_images(request: GenerateRequest, image_paths: List[str] = None):
    """AI图像生成"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Verify auth code and credits
        cursor.execute("SELECT * FROM auth_codes WHERE code = ?", (request.auth_code,))
        user = cursor.fetchone()
        
        if not user:
            return GenerateResponse(
                success=False,
                message="授权码不存在"
            )
        
        # Calculate credits needed
        credits_needed = request.output_count * 10  # 10 credits per output image
        
        if user[2] < credits_needed:  # credits
            return GenerateResponse(
                success=False,
                message=f"积分不足，需要 {credits_needed} 积分，当前余额 {user[2]} 积分"
            )
        
        # Initialize Gemini processor
        processor = GeminiImageProcessor(
            api_key=settings.GEMINI_API_KEY,
            base_url=settings.GEMINI_BASE_URL
        )
        
        import time
        start_time = time.time()
        
        # Process images - 如果没有上传图片，创建示例图片路径
        if not image_paths:
            image_paths = []
        
        try:
            # Process images with AI
            output_images = await processor.process_images(
                image_paths=image_paths,
                prompt_text=request.prompt_text,
                output_count=request.output_count,
                auth_code=request.auth_code
            )
            
            processing_time = int(time.time() - start_time)
            
            # Deduct credits
            new_credits = user[2] - credits_needed
            cursor.execute(
                "UPDATE auth_codes SET credits = ?, updated_at = ? WHERE code = ?",
                (new_credits, datetime.utcnow().isoformat(), request.auth_code)
            )
            
            # Save generation record
            module_name = request.module_name or map_legacy_mode_to_module(request.legacy_mode_type)
            media_type = request.media_type or "image"
            cursor.execute(
                """
                INSERT INTO generation_records 
                (auth_code, media_type, module_name, input_images, prompt_text, output_count, output_images, output_videos, credits_used, processing_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.auth_code,
                    media_type,
                    module_name,
                    json.dumps(image_paths or []),
                    request.prompt_text,
                    request.output_count,
                    json.dumps(output_images),
                    None,
                    credits_needed,
                    processing_time
                )
            )
            
            conn.commit()
            
            return GenerateResponse(
                success=True,
                message="图像生成成功",
                output_images=output_images,
                credits_used=credits_needed,
                processing_time=processing_time
            )
            
        except Exception as ai_error:
            return GenerateResponse(
                success=False,
                message=f"AI处理失败: {str(ai_error)}"
            )
        
    except Exception as e:
        return GenerateResponse(
            success=False,
            message=f"系统错误: {str(e)}"
        )
    finally:
        conn.close()

# Cases endpoints
@app.get("/api/cases/list")
async def get_cases(category: Optional[str] = None, mode_type: Optional[str] = None):
    """获取案例列表"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        query = "SELECT * FROM template_cases"
        params = []
        
        conditions = []
        if category:
            conditions.append("category = ?")
            params.append(category)
        if mode_type:
            conditions.append("mode_type = ?")
            params.append(mode_type)
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        query += " ORDER BY popularity DESC"
        
        cursor.execute(query, params)
        cases = cursor.fetchall()
        
        result = []
        for case in cases:
            result.append({
                "id": case[0],
                "category": case[1],
                "title": case[2],
                "description": case[3],
                "preview_image": case[4],
                "input_images": json.loads(case[5]) if case[5] else [],
                "prompt_text": case[6],
                "tags": json.loads(case[7]) if case[7] else [],
                "popularity": case[8],
                "mode_type": case[9]
            })
        
        return result
    
    except Exception as e:
        return []
    finally:
        conn.close()

@app.get("/api/cases/recommend")
async def recommend_cases(prompt: str, limit: int = 5):
    """智能推荐案例"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM template_cases")
        cases = cursor.fetchall()
        
        keywords = prompt.lower().split()
        scored_cases = []
        
        for case in cases:
            score = 0
            case_text = (case[2] + " " + (case[3] or "") + " " + case[6]).lower()
            
            for keyword in keywords:
                if keyword in case_text:
                    score += 1
            
            if case[7]:  # tags
                tags = json.loads(case[7])
                for tag in tags:
                    if tag.lower() in prompt.lower():
                        score += 2
            
            if score > 0:
                scored_cases.append((case, score))
        
        scored_cases.sort(key=lambda x: x[1], reverse=True)
        
        result = []
        for case, score in scored_cases[:limit]:
            result.append({
                "id": case[0],
                "category": case[1],
                "title": case[2],
                "description": case[3],
                "preview_image": case[4],
                "input_images": json.loads(case[5]) if case[5] else [],
                "prompt_text": case[6],
                "tags": json.loads(case[7]) if case[7] else [],
                "popularity": case[8],
                "mode_type": case[9],
                "match_score": score
            })
        
        return result
    
    except Exception as e:
        return []
    finally:
        conn.close()

@app.get("/api/users/credits/{auth_code}")
async def get_user_credits(auth_code: str):
    """获取用户积分余额"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT code, credits, status FROM auth_codes WHERE code = ?", (auth_code,))
        user = cursor.fetchone()
        
        if not user:
            return {"error": "授权码不存在"}
        
        return {
            "code": user[0],
            "credits": user[1],
            "status": user[2]
        }
    
    except Exception as e:
        return {"error": f"系统错误: {str(e)}"}
    finally:
        conn.close()

# History endpoints
@app.get("/api/users/history/{auth_code}")
async def get_user_history(auth_code: str, limit: int = 50):
    """获取用户历史记录"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM auth_codes WHERE code = ?", (auth_code,))
        user = cursor.fetchone()
        
        if not user:
            return {"error": "授权码不存在"}
        
        cursor.execute(
            """
            SELECT * FROM generation_records 
            WHERE auth_code = ? 
            ORDER BY created_at DESC 
            LIMIT ?
            """,
            (auth_code, limit)
        )
        records = cursor.fetchall()
        
        result = []
        for record in records:
            module_name = record["module_name"] if record["module_name"] else DEFAULT_MODULE_NAME
            media_type = record["media_type"] if record["media_type"] else "image"
            result.append({
                "id": record["id"],
                "module_name": module_name,
                "media_type": media_type,
                "input_images": json.loads(record["input_images"]) if record["input_images"] else [],
                "prompt_text": record["prompt_text"],
                "output_count": record["output_count"],
                "output_images": json.loads(record["output_images"]) if record["output_images"] else [],
                "output_videos": json.loads(record["output_videos"]) if record["output_videos"] else [],
                "credits_used": record["credits_used"],
                "processing_time": record["processing_time"] or 0,
                "created_at": record["created_at"]
            })
        
        return result
    
    except Exception as e:
        return {"error": f"系统错误: {str(e)}"}
    finally:
        conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.complete_main:app", host="0.0.0.0", port=8000, reload=True)
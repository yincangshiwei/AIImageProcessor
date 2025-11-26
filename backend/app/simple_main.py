from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from datetime import datetime
import os
import sqlite3
import json
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(
    title="AI图像编辑平台 API",
    description="炫酷的AI图像编辑平台后端服务", 
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create directories
os.makedirs("uploads", exist_ok=True)
os.makedirs("outputs", exist_ok=True)
os.makedirs("static", exist_ok=True)

# Mount static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")
app.mount("/static", StaticFiles(directory="static"), name="static")

# Database helper
def get_db_connection():
    return sqlite3.connect('/workspace/app.db')

# Pydantic models
class AuthRequest(BaseModel):
    code: str

class AuthResponse(BaseModel):
    success: bool
    message: str
    user_data: Optional[dict] = None

class CaseResponse(BaseModel):
    id: int
    category: str
    title: str
    description: Optional[str]
    preview_image: Optional[str]
    input_images: List[str]
    prompt_text: str
    tags: List[str]
    popularity: int
    mode_type: str

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
        "database": "connected"
    }

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
        
        # auth_code: (id, code, credits, expire_time, status, created_at, updated_at)
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

@app.get("/api/cases/list", response_model=List[CaseResponse])
async def get_cases(
    category: Optional[str] = None,
    mode_type: Optional[str] = None
):
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
            # case: (id, category, title, description, preview_image, input_images, prompt_text, tags, popularity, mode_type, created_at, updated_at)
            result.append(CaseResponse(
                id=case[0],
                category=case[1],
                title=case[2],
                description=case[3],
                preview_image=case[4],
                input_images=json.loads(case[5]) if case[5] else [],
                prompt_text=case[6],
                tags=json.loads(case[7]) if case[7] else [],
                popularity=case[8],
                mode_type=case[9]
            ))
        
        return result
    
    except Exception as e:
        return []
    finally:
        conn.close()

@app.get("/api/cases/recommend")
async def recommend_cases(
    prompt: str,
    limit: int = 5
):
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
            case_text = (case[2] + " " + (case[3] or "") + " " + case[6]).lower()  # title + description + prompt_text
            
            # Keyword matching
            for keyword in keywords:
                if keyword in case_text:
                    score += 1
            
            # Tags matching
            if case[7]:  # tags
                tags = json.loads(case[7])
                for tag in tags:
                    if tag.lower() in prompt.lower():
                        score += 2
            
            if score > 0:
                scored_cases.append((case, score))
        
        # Sort by score and return top results
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.simple_main:app", host="0.0.0.0", port=8000, reload=True)
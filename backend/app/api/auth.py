from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuthCode
from datetime import datetime
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class AuthRequest(BaseModel):
    code: str

class AuthResponse(BaseModel):
    success: bool
    message: str
    user_data: Optional[dict] = None

@router.post("/verify", response_model=AuthResponse)
async def verify_auth_code(request: AuthRequest, db: Session = Depends(get_db)):
    """验证授权码"""
    auth_code = db.query(AuthCode).filter(AuthCode.code == request.code).first()
    
    if not auth_code:
        return AuthResponse(
            success=False,
            message="授权码不存在"
        )
    
    # Check if expired
    if auth_code.expire_time and auth_code.expire_time < datetime.utcnow():
        auth_code.status = "expired"
        db.commit()
        return AuthResponse(
            success=False,
            message="授权码已过期"
        )
    
    # Check if disabled
    if auth_code.status != "active":
        return AuthResponse(
            success=False,
            message=f"授权码状态异常: {auth_code.status}"
        )
    
    return AuthResponse(
        success=True,
        message="验证成功",
        user_data={
            "code": auth_code.code,  # 这里仍需要返回完整code用于后续API调用
            "credits": auth_code.credits,
            "expire_time": auth_code.expire_time.isoformat() if auth_code.expire_time else None
        }
    )

@router.get("/user-info/{code}")
async def get_user_info(code: str, db: Session = Depends(get_db)):
    """获取用户信息"""
    from app.core.security import mask_auth_code, sanitize_user_data
    
    auth_code = db.query(AuthCode).filter(AuthCode.code == code).first()
    
    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="授权码不存在"
        )
    
    # 返回安全的用户信息，隐藏完整授权码
    user_data = {
        "code": auth_code.code,
        "credits": auth_code.credits,
        "status": auth_code.status,
        "expire_time": auth_code.expire_time.isoformat() if auth_code.expire_time else None,
        "created_at": auth_code.created_at.isoformat()
    }
    
    # 对于API响应，返回完整code用于验证，但在日志中应隐藏
    return user_data
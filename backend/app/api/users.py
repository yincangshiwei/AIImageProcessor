from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import GenerationRecord, AuthCode
from app.core.credits_manager import get_total_available_credits
from typing import List
from pydantic import BaseModel
import json
from datetime import datetime

router = APIRouter()


class HistoryRecord(BaseModel):
    id: int
    mode_type: str
    input_images: List[str]
    prompt_text: str
    output_count: int
    output_images: List[str]
    credits_used: int
    processing_time: int
    created_at: str


@router.get("/history/{auth_code}", response_model=List[HistoryRecord])
async def get_user_history(
    auth_code: str,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """获取用户历史记录"""
    # Verify auth code
    user = db.query(AuthCode).filter(AuthCode.code == auth_code).first()
    if not user:
        raise HTTPException(status_code=404, detail="授权码不存在")
    
    records = db.query(GenerationRecord).filter(
        GenerationRecord.auth_code == auth_code
    ).order_by(GenerationRecord.created_at.desc()).limit(limit).all()
    
    result = []
    for record in records:
        result.append(HistoryRecord(
            id=record.id,
            mode_type=record.mode_type,
            input_images=json.loads(record.input_images) if record.input_images else [],
            prompt_text=record.prompt_text,
            output_count=record.output_count,
            output_images=json.loads(record.output_images) if record.output_images else [],
            credits_used=record.credits_used,
            processing_time=record.processing_time or 0,
            created_at=record.created_at.isoformat()
        ))
    
    return result


@router.get("/credits/{auth_code}")
async def get_user_credits(auth_code: str, db: Session = Depends(get_db)):
    """获取用户积分余额"""
    user = db.query(AuthCode).filter(AuthCode.code == auth_code).first()
    if not user:
        raise HTTPException(status_code=404, detail="授权码不存在")
    
    team = user.team
    team_payload = None
    team_credits = 0
    if team:
        team_credits = team.credits
        team_payload = {
            "id": team.id,
            "name": team.name,
            "display_name": team.display_name,
            "description": team.description,
        }
    
    # 不在响应中返回完整授权码
    return {
        "credits": user.credits,
        "team_credits": team_credits,
        "available_credits": get_total_available_credits(user),
        "team_role": user.team_role,
        "team": team_payload,
        "status": user.status
    }

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuthCode
from app.core.credits_manager import get_total_available_credits
from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional

router = APIRouter()

class AuthRequest(BaseModel):
    code: str

class AuthCodeClientPayload(BaseModel):
    code: str
    credits: int
    expire_time: Optional[str] = None
    status: str
    description: Optional[str] = None
    ip_whitelist: List[str] = Field(default_factory=list)
    allowed_models: List[str] = Field(default_factory=list)
    contact_name: Optional[str] = None
    creator_name: Optional[str] = None
    phone_number: Optional[str] = None
    team_id: Optional[int] = None
    team_role: Optional[str] = None
    team_name: Optional[str] = None
    team_display_name: Optional[str] = None
    team_description: Optional[str] = None
    team_credits: Optional[int] = None
    available_credits: Optional[int] = None

class AuthCodeDetailResponse(AuthCodeClientPayload):
    created_at: str
    updated_at: str

class AuthResponse(BaseModel):
    success: bool
    message: str
    user_data: Optional[AuthCodeClientPayload] = None

class AuthCodeProfileUpdate(BaseModel):
    contact_name: Optional[str] = Field(None, max_length=120)
    creator_name: Optional[str] = Field(None, max_length=150)
    phone_number: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    ip_whitelist: Optional[List[str]] = None
    allowed_models: Optional[List[str]] = None


def _parse_delimited_values(raw: Optional[str], delimiter: str) -> List[str]:
    if not raw:
        return []
    values = []
    for item in raw.split(delimiter):
        trimmed = item.strip()
        if trimmed:
            values.append(trimmed)
    return values


def _serialize_delimited_values(values: Optional[List[str]], delimiter: str) -> Optional[str]:
    if not values:
        return None
    normalized = [value.strip() for value in values if value and value.strip()]
    return delimiter.join(normalized) if normalized else None


def _sanitize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _build_auth_code_payload(auth_code: AuthCode) -> AuthCodeClientPayload:
    team = auth_code.team
    team_name = team.name if team else None
    team_display_name = (team.display_name or team_name) if team else None
    team_description = team.description if team else None
    team_credits = team.credits if team else None

    return AuthCodeClientPayload(
        code=auth_code.code,
        credits=auth_code.credits,
        expire_time=auth_code.expire_time.isoformat() if auth_code.expire_time else None,
        status=auth_code.status,
        description=auth_code.description,
        ip_whitelist=_parse_delimited_values(auth_code.ip_whitelist, ";"),
        allowed_models=_parse_delimited_values(auth_code.allowed_models, ","),
        contact_name=auth_code.contact_name,
        creator_name=auth_code.creator_name,
        phone_number=auth_code.phone_number,
        team_id=team.id if team else None,
        team_role=auth_code.team_role,
        team_name=team_name,
        team_display_name=team_display_name,
        team_description=team_description,
        team_credits=team_credits,
        available_credits=get_total_available_credits(auth_code),
    )


def _build_auth_code_detail(auth_code: AuthCode) -> AuthCodeDetailResponse:
    payload = _build_auth_code_payload(auth_code)
    return AuthCodeDetailResponse(
        **payload.dict(),
        created_at=auth_code.created_at.isoformat(),
        updated_at=auth_code.updated_at.isoformat(),
    )


def _apply_profile_updates(auth_code: AuthCode, payload: AuthCodeProfileUpdate) -> None:
    if payload.contact_name is not None:
        auth_code.contact_name = _sanitize_optional_text(payload.contact_name)
    if payload.creator_name is not None:
        auth_code.creator_name = _sanitize_optional_text(payload.creator_name)
    if payload.phone_number is not None:
        auth_code.phone_number = _sanitize_optional_text(payload.phone_number)
    if payload.description is not None:
        auth_code.description = _sanitize_optional_text(payload.description)
    if payload.ip_whitelist is not None:
        auth_code.ip_whitelist = _serialize_delimited_values(payload.ip_whitelist, ";")
    if payload.allowed_models is not None:
        auth_code.allowed_models = _serialize_delimited_values(payload.allowed_models, ",")


def _update_auth_code_profile(
    code: str,
    payload: AuthCodeProfileUpdate,
    db: Session,
) -> AuthCodeDetailResponse:
    auth_code = db.query(AuthCode).filter(AuthCode.code == code).first()

    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="授权码不存在",
        )

    _apply_profile_updates(auth_code, payload)
    db.commit()
    db.refresh(auth_code)
    return _build_auth_code_detail(auth_code)


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
        user_data=_build_auth_code_payload(auth_code)
    )

@router.get("/user-info/{code}", response_model=AuthCodeDetailResponse)
async def get_user_info(code: str, db: Session = Depends(get_db)):
    """获取用户信息"""
    auth_code = db.query(AuthCode).filter(AuthCode.code == code).first()
    
    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="授权码不存在"
        )
    
    return _build_auth_code_detail(auth_code)


@router.patch("/user-info/{code}", response_model=AuthCodeDetailResponse)
async def update_user_info(
    code: str,
    payload: AuthCodeProfileUpdate,
    db: Session = Depends(get_db),
):
    """更新授权码的可维护字段 (PATCH)"""
    return _update_auth_code_profile(code, payload, db)


@router.post("/user-info/{code}/profile", response_model=AuthCodeDetailResponse)
async def update_user_info_via_post(
    code: str,
    payload: AuthCodeProfileUpdate,
    db: Session = Depends(get_db),
):
    """部分代理不允许 PATCH 时的兜底写入接口"""
    return _update_auth_code_profile(code, payload, db)


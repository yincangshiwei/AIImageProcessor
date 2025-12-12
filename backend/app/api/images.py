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
from app.tool.TenCentCloudTool import TenCentCloudTool
from app.tool.AiHubMixTool import AiHubMixTool, ai_models_config
from app.core.config import settings
import os
import uuid
import json
from typing import List, Optional, Literal
from pydantic import BaseModel, Field

from datetime import datetime
import time
import asyncio

router = APIRouter()


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


def sanitize_auth_code(value: Optional[str]) -> str:
    candidate = (value or "anonymous").strip()
    return candidate or "anonymous"


def build_storage_key(auth_code: str, category: str, filename: str) -> str:
    sanitized = sanitize_auth_code(auth_code)
    date_prefix = datetime.utcnow().strftime("%Y-%m-%d")
    normalized_name = filename.strip().replace("\\", "/") or uuid.uuid4().hex
    return f"{sanitized}/aiimage/{category}/{date_prefix}/{normalized_name}"


def build_cos_url_from_key(key: str) -> str:
    base = settings.COS_CDN_BASE_URL.rstrip("/")
    normalized = key.lstrip("/")
    return f"{base}/{normalized}"


def extract_storage_key_from_location(location: str) -> str:
    marker = "/AIImageProcessor/"
    if marker in location:
        return location.split(marker, 1)[1]
    return location.lstrip("/")


def resolve_image_sources(values: Optional[List[str]]) -> List[str]:
    if not values:
        return []
    sources: List[str] = []
    for item in values:
        if not item:
            continue
        stripped = item.strip()
        if stripped.startswith(("http://", "https://")):
            sources.append(stripped)
        else:
            sources.append(build_cos_url_from_key(stripped))
    return sources


def find_aihub_model_config(model_name: Optional[str]) -> Optional[dict]:
    if not model_name:
        return None
    for group in ai_models_config.values():
        if isinstance(group, dict) and model_name in group:
            return group[model_name]
    return None


class GenerateRequest(BaseModel):

    auth_code: str
    module_name: str = DEFAULT_MODULE_NAME
    media_type: Literal["image", "video"] = "image"
    prompt_text: str
    output_count: int = 1
    image_paths: Optional[List[str]] = None
    model_name: Optional[str] = None
    aspect_ratio: Optional[str] = None
    image_size: Optional[str] = None
    legacy_mode_type: Optional[str] = Field(None, alias="mode_type")

    class Config:
        allow_population_by_field_name = True



class GenerateResponse(BaseModel):
    success: bool
    message: str
    output_images: Optional[List[str]] = None
    credits_used: Optional[int] = None
    processing_time: Optional[int] = None

@router.post("/upload")
async def upload_images(files: List[UploadFile] = File(...), auth_code: str = Form(...)):
    """上传图像文件"""
    db = next(get_db())
    user = db.query(AuthCode).filter(AuthCode.code == auth_code).first()
    if not user:
        raise HTTPException(status_code=404, detail="授权码不存在")

    cos_client = TenCentCloudTool().init(settings.TENCENT_CLOUD_APP_ID).buildClient(settings.COS_REGION)
    uploaded_files = []

    for file in files:
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail=f"不支持的文件类型: {file.content_type}")

        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail=f"文件 {file.filename or 'unknown'} 内容为空")

        original_name = file.filename or f"upload_{uuid.uuid4().hex}.png"
        extension = os.path.splitext(original_name)[1] or ".png"
        safe_filename = f"{uuid.uuid4().hex}{extension.lower()}"
        object_key = build_storage_key(auth_code, "gen/upload", safe_filename)

        payload = {
            "name": original_name,
            "type": file.content_type or "application/octet-stream",
            "body": contents,
        }

        try:
            response = cos_client.upload_file(
                bucket=settings.COS_BUCKET,
                file=payload,
                fileName=object_key,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"图片上传失败: {exc}") from exc

        if not response.get("success"):
            raise HTTPException(status_code=502, detail=response.get("data") or "图片上传失败")

        uploaded_files.append({
            "original_name": original_name,
            "storage_key": object_key,
            "url": build_cos_url_from_key(object_key),
        })

    return {
        "success": True,
        "message": f"成功上传 {len(uploaded_files)} 张图像",
        "files": uploaded_files,
    }


@router.post("/generate", response_model=GenerateResponse)
async def generate_images(
    request: GenerateRequest,
    db: Session = Depends(get_db)
):
    """生成图像"""
    user = db.query(AuthCode).filter(AuthCode.code == request.auth_code).first()
    if not user:
        return GenerateResponse(success=False, message="授权码不存在")

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

    model_config = find_aihub_model_config(target_model_name)
    platform = (model_config or {}).get("model_platform")
    client_type = "openai" if platform == "openai" else "genai"
    ai_tool = AiHubMixTool().init("int_serv").init_client(type=client_type)

    normalized_input_keys: List[str] = []
    if request.image_paths:
        for value in request.image_paths:
            if not value:
                continue
            stripped = value.strip()
            if stripped.startswith(("http://", "https://")):
                normalized_input_keys.append(extract_storage_key_from_location(stripped))
            else:
                normalized_input_keys.append(stripped)

    input_image_urls = resolve_image_sources(normalized_input_keys)

    aspect_ratio = (request.aspect_ratio or "").strip()
    if aspect_ratio == "智能":
        aspect_ratio = ""

    generation_kwargs = {}
    if aspect_ratio and (not model_config or model_config.get("if_image_radio")):
        generation_kwargs["gen_ratio"] = aspect_ratio

    if model_config and model_config.get("if_image_size"):
        generation_kwargs["image_size"] = request.image_size or "1K"
    elif not model_config:
        generation_kwargs["image_size"] = request.image_size or "1K"

    def compact_params(payload: dict) -> dict:
        sanitized: dict = {}
        for key, value in payload.items():
            if value is None:
                continue
            if isinstance(value, str):
                trimmed = value.strip()
                if not trimmed:
                    continue
                sanitized[key] = trimmed
                continue
            if isinstance(value, (list, dict)):
                if not value:
                    continue
                sanitized[key] = value
                continue
            sanitized[key] = value
        return sanitized

    start_time = time.time()

    try:
        response = await asyncio.to_thread(
            lambda: ai_tool.image(
                model=target_model_name,
                user_prompt=request.prompt_text,
                images=input_image_urls,
                gen_number=max(1, request.output_count),
                **generation_kwargs,
            )
        )
    except Exception as exc:
        return GenerateResponse(success=False, message=f"生成失败: {exc}")

    if not response.get("success"):
        return GenerateResponse(success=False, message=response.get("data") or "生成失败")

    output_locations = response.get("data") or []
    if isinstance(output_locations, str):
        output_locations = [output_locations]

    if not isinstance(output_locations, list) or not output_locations:
        return GenerateResponse(success=False, message="生成失败: 未返回有效图片")

    output_storage_keys = [
        extract_storage_key_from_location(item)
        for item in output_locations
        if item
    ]

    if not output_storage_keys:
        return GenerateResponse(success=False, message="生成失败: 未返回有效图片")

    processing_time = int(time.time() - start_time)

    if credits_needed > 0:
        deduct_credits(db, user, credits_needed)

    module_name = request.module_name or map_legacy_mode_to_module(request.legacy_mode_type)
    media_type = request.media_type or "image"
    ext_param_payload = compact_params({
        "model_name": target_model_name,
        "module_name": module_name,
        "media_type": media_type,
        "output_count": request.output_count,
        "aspect_ratio": generation_kwargs.get("gen_ratio") or aspect_ratio,
        "image_size": generation_kwargs.get("image_size"),
        "legacy_mode_type": request.legacy_mode_type,
        "input_image_count": len(normalized_input_keys),
    })
    record = GenerationRecord(
        auth_code=request.auth_code,
        media_type=media_type,
        module_name=module_name,
        input_images=json.dumps(normalized_input_keys),
        input_ext_param=json.dumps(ext_param_payload) if ext_param_payload else None,
        prompt_text=request.prompt_text,
        output_count=request.output_count,
        output_images=json.dumps(output_storage_keys),
        output_videos=None,
        credits_used=credits_needed,
        processing_time=processing_time,
    )


    db.add(record)
    db.commit()

    return GenerateResponse(
        success=True,
        message="图像生成成功",
        output_images=output_storage_keys,
        credits_used=credits_needed,
        processing_time=processing_time,
    )

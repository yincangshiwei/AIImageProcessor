from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import List, Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.crud import crud_generation, crude_auth_code as crud_auth_code
from app.schemas import GenerationRecordCreate, GenerationRecordResponse
from app.core.image_processor import image_processor
from app.core.credits_manager import (
    get_total_available_credits,
    get_team_credits,
    deduct_credits,
    resolve_model_credit_cost,
)
from app.core.config import settings
from openai import OpenAI
import uuid
import os
import base64
from io import BytesIO
from PIL import Image
from datetime import datetime

router = APIRouter(tags=["图像生成"])


@router.post("/ai-edit", response_model=GenerationRecordResponse)
async def ai_edit_images(
    auth_code: str = Form(..., description="授权码"),
    prompt: str = Form(..., description="编辑提示词"),
    model_name: Optional[str] = Form(None, description="指定使用的模型名称"),
    images: List[UploadFile] = File(..., description="要处理的图片文件列表（支持多张）"),
    db: Session = Depends(get_db)
):
    """集成GeminiImage.py的功能，实现AI图像编辑"""
    
    # 验证授权码
    auth_record = crud_auth_code.get_by_code(db, auth_code)
    if not auth_record or auth_record.status != "active":
        raise HTTPException(status_code=401, detail="无效的授权码")
    
    target_model_name = (model_name or settings.DEFAULT_IMAGE_MODEL_NAME).strip()
    _, required_credits = resolve_model_credit_cost(db, target_model_name)
    if required_credits > 0:
        available_credits = get_total_available_credits(auth_record)
        if available_credits < required_credits:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"积分余额不足，团队余额 {get_team_credits(auth_record)} "
                    f"· 个人余额 {auth_record.credits or 0}"
                ),
            )
    
    # 验证图片数量
    if not 1 <= len(images) <= 5:
        raise HTTPException(status_code=400, detail="图片数量必须在1-5张之间")
    
    # 生成唯一的生成ID
    generation_id = str(uuid.uuid4())
    
    try:
        # 保存上传的图片文件
        upload_dir = "./uploads"
        os.makedirs(upload_dir, exist_ok=True)
        
        image_paths = []
        for upload_file in images:
            if not upload_file.content_type.startswith('image/'):
                raise HTTPException(status_code=400, detail=f"文件 {upload_file.filename} 不是有效的图片格式")
            
            # 生成唯一文件名
            file_extension = upload_file.filename.split('.')[-1] if '.' in upload_file.filename else 'jpg'
            unique_filename = f"{uuid.uuid4().hex}.{file_extension}"
            file_path = os.path.join(upload_dir, unique_filename)
            
            # 保存文件
            contents = await upload_file.read()
            with open(file_path, 'wb') as f:
                f.write(contents)
                
            image_paths.append(file_path)
        
        # 初始OpenAI客户端
        client = OpenAI(
            api_key=os.getenv("GEMINI_API_KEY", ""),
            base_url=os.getenv("GEMINI_BASE_URL", "https://aihubmix.com/v1"),
        )
        
        # 开始处理时间
        start_time = datetime.now()
        
        # 编码图片为base64格式
        content = [
            {
                "type": "text",
                "text": prompt,
            }
        ]
        
        # 为每个图片添加image_url对象
        for image_path in image_paths:
            with open(image_path, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode("utf-8")
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                })
        
        # 调用AI图像编辑API
        response = client.chat.completions.create(
            model=target_model_name,
            messages=[
                {
                    "role": "user",
                    "content": content,
                },
            ],
            modalities=["text", "image"],
            temperature=0.7,
        )
        
        # 处理时间（秒）
        processing_time = (datetime.now() - start_time).total_seconds()
        
        # 初始化结果
        output_dir = "./outputs"
        os.makedirs(output_dir, exist_ok=True)
        
        text_response = None
        output_images = []
        
        # 检查是否有多模态内容
        if (
            hasattr(response.choices[0].message, "multi_mod_content")
            and response.choices[0].message.multi_mod_content is not None
        ):
            for part in response.choices[0].message.multi_mod_content:
                # 处理文本内容
                if "text" in part and part["text"] is not None:
                    text_response = part["text"]
                
                # 处理图片内容
                elif "inline_data" in part and part["inline_data"] is not None:
                    image_data = base64.b64decode(part["inline_data"]["data"])
                    mime_type = part["inline_data"].get("mime_type", "image/png")
                    
                    # 保存生成的图片
                    output_filename = f"{generation_id}_{uuid.uuid4().hex}.jpg"
                    output_path = os.path.join(output_dir, output_filename)
                    
                    image = Image.open(BytesIO(image_data))
                    image.save(output_path, "JPEG")
                    
                    output_images.append({
                        "filename": output_filename,
                        "path": output_path,
                        "mime_type": mime_type,
                        "size": len(image_data)
                    })
        else:
            raise HTTPException(status_code=500, detail="AI服务未返回有效的多模态响应")
        
        # 创建生成记录
        generation_data = GenerationRecordCreate(
            generation_id=generation_id,
            auth_code_id=auth_record.id,
            prompt=prompt,
            input_images_count=len(images),
            output_images_count=len(output_images),
            credits_used=required_credits,
            processing_time=processing_time,
            status="completed"
        )
        
        # 保存到数据库
        db_generation = crud_generation.create(db, obj_in=generation_data)
        
        # 扣除积分（团队优先）
        if required_credits > 0:
            deduct_credits(db, auth_record, required_credits)
        
        # 构建响应数据
        response_data = {
            "id": db_generation.id,
            "generation_id": generation_id,
            "auth_code_id": auth_record.id,
            "prompt": prompt,
            "input_images_count": len(images),
            "output_images_count": len(output_images),
            "credits_used": required_credits,
            "processing_time": processing_time,
            "status": "completed",
            "created_at": db_generation.created_at,
            "text_response": text_response,
            "output_images": [
                {
                    "filename": img["filename"],
                    "download_url": f"/api/v1/generations/download/{img['filename']}",
                    "size": img["size"]
                }
                for img in output_images
            ]
        }
        
        # 清理临时上传文件
        for image_path in image_paths:
            try:
                os.remove(image_path)
            except Exception:
                pass  # 忽略删除错误
        
        return response_data
        
    except Exception as e:
        # 清理临时文件
        for image_path in image_paths if 'image_paths' in locals() else []:
            try:
                os.remove(image_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"图像编辑失败: {str(e)}")


@router.post("/collage", response_model=GenerationRecordResponse)
async def generate_collage(
    auth_code: str = Form(..., description="授权码"),
    prompt: str = Form(..., description="拼图编辑提示词"),
    model_name: Optional[str] = Form(None, description="指定使用的模型名称"),
    images: List[UploadFile] = File(..., description="要拼接的图片文件列表"),
    canvas_width: int = Form(1024, description="画布宽度"),
    canvas_height: int = Form(1024, description="画布高度"),
    db: Session = Depends(get_db)
):
    """拼图模式：自定义画布拼图编辑"""
    
    # 验证授权码
    auth_record = crud_auth_code.get_by_code(db, auth_code)
    if not auth_record or auth_record.status != "active":
        raise HTTPException(status_code=401, detail="无效的授权码")
    
    target_model_name = (model_name or settings.DEFAULT_IMAGE_MODEL_NAME).strip()
    _, required_credits = resolve_model_credit_cost(db, target_model_name)
    if required_credits > 0:
        available_credits = get_total_available_credits(auth_record)
        if available_credits < required_credits:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"积分余额不足，团队余额 {get_team_credits(auth_record)} "
                    f"· 个人余额 {auth_record.credits or 0}"
                ),
            )
    
    # 验证画布尺寸
    if not (512 <= canvas_width <= 2048 and 512 <= canvas_height <= 2048):
        raise HTTPException(status_code=400, detail="画布尺寸必须在512x512到2048x2048之间")
    
    # 生成唯一的生成ID
    generation_id = str(uuid.uuid4())
    
    try:
        # 为拼图模式构建特殊的提示词
        collage_prompt = f"请将这些图片拼接成一个 {canvas_width}x{canvas_height} 的画布。{prompt}"
        
        # 调用AI图像处理
        result = await image_processor.process_multiple_images(
            image_files=images,
            prompt_text=collage_prompt,
            generation_id=generation_id,
            model_name=target_model_name,
        )
        
        # 创建生成记录
        generation_data = GenerationRecordCreate(
            generation_id=generation_id,
            auth_code_id=auth_record.id,
            prompt=collage_prompt,
            input_images_count=len(images),
            output_images_count=len(result["output_images"]),
            credits_used=required_credits,
            processing_time=0.0,
            status="completed"
        )
        
        # 保存到数据库
        db_generation = crud_generation.create(db, obj_in=generation_data)
        
        # 扣除积分（团队优先）
        if required_credits > 0:
            deduct_credits(db, auth_record, required_credits)
        
        # 构建响应数据
        response_data = {
            "id": db_generation.id,
            "generation_id": generation_id,
            "auth_code_id": auth_record.id,
            "prompt": collage_prompt,
            "input_images_count": len(images),
            "output_images_count": len(result["output_images"]),
            "credits_used": required_credits,
            "processing_time": 0.0,
            "status": "completed",
            "created_at": db_generation.created_at,
            "text_response": result.get("text_response"),
            "output_images": [
                {
                    "filename": img["filename"],
                    "download_url": f"/api/v1/generations/download/{img['filename']}",
                    "size": img["size"]
                }
                for img in result["output_images"]
            ]
        }
        
        return response_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"拼图生成失败: {str(e)}")


@router.get("/download/{filename}")
async def download_generated_image(filename: str):
    """下载生成的图片"""
    file_path = image_processor.get_output_image_path(filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="image/jpeg"
    )


@router.get("/history/{auth_code}")
def get_generation_history(
    auth_code: str,
    limit: int = 20,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """获取用户的生成历史记录"""
    
    try:
        # 验证授权码
        from app.models import AuthCode
        auth_record = db.query(AuthCode).filter(AuthCode.code == auth_code).first()
        if not auth_record:
            raise HTTPException(status_code=401, detail="无效的授权码")
        
        # 返回空的历史记录（暂时）
        return []
        
    except Exception as e:
        print(f"History API error: {e}")
        return []

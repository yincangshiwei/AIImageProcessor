import os
import uuid
from typing import List, Optional, Dict, Any
from openai import OpenAI
from PIL import Image
from io import BytesIO
import base64
import aiofiles
from fastapi import UploadFile, HTTPException
import tempfile


class AIImageProcessor:
    """AI图像处理器，基于用户提供的GeminiImage.py脚本"""
    
    def __init__(self):
        # 从环境变量获取API配置
        self.api_key = os.getenv("GEMINI_API_KEY", "")
        self.base_url = os.getenv("GEMINI_BASE_URL", "https://aihubmix.com/v1")
        self.upload_dir = "./uploads"
        self.output_dir = "./outputs"
        
        # 确保目录存在
        os.makedirs(self.upload_dir, exist_ok=True)
        os.makedirs(self.output_dir, exist_ok=True)
    
    @staticmethod
    def encode_image(image_path: str) -> str:
        """将图片编码为base64格式"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")
    
    async def save_upload_file(self, upload_file: UploadFile) -> str:
        """保存上传的文件并返回文件路径"""
        # 生成唯一文件名
        file_extension = upload_file.filename.split('.')[-1] if '.' in upload_file.filename else 'jpg'
        unique_filename = f"{uuid.uuid4().hex}.{file_extension}"
        file_path = os.path.join(self.upload_dir, unique_filename)
        
        # 异步保存文件
        async with aiofiles.open(file_path, 'wb') as f:
            content = await upload_file.read()
            await f.write(content)
        
        return file_path
    
    async def process_multiple_images(
        self, 
        image_files: List[UploadFile], 
        prompt_text: str,
        generation_id: str
    ) -> Dict[str, Any]:
        """处理多张图片的AI编辑功能"""
        try:
            # 保存上传的图片文件
            image_paths = []
            for upload_file in image_files:
                if not upload_file.content_type.startswith('image/'):
                    raise HTTPException(status_code=400, detail=f"文件 {upload_file.filename} 不是有效的图片格式")
                
                file_path = await self.save_upload_file(upload_file)
                image_paths.append(file_path)
            
            # 验证所有图片文件是否存在
            for image_path in image_paths:
                if not os.path.exists(image_path):
                    raise FileNotFoundError(f"图片文件 {image_path} 不存在")
            
            # 初始化OpenAI客户端
            client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
            )
            
            # 构建content数组，包含文本和多个图片
            content = [
                {
                    "type": "text",
                    "text": prompt_text,
                }
            ]
            
            # 为每个图片添加image_url对象
            for image_path in image_paths:
                base64_image = self.encode_image(image_path)
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
                })
            
            # 调用AI图像编辑API
            response = client.chat.completions.create(
                model="gemini-2.5-flash-image-preview",
                messages=[
                    {
                        "role": "user",
                        "content": content,
                    },
                ],
                modalities=["text", "image"],
                temperature=0.7,
            )
            
            # 处理响应结果
            result = {
                "generation_id": generation_id,
                "input_images_count": len(image_paths),
                "prompt": prompt_text,
                "created_at": response.created,
                "token_usage": response.usage.total_tokens,
                "text_response": None,
                "output_images": []
            }
            
            # 检查是否有多模态内容
            if (
                hasattr(response.choices[0].message, "multi_mod_content")
                and response.choices[0].message.multi_mod_content is not None
            ):
                for part in response.choices[0].message.multi_mod_content:
                    # 处理文本内容
                    if "text" in part and part["text"] is not None:
                        result["text_response"] = part["text"]
                    
                    # 处理图片内容
                    elif "inline_data" in part and part["inline_data"] is not None:
                        image_data = base64.b64decode(part["inline_data"]["data"])
                        mime_type = part["inline_data"].get("mime_type", "image/png")
                        
                        # 保存生成的图片
                        output_filename = f"{generation_id}_{uuid.uuid4().hex}.jpg"
                        output_path = os.path.join(self.output_dir, output_filename)
                        
                        image = Image.open(BytesIO(image_data))
                        image.save(output_path, "JPEG")
                        
                        result["output_images"].append({
                            "filename": output_filename,
                            "path": output_path,
                            "mime_type": mime_type,
                            "size": len(image_data)
                        })
            else:
                raise HTTPException(status_code=500, detail="AI服务未返回有效的多模态响应")
            
            # 清理临时上传文件
            for image_path in image_paths:
                try:
                    os.remove(image_path)
                except:
                    pass  # 忽略删除错误
            
            return result
            
        except Exception as e:
            # 清理临时文件
            for image_path in image_paths:
                try:
                    os.remove(image_path)
                except:
                    pass
            raise HTTPException(status_code=500, detail=f"图像处理失败: {str(e)}")
    
    def get_output_image_path(self, filename: str) -> str:
        """获取输出图片的完整路径"""
        return os.path.join(self.output_dir, filename)


# 全局图像处理器实例
image_processor = AIImageProcessor()

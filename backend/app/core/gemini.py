import os
from openai import OpenAI
from PIL import Image
from io import BytesIO
import base64
import uuid
from typing import List, Optional
from app.core.config import settings
import asyncio
import aiofiles

class GeminiImageProcessor:
    def __init__(self, api_key: str, base_url: str):
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url,
        )
        self.default_model_name = os.getenv(
            "GEMINI_IMAGE_MODEL",
            settings.DEFAULT_IMAGE_MODEL_NAME,
        )
    
    def encode_image(self, image_path: str) -> str:
        """编码图像为base64"""
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode("utf-8")
    
    async def process_images(
        self, 
        image_paths: List[str], 
        prompt_text: str, 
        output_count: int = 1,
        auth_code: str = None,
        model_name: Optional[str] = None,
    ) -> List[str]:
        """
        处理多张图片的函数
        
        Args:
            image_paths: 图片路径列表
            prompt_text: 提示词文本
            output_count: 输出图片数量
            auth_code: 用户授权码
        
        Returns:
            输出图片路径列表
        """

        selected_model = (model_name or self.default_model_name).strip()
        
        # 检查所有图片是否存在
        for image_path in image_paths:
            if not os.path.exists(image_path):
                raise FileNotFoundError(f"image {image_path} not exists")
        
        # 构建 content 数组，包含文本和多个图片
        content = [
            {
                "type": "text",
                "text": prompt_text,
            }
        ]
        
        # 为每个图片添加 image_url 对象
        for image_path in image_paths:
            base64_image = self.encode_image(image_path)
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
            })
        
        # 生成多张图片的结果
        output_paths = []
        
        for i in range(output_count):
            try:
                response = self.client.chat.completions.create(
                    model=selected_model,
                    messages=[
                        {
                            "role": "user",
                            "content": content,
                        },
                    ],
                    modalities=["text", "image"],
                    temperature=0.7 + (i * 0.1),  # 略微调整温度增加变化
                )
                
                # 处理响应
                if (
                    hasattr(response.choices[0].message, "multi_mod_content")
                    and response.choices[0].message.multi_mod_content is not None
                ):
                    for part in response.choices[0].message.multi_mod_content:
                        # 处理图像内容
                        if "inline_data" in part and part["inline_data"] is not None:
                            image_data = base64.b64decode(part["inline_data"]["data"])
                            mime_type = part["inline_data"].get("mime_type", "image/png")
                            
                            # 保存图像
                            output_dir = os.path.join(settings.OUTPUT_DIR, auth_code if auth_code else "default")
                            os.makedirs(output_dir, exist_ok=True)
                            
                            # 生成唯一文件名
                            file_extension = "png" if "png" in mime_type else "jpg"
                            unique_filename = f"{uuid.uuid4().hex}_{i+1}.{file_extension}"
                            output_path = os.path.join(output_dir, unique_filename)
                            
                            # 保存图片
                            image = Image.open(BytesIO(image_data))
                            image.save(output_path)
                            
                            # 返回相对URL路径
                            relative_path = f"/outputs/{auth_code if auth_code else 'default'}/{unique_filename}"
                            output_paths.append(relative_path)
                            break
                
            except Exception as e:
                print(f"Error processing image {i+1}: {str(e)}")
                # 如果生成失败，返回已成功的结果
                break
        
        if not output_paths:
            raise Exception("所有图片生成失败")
        
        return output_paths
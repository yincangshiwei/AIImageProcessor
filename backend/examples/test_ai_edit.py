import requests
import os
import base64
from PIL import Image
from io import BytesIO
import json

def test_ai_edit():
    """测试AI图像编辑API端点"""
    # API端点URL
    url = "http://localhost:8000/api/v1/generations/ai-edit"
    
    # 授权码（应该是一个有效的授权码）
    auth_code = "YOUR_AUTH_CODE"  # 替换为有效的授权码
    
    # 编辑提示词
    prompt = "把图片中的物体转换为未来风格"
    
    # 图片文件路径（可以是多个图片）
    image_paths = [
        "path/to/your/image1.jpg",
        # 可以添加更多图片
    ]
    
    # 构建请求数据
    files = [
        ("images", (os.path.basename(path), open(path, "rb"), "image/jpeg"))
        for path in image_paths
    ]
    
    data = {
        "auth_code": auth_code,
        "prompt": prompt
    }
    
    # 发送POST请求
    response = requests.post(url, files=files, data=data)
    
    # 如果请求成功
    if response.status_code == 200:
        result = response.json()
        print("\u751f成成功!")
        print(f"\u751f成ID: {result['generation_id']}")
        print(f"\u6587本响应: {result.get('text_response')}")
        print(f"\u8f93出图像数量: {result['output_images_count']}")
        
        # 显示生成的图片URL
        for i, img in enumerate(result.get("output_images", [])):
            print(f"\u56fe片 {i+1} URL: {img['download_url']}")
    else:
        print(f"\u8bf7求失败: {response.status_code}")
        print(response.text)


if __name__ == "__main__":
    test_ai_edit()

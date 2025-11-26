import os
from openai import OpenAI
from PIL import Image
from io import BytesIO
import base64


def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


def process_images(api_key, base_url, image_paths, prompt_text):
    """
    处理多张图片的函数
    
    Args:
        api_key: OpenAI API密钥
        base_url: API基础URL
        image_paths: 图片路径列表
        prompt_text: 提示词文本
    """
    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
    )

    # 检查所有图片是否存在
    for image_path in image_paths:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"image {image_path} not exists")

    # 构建content数组，包含文本和多个图片
    content = [
        {
            "type": "text",
            "text": prompt_text,
        }
    ]

    # 为每个图片添加image_url对象
    for image_path in image_paths:
        base64_image = encode_image(image_path)
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"},
        })

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
    
    try:
        # Print basic response information without base64 data
        print(f"Creation time: {response.created}")
        print(f"Token usage: {response.usage.total_tokens}")

        # Check if multi_mod_content field exists
        if (
                hasattr(response.choices[0].message, "multi_mod_content")
                and response.choices[0].message.multi_mod_content is not None
        ):
            print("\nResponse content:")
            for part in response.choices[0].message.multi_mod_content:
                if "text" in part and part["text"] is not None:
                    print(part["text"])

                # Process image content
                elif "inline_data" in part and part["inline_data"] is not None:
                    print("\n🖼️ [Image content received]")
                    image_data = base64.b64decode(part["inline_data"]["data"])
                    mime_type = part["inline_data"].get("mime_type", "image/png")
                    print(f"Image type: {mime_type}")

                    image = Image.open(BytesIO(image_data))
                    image.show()

                    # Save image
                    output_dir = os.path.join(os.path.dirname(image_paths[0]), "output")
                    os.makedirs(output_dir, exist_ok=True)
                    output_path = os.path.join(output_dir, "edited_image.jpg")
                    image.save(output_path)
                    print(f"✅ Image saved to: {output_path}")

        else:
            print("No valid multimodal response received, check response structure")
    except Exception as e:
        print(f"Error processing response: {str(e)}")


def main():
    # 可配置参数
    api_key = ""  # 换成你在 AiHubMix 生成的密钥
    base_url = "https://aihubmix.com/v1"
    
    # 图片路径列表 - 支持多图输入
    image_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "QQ图片20240728155548.png"),
        # 可以添加更多图片路径
        # os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "图1-动作参考.png"),
    ]
    
    # 提示词
    prompt_text = "把图中的角色更换到魔法丛林场景"
    
    # 调用处理函数
    process_images(api_key, base_url, image_paths, prompt_text)


if __name__ == "__main__":
    main()

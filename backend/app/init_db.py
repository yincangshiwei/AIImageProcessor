from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import Base, AuthCode, TemplateCase
import json
from datetime import datetime, timedelta

# 创建表
Base.metadata.create_all(bind=engine)

def init_database():
    db = SessionLocal()
    
    # 创建示例授权码
    sample_codes = [
        {
            "code": "DEMO2025",
            "credits": 1000,
            "expire_time": datetime.utcnow() + timedelta(days=365),
            "status": "active",
            "description": "演示环境授权码，供前端示例使用",
            "ip_whitelist": "127.0.0.1;192.168.0.0/24",
            "allowed_models": "gemini-3-pro-image-preview,gemini-2.5-flash-image",
            "contact_name": "演示用户",
            "creator_name": "Demo Studio",
            "phone_number": "+86-13800000000"
        },
        {
            "code": "TEST001",
            "credits": 500,
            "expire_time": None,  # 永不过期
            "status": "active",
            "description": "内部测试授权码，支持本地联调",
            "ip_whitelist": "127.0.0.1",
            "allowed_models": "gemini-3-pro-image-preview",
            "contact_name": "测试账号",
            "creator_name": "Test Collective",
            "phone_number": "+86-13900000000"
        },
        {
            "code": "VIP2025",
            "credits": 5000,
            "expire_time": datetime.utcnow() + timedelta(days=90),
            "status": "active",
            "description": "高阶创作者专用授权码，额度更高",
            "ip_whitelist": None,
            "allowed_models": "gemini-3-pro-image-preview,gemini-2.5-flash-image,gemini-1.5-pro",
            "contact_name": "VIP 创作者",
            "creator_name": "Aurora Studio",
            "phone_number": "+86-18800000000"
        }
    ]
    
    for code_data in sample_codes:
        existing = db.query(AuthCode).filter(AuthCode.code == code_data["code"]).first()
        if not existing:
            auth_code = AuthCode(**code_data)
            db.add(auth_code)
    
    # 创建示例案例
    sample_cases = [
        {
            "category": "科幻风格",
            "title": "太空战士合成",
            "description": "将人物图像与科幻背景合成，创造未来战士效果",
            "preview_image": "/static/previews/scifi_warrior.jpg",
            "input_images": json.dumps(["/static/examples/person.jpg", "/static/examples/space_bg.jpg"]),
            "prompt_text": "将第一张图片中的人物与第二张太空背景合成，打造酷炫的太空战士形象，添加科幻装甲和光效",
            "tags": json.dumps(["科幻", "合成", "战士", "太空"]),
            "popularity": 156,
            "mode_type": "multi"
        },
        {
            "category": "艺术创作",
            "title": "水彩风景转换",
            "description": "将普通照片转换为水彩画风格的艺术作品",
            "preview_image": "/static/previews/watercolor.jpg",
            "input_images": json.dumps(["/static/examples/landscape.jpg"]),
            "prompt_text": "将这张风景照片转换为水彩画风格，保持柔和的色调和艺术气息，强调笔触和渲染效果",
            "tags": json.dumps(["水彩", "艺术", "风景", "转换"]),
            "popularity": 89,
            "mode_type": "multi"
        },
        {
            "category": "卡通风格",
            "title": "卡通头像制作",
            "description": "将真实人像转换为可爱的卡通头像",
            "preview_image": "/static/previews/cartoon_avatar.jpg",
            "input_images": json.dumps(["/static/examples/portrait.jpg"]),
            "prompt_text": "将这张人像照片转换为可爱的卡通风格，保持人物特征，增加大眼睛和柔和的色彩",
            "tags": json.dumps(["卡通", "头像", "可爱", "人像"]),
            "popularity": 234,
            "mode_type": "multi"
        },
        {
            "category": "拼图合成",
            "title": "多元素海报设计",
            "description": "将多个设计元素合成为统一的海报设计",
            "preview_image": "/static/previews/poster_design.jpg",
            "input_images": json.dumps(["/static/examples/logo.png", "/static/examples/text_element.png", "/static/examples/bg_pattern.jpg"]),
            "prompt_text": "将这些设计元素合成为一张现代感强烈的海报，注重布局平衡和色彩搭配",
            "tags": json.dumps(["拼图", "海报", "设计", "合成"]),
            "popularity": 178,
            "mode_type": "puzzle"
        }
    ]
    
    for case_data in sample_cases:
        existing = db.query(TemplateCase).filter(
            TemplateCase.title == case_data["title"]
        ).first()
        if not existing:
            template_case = TemplateCase(**case_data)
            db.add(template_case)
    
    db.commit()
    db.close()
    
    print("数据库初始化完成!")
    print("\n示例授权码:")
    for code in sample_codes:
        print(f"- {code['code']}: {code['credits']} 积分")

if __name__ == "__main__":
    init_database()
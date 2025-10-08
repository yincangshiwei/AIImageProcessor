"""
授权码安全处理工具
"""
import hashlib
import secrets
from typing import Optional

def mask_auth_code(code: str) -> str:
    """
    隐藏授权码中间部分
    """
    if not code or len(code) < 4:
        return code
    
    # 显示前2位和后2位
    start = code[:2]
    end = code[-2:]
    
    # 生成随机数量的*号（3-8个）
    mask_length = secrets.randbelow(6) + 3
    mask = '*' * mask_length
    
    return f"{start}{mask}{end}"

def generate_session_token(code: str) -> str:
    """
    为授权码生成会话令牌
    """
    # 使用SHA256哈希 + 随机盐
    salt = secrets.token_hex(16)
    token_data = f"{code}:{salt}"
    token = hashlib.sha256(token_data.encode()).hexdigest()
    return token

def validate_auth_code_format(code: str) -> bool:
    """
    验证授权码格式
    """
    if not code:
        return False
    
    # 基本格式验证：长度在4-50之间，只包含字母数字
    if not (4 <= len(code) <= 50):
        return False
    
    return code.isalnum()

def sanitize_user_data(user_data: dict, include_full_code: bool = False) -> dict:
    """
    清理用户数据，移除敏感信息
    """
    sanitized = {
        "credits": user_data.get("credits", 0),
        "expire_time": user_data.get("expire_time"),
        "status": user_data.get("status", "unknown")
    }
    
    if include_full_code:
        sanitized["code"] = user_data.get("code")
    else:
        # 只返回隐藏的授权码用于显示
        sanitized["masked_code"] = mask_auth_code(user_data.get("code", ""))
    
    return sanitized
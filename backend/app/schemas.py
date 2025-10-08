from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class GenerationRecordBase(BaseModel):
    generation_id: str
    auth_code_id: int
    prompt: str
    input_images_count: int
    output_images_count: int
    credits_used: int
    processing_time: float
    status: str


class GenerationRecordCreate(GenerationRecordBase):
    pass


class GenerationRecordResponse(GenerationRecordBase):
    id: int
    created_at: datetime
    text_response: Optional[str] = None
    output_images: Optional[List[Dict[str, Any]]] = None

    class Config:
        orm_mode = True


class AuthCodeBase(BaseModel):
    code: str
    credits: int
    expire_time: Optional[datetime] = None
    status: str = "active"


class AuthCodeCreate(AuthCodeBase):
    pass


class AuthCodeResponse(AuthCodeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

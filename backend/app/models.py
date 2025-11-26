from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class AuthCode(Base):
    __tablename__ = "auth_codes"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(100), unique=True, index=True, nullable=False)
    credits = Column(Integer, default=0)
    expire_time = Column(DateTime, nullable=True)
    status = Column(String(20), default="active")
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

class GenerationRecord(Base):
    __tablename__ = "generation_records"
    
    id = Column(Integer, primary_key=True, index=True)
    auth_code = Column(String(100), ForeignKey("auth_codes.code"), nullable=False)
    mode_type = Column(String(20), nullable=False)  # "multi" or "puzzle"
    input_images = Column(Text, nullable=True)  # JSON array of image paths
    prompt_text = Column(Text, nullable=False)
    output_count = Column(Integer, nullable=False)
    output_images = Column(Text, nullable=True)  # JSON array of output image paths
    credits_used = Column(Integer, nullable=False)
    processing_time = Column(Integer, nullable=True)  # seconds
    created_at = Column(DateTime, default=func.now())

class TemplateCase(Base):
    __tablename__ = "template_cases"
    
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    preview_image = Column(String(500), nullable=True)
    input_images = Column(Text, nullable=True)  # JSON array of example images
    prompt_text = Column(Text, nullable=False)
    tags = Column(Text, nullable=True)  # JSON array of tags
    popularity = Column(Integer, default=0)
    mode_type = Column(String(20), nullable=False)  # "multi" or "puzzle"
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional, Dict, Any

from app.models import GenerationRecord, AuthCode
from app.schemas import GenerationRecordCreate, AuthCodeCreate


class CRUDGeneration:
    def create(self, db: Session, *, obj_in: GenerationRecordCreate) -> GenerationRecord:
        """创建一条生成记录"""
        db_obj = GenerationRecord(
            generation_id=obj_in.generation_id,
            auth_code_id=obj_in.auth_code_id,
            prompt=obj_in.prompt,
            input_images_count=obj_in.input_images_count,
            output_images_count=obj_in.output_images_count,
            credits_used=obj_in.credits_used,
            processing_time=obj_in.processing_time,
            status=obj_in.status
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def get(self, db: Session, id: int) -> Optional[GenerationRecord]:
        """根据ID获取一条生成记录"""
        return db.query(GenerationRecord).filter(GenerationRecord.id == id).first()
    
    def get_by_generation_id(self, db: Session, generation_id: str) -> Optional[GenerationRecord]:
        """根据generation_id获取一条生成记录"""
        return db.query(GenerationRecord).filter(GenerationRecord.generation_id == generation_id).first()
    
    def get_by_auth_code(self, db: Session, auth_code_id: int, skip: int = 0, limit: int = 100) -> List[GenerationRecord]:
        """获取某个授权码的生成记录列表"""
        return db.query(GenerationRecord) \
            .filter(GenerationRecord.auth_code_id == auth_code_id) \
            .order_by(desc(GenerationRecord.created_at)) \
            .offset(skip) \
            .limit(limit) \
            .all()
    
    def get_multi(self, db: Session, skip: int = 0, limit: int = 100) -> List[GenerationRecord]:
        """获取多条生成记录"""
        return db.query(GenerationRecord) \
            .order_by(desc(GenerationRecord.created_at)) \
            .offset(skip) \
            .limit(limit) \
            .all()
    
    def update_status(self, db: Session, id: int, status: str) -> GenerationRecord:
        """更新生成记录状态"""
        db_obj = self.get(db, id=id)
        if db_obj:
            db_obj.status = status
            db.commit()
            db.refresh(db_obj)
        return db_obj


class CRUDAuthCode:
    def create(self, db: Session, *, obj_in: AuthCodeCreate) -> AuthCode:
        """创建一个授权码"""
        db_obj = AuthCode(
            code=obj_in.code,
            credits=obj_in.credits,
            expire_time=obj_in.expire_time,
            status=obj_in.status
        )
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj
    
    def get(self, db: Session, id: int) -> Optional[AuthCode]:
        """根据ID获取授权码"""
        return db.query(AuthCode).filter(AuthCode.id == id).first()
    
    def get_by_code(self, db: Session, code: str) -> Optional[AuthCode]:
        """根据code获取授权码"""
        return db.query(AuthCode).filter(AuthCode.code == code).first()
    
    def get_multi(self, db: Session, skip: int = 0, limit: int = 100) -> List[AuthCode]:
        """获取多个授权码"""
        return db.query(AuthCode).offset(skip).limit(limit).all()
    
    def update_credits(self, db: Session, id: int, credits: int) -> AuthCode:
        """更新授权码积分"""
        db_obj = self.get(db, id=id)
        if db_obj:
            db_obj.credits = credits
            db.commit()
            db.refresh(db_obj)
        return db_obj
    
    def update_status(self, db: Session, id: int, status: str) -> AuthCode:
        """更新授权码状态"""
        db_obj = self.get(db, id=id)
        if db_obj:
            db_obj.status = status
            db.commit()
            db.refresh(db_obj)
        return db_obj


# 创建CRUD操作实例
crud_generation = CRUDGeneration()
crude_auth_code = CRUDAuthCode()

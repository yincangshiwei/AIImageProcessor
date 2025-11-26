from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TemplateCase
from typing import List, Optional
from pydantic import BaseModel
import json

router = APIRouter()

class CaseResponse(BaseModel):
    id: int
    category: str
    title: str
    description: Optional[str]
    preview_image: Optional[str]
    input_images: List[str]
    prompt_text: str
    tags: List[str]
    popularity: int
    mode_type: str

@router.get("/list", response_model=List[CaseResponse])
async def get_cases(
    category: Optional[str] = None,
    mode_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取案例列表"""
    query = db.query(TemplateCase)
    
    if category:
        query = query.filter(TemplateCase.category == category)
    if mode_type:
        query = query.filter(TemplateCase.mode_type == mode_type)
    
    cases = query.order_by(TemplateCase.popularity.desc()).all()
    
    result = []
    for case in cases:
        result.append(CaseResponse(
            id=case.id,
            category=case.category,
            title=case.title,
            description=case.description,
            preview_image=case.preview_image,
            input_images=json.loads(case.input_images) if case.input_images else [],
            prompt_text=case.prompt_text,
            tags=json.loads(case.tags) if case.tags else [],
            popularity=case.popularity,
            mode_type=case.mode_type
        ))
    
    return result

@router.get("/recommend")
async def recommend_cases(
    prompt: str,
    limit: int = 5,
    db: Session = Depends(get_db)
):
    """智能推荐案例"""
    # Simple keyword matching (can be enhanced with NLP)
    keywords = prompt.lower().split()
    
    cases = db.query(TemplateCase).all()
    scored_cases = []
    
    for case in cases:
        score = 0
        case_text = (case.title + " " + case.description + " " + case.prompt_text).lower()
        
        # Keyword matching
        for keyword in keywords:
            if keyword in case_text:
                score += 1
        
        # Tags matching
        if case.tags:
            tags = json.loads(case.tags)
            for tag in tags:
                if tag.lower() in prompt.lower():
                    score += 2
        
        if score > 0:
            scored_cases.append((case, score))
    
    # Sort by score and return top results
    scored_cases.sort(key=lambda x: x[1], reverse=True)
    
    result = []
    for case, score in scored_cases[:limit]:
        result.append({
            "id": case.id,
            "category": case.category,
            "title": case.title,
            "description": case.description,
            "preview_image": case.preview_image,
            "input_images": json.loads(case.input_images) if case.input_images else [],
            "prompt_text": case.prompt_text,
            "tags": json.loads(case.tags) if case.tags else [],
            "popularity": case.popularity,
            "mode_type": case.mode_type,
            "match_score": score
        })
    
    return result
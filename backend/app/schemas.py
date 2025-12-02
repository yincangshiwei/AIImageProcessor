from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field
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
    description: Optional[str] = None
    ip_whitelist: Optional[str] = None
    allowed_models: Optional[str] = None
    contact_name: Optional[str] = None
    creator_name: Optional[str] = None
    phone_number: Optional[str] = None


class AuthCodeCreate(AuthCodeBase):
    pass


class AuthCodeResponse(AuthCodeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


AssistantVisibility = Literal["public", "private"]


class AssistantCategorySummary(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    accent_color: Optional[str] = None
    sort_order: int = 0
    assistant_count: int = 0
    is_active: bool = True

    class Config:
        orm_mode = True


class AssistantCategoryResponse(AssistantCategorySummary):
    pass


class AssistantProfileBase(BaseModel):
    name: str = Field(..., max_length=200)
    slug: Optional[str] = Field(None, max_length=200)
    definition: str = Field(..., max_length=2000)
    description: Optional[str] = Field(None, max_length=4000)
    cover_url: str = Field(..., max_length=500)
    cover_type: str = Field("image", max_length=20)
    category_ids: List[int] = Field(default_factory=list)
    models: List[str] = Field(default_factory=list)
    supports_image: bool = True
    supports_video: bool = False
    accent_color: Optional[str] = Field(None, max_length=50)
    visibility: AssistantVisibility = "private"


class AssistantProfileCreate(AssistantProfileBase):
    auth_code: str = Field(..., max_length=100)


class AssistantProfileUpdate(BaseModel):
    auth_code: str = Field(..., max_length=100)
    name: Optional[str] = Field(None, max_length=200)
    slug: Optional[str] = Field(None, max_length=200)
    definition: Optional[str] = Field(None, max_length=2000)
    description: Optional[str] = Field(None, max_length=4000)
    cover_url: Optional[str] = Field(None, max_length=500)
    cover_type: Optional[str] = Field(None, max_length=20)
    category_ids: Optional[List[int]] = None
    models: Optional[List[str]] = None
    supports_image: Optional[bool] = None
    supports_video: Optional[bool] = None
    accent_color: Optional[str] = Field(None, max_length=50)
    visibility: Optional[AssistantVisibility] = None


class AssistantVisibilityUpdate(BaseModel):
    auth_code: str = Field(..., max_length=100)
    visibility: AssistantVisibility


class AssistantProfileResponse(BaseModel):
    id: int
    name: str
    slug: str
    definition: str
    description: Optional[str] = None
    cover_url: str
    cover_storage_path: Optional[str] = None
    cover_type: str
    primary_category: Optional[str] = None
    secondary_category: Optional[str] = None
    categories: List[str] = Field(default_factory=list)
    category_ids: List[int] = Field(default_factory=list)
    models: List[str] = Field(default_factory=list)
    supports_image: bool
    supports_video: bool
    accent_color: Optional[str] = None
    type: str
    owner_code: Optional[str] = None
    owner_display_name: Optional[str] = None
    owner_code_masked: Optional[str] = None
    visibility: AssistantVisibility
    is_favorited: bool = False
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class AssistantPaginatedSection(BaseModel):
    items: List[AssistantProfileResponse]
    total: int
    page: int
    page_size: int


class AssistantMarketplaceResponse(BaseModel):
    official: AssistantPaginatedSection
    custom: AssistantPaginatedSection
    favorites: AssistantPaginatedSection
    available_categories: List[AssistantCategorySummary] = Field(default_factory=list)


class AssistantModelResponse(BaseModel):
    id: int
    name: str
    alias: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    status: str
    order_index: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class AssistantCoverUploadResponse(BaseModel):
    file_name: str
    url: str


class AssistantFavoriteToggleRequest(BaseModel):
    auth_code: str = Field(..., max_length=100)


class AssistantFavoriteToggleResponse(BaseModel):
    assistant_id: int
    is_favorited: bool

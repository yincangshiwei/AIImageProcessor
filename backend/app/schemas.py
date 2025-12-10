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


TeamRole = Literal["admin", "member"]


class CreatorTeamInfo(BaseModel):
    id: int
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    credits: int
    created_at: datetime
    updated_at: datetime

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
    team_id: Optional[int] = None
    team_role: Optional[TeamRole] = None
    team_name: Optional[str] = None
    team_display_name: Optional[str] = None
    team_description: Optional[str] = None
    team_credits: Optional[int] = None
    available_credits: Optional[int] = None
    phone_number: Optional[str] = None


class AuthCodeCreate(AuthCodeBase):
    pass


class AuthCodeResponse(AuthCodeBase):
    id: int
    created_at: datetime
    updated_at: datetime
    team: Optional[CreatorTeamInfo] = None

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
    definition: str = Field(..., max_length=20000)
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
    definition: Optional[str] = Field(None, max_length=20000)
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
    favorite_group_id: Optional[int] = None
    favorite_group_name: Optional[str] = None
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
    model_type: Literal["chat", "image", "video"]
    order_index: int
    credit_cost: int
    discount_credit_cost: Optional[int] = None
    is_free_to_use: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class AssistantCoverUploadResponse(BaseModel):
    file_name: str
    url: str


class AssistantDefinitionOptimizeRequest(BaseModel):
    auth_code: str = Field(..., max_length=100)
    model_name: str = Field(..., max_length=200)
    definition: str = Field(..., max_length=20000)


class AssistantDefinitionOptimizeResponse(BaseModel):
    optimized_definition: str


class AssistantFavoriteToggleRequest(BaseModel):
    auth_code: str = Field(..., max_length=100)
    group_id: Optional[int] = Field(None, ge=1)


class AssistantFavoriteToggleResponse(BaseModel):
    assistant_id: int
    is_favorited: bool
    favorite_group_id: Optional[int] = None
    favorite_group_name: Optional[str] = None


class AssistantFavoriteGroupAssignmentRequest(BaseModel):
    auth_code: str = Field(..., max_length=100)
    group_id: Optional[int] = Field(None, ge=1)


class AssistantFavoriteGroupAssignmentResponse(BaseModel):
    assistant_id: int
    favorite_group_id: Optional[int] = None
    favorite_group_name: Optional[str] = None


class FavoriteGroupCreateRequest(BaseModel):
    auth_code: str = Field(..., max_length=100)
    name: str = Field(..., min_length=1, max_length=100)


class FavoriteGroupUpdateRequest(BaseModel):
    auth_code: str = Field(..., max_length=100)
    name: str = Field(..., min_length=1, max_length=100)


class FavoriteGroupResponse(BaseModel):
    id: int
    name: str
    assistant_count: int
    created_at: datetime
    updated_at: datetime


class AssistantCommentResponse(BaseModel):
    id: int
    assistant_id: int
    content: str
    like_count: int
    created_at: datetime
    updated_at: datetime
    author_display_name: str
    author_code_masked: str
    can_delete: bool = False
    liked_by_viewer: bool = False

    class Config:
        orm_mode = True


class AssistantCommentListResponse(BaseModel):
    items: List[AssistantCommentResponse]
    total: int
    page: int
    page_size: int


class AssistantCommentCreateRequest(BaseModel):
    auth_code: str = Field(..., max_length=100)
    content: str = Field(..., min_length=1, max_length=800)


class AssistantCommentLikeToggleRequest(BaseModel):
    auth_code: str = Field(..., max_length=100)


class AssistantCommentLikeToggleResponse(BaseModel):
    comment_id: int
    like_count: int
    liked: bool


class CreditRechargeRecordBase(BaseModel):
    target_type: Literal["personal", "team"]
    auth_code_id: Optional[int] = None
    team_id: Optional[int] = None
    credits_before: Optional[int] = None
    credits_added: int
    credits_after: Optional[int] = None
    payment_channel: Optional[str] = None
    reference_no: Optional[str] = None
    memo: Optional[str] = None
    created_by: Optional[str] = None


class CreditRechargeRecordResponse(CreditRechargeRecordBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class SystemAgentBase(BaseModel):
    title: str = Field(..., max_length=200)
    system_prompt: str = Field(..., min_length=1)
    description: Optional[str] = Field(None, max_length=2000)
    is_active: bool = True
    tags: List[str] = Field(default_factory=list)


class SystemAgentResponse(SystemAgentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

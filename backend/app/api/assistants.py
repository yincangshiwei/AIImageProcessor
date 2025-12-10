import json
import re
import sys
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional, Set, Tuple
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import (
    AssistantCategory,
    AssistantCategoryLink,
    AssistantComment,
    AssistantCommentLike,
    AssistantFavorite,
    AssistantModelLink,
    AssistantProfile,
    AuthCode,
    FavoriteGroup,
    ModelDefinition,
    SystemAgent,
)
from app.schemas import (
    AssistantCategoryResponse,
    AssistantCategorySummary,
    AssistantCommentCreateRequest,
    AssistantCommentLikeToggleRequest,
    AssistantCommentLikeToggleResponse,
    AssistantCommentListResponse,
    AssistantCommentResponse,
    AssistantCoverUploadResponse,
    AssistantDefinitionOptimizeRequest,
    AssistantDefinitionOptimizeResponse,
    AssistantFavoriteGroupAssignmentRequest,
    AssistantFavoriteGroupAssignmentResponse,
    AssistantFavoriteToggleRequest,
    AssistantFavoriteToggleResponse,
    AssistantMarketplaceResponse,
    AssistantModelResponse,
    AssistantPaginatedSection,
    AssistantProfileCreate,
    AssistantProfileResponse,
    AssistantProfileUpdate,
    AssistantVisibilityUpdate,
    FavoriteGroupCreateRequest,
    FavoriteGroupResponse,
    FavoriteGroupUpdateRequest,
)
from app.core.config import settings
from app.core.security import mask_auth_code

TOOL_DIR = Path(__file__).resolve().parents[1] / "tool"
if str(TOOL_DIR) not in sys.path:
    sys.path.append(str(TOOL_DIR))

from app.tool.TenCentCloudTool import TenCentCloudTool
from app.tool.AiHubMixTool import AiHubMixTool

router = APIRouter()

ASSISTANT_OPTIMIZER_AGENT_ID = 1

DEFAULT_PAGE_SIZE = 6
MAX_PAGE_SIZE = 24
COMMENTS_DEFAULT_PAGE_SIZE = 10
COMMENTS_MAX_PAGE_SIZE = 50
MAX_COMMENT_LENGTH = 800

COVER_CDN_BASE_URL = settings.COS_CDN_BASE_URL.rstrip("/")
COS_BUCKET = settings.COS_BUCKET
COS_REGION = settings.COS_REGION
COS_APP_ID = settings.TENCENT_CLOUD_APP_ID

MODEL_TYPE_CHOICES = {"chat", "image", "video"}

ASSISTANT_MODEL_SEED = [
    {
        "name": "gemini-3-pro-image-preview",
        "alias": "NanoBananaPro",
        "description": "Google Nano Banana系列最新版，最强的图像处理与理解能力，更好的质量",
        "logo_url": "https://yh-it-1325210923.cos.ap-guangzhou.myqcloud.com/static/logo/Nano%20Banana%20%E5%9C%86%E5%BD%A2Logo_128.png",
        "status": "active",
        "model_type": "image",
        "order_index": 1,
        "credit_cost": 12,
        "discount_credit_cost": None,
        "is_free_to_use": False,
    },
    {
        "name": "gemini-2.5-flash-image",
        "alias": "NanoBanana",
        "description": "Google Nano Banana系列第一代",
        "logo_url": "https://yh-it-1325210923.cos.ap-guangzhou.myqcloud.com/static/logo/Nano%20Banana%20%E5%9C%86%E5%BD%A2Logo_128.png",
        "status": "active",
        "model_type": "image",
        "order_index": 2,
        "credit_cost": 8,
        "discount_credit_cost": None,
        "is_free_to_use": False,
    },
    {
        "name": "gemini-2.5-flash-image-preview",
        "alias": "NanoBananaPreview",
        "description": "Google Nano Banana系列预览版本，适合快速编辑与测试",
        "logo_url": "https://yh-it-1325210923.cos.ap-guangzhou.myqcloud.com/static/logo/Nano%20Banana%20%E5%9C%86%E5%BD%A2Logo_128.png",
        "status": "active",
        "model_type": "image",
        "order_index": 3,
        "credit_cost": 10,
        "discount_credit_cost": None,
        "is_free_to_use": False,
    },
]

SEED_ASSISTANTS = [
    {
        "name": "霓虹分镜导演",
        "slug": "neon-director",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "围绕剧情提示快速生成电影级镜头与光影布局。",
        "description": "擅长赛博朋克、霓虹灯光与宏大场景，自动匹配镜头切换节奏。",
        "primary_category": "概念设计",
        "secondary_category": "影视分镜",
        "categories": ["概念设计", "未来科幻"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#60a5fa",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "织梦时装总监",
        "slug": "couture-dreamer",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "一键生成高级定制时装大片，提供姿势、灯光与材质指引。",
        "description": "融合未来材质与东方廓形，可切换静帧或动态走秀风格。",
        "primary_category": "时尚视觉",
        "secondary_category": "商业短片",
        "categories": ["时尚视觉", "商业短片"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#f472b6",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "星港叙事设计院",
        "slug": "starsea-lab",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "专注未来城市、工业概念与品牌视觉故事，支持多模型协同。",
        "description": "将空间结构、材质记忆与品牌口吻融合，适合大型装置提案。",
        "primary_category": "空间视觉",
        "secondary_category": "品牌主理人",
        "categories": ["空间视觉", "品牌主理人"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#34d399",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "极昼空间编导",
        "slug": "polar-dawn-director",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "AI辅助的沉浸式空间叙事导演，擅长光影流动与层级镜头。",
        "description": "预设多维空间结构与动态灯光，输出可直接装置化的视觉脚本。",
        "primary_category": "空间视觉",
        "secondary_category": "装置艺术",
        "categories": ["空间视觉", "装置艺术", "互动体验"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#0ea5e9",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "雾岛潮流造梦局",
        "slug": "mist-island-maker",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "集合潮流文化资产的视觉策展助手，自动生成lookbook与场景设定。",
        "description": "提供姿态排布、材质搭配与氛围灯组建议，适配快闪展与商业大片。",
        "primary_category": "潮流主理",
        "secondary_category": "时尚视觉",
        "categories": ["潮流主理", "时尚视觉", "品牌主理人"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#f59e0b",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "流明商业剧场",
        "slug": "lumen-commerce-stage",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "专注商业短片节奏与镜位排布，快速生成多机位脚本。",
        "description": "自动匹配镜头语言与品牌语气，可导出逐镜故事板与调色建议。",
        "primary_category": "商业短片",
        "secondary_category": "舞台视觉",
        "categories": ["商业短片", "舞台视觉", "品牌叙事"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#eab308",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "星穹感知研究所",
        "slug": "stellar-sense-lab",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "面向未来科幻与交互体验的概念推演助手。",
        "description": "通过多模态Prompt组合构建感官叙事线，可生成交互流程与空间节点示意。",
        "primary_category": "未来科幻",
        "secondary_category": "互动体验",
        "categories": ["未来科幻", "互动体验", "空间视觉"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#10b981",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "幻日叙事中枢",
        "slug": "halo-narrative-core",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1470229538611-16ba8c7ffbd7?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "品牌叙事策略助手，自动生成情绪板与脚本分层。",
        "description": "聚合品牌语气、受众画像与传播渠道，输出节奏化的内容矩阵。",
        "primary_category": "品牌叙事",
        "secondary_category": "品牌主理人",
        "categories": ["品牌叙事", "商业短片", "品牌主理人"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#c084fc",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "曜石机能影坊",
        "slug": "obsidian-motion-studio",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "专注视觉特效与机能风影像的调校助手。",
        "description": "生成特效层、材质烘焙与动态光晕建议，匹配机能时尚语境。",
        "primary_category": "视觉特效",
        "secondary_category": "未来科幻",
        "categories": ["视觉特效", "未来科幻", "商业短片"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#6366f1",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "浮岛体验制作组",
        "slug": "levitating-experience-lab",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "沉浸体验导览设计助手，为展览与快闪空间提供故事线。",
        "description": "自动生成路线指引、互动节点与动态音景，输出整套体验手册。",
        "primary_category": "互动体验",
        "secondary_category": "沉浸体验",
        "categories": ["互动体验", "沉浸体验", "空间视觉"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#06b6d4",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "霜蓝建筑推演所",
        "slug": "frost-architect-lab",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1503389152951-9f343605f61c?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "建筑推演与材料测试助手，快速输出差异化结构草图。",
        "description": "结合气候、材质与结构逻辑，生成多方案空间草图与推演动图。",
        "primary_category": "建筑推演",
        "secondary_category": "空间视觉",
        "categories": ["建筑推演", "空间视觉", "概念设计"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#38bdf8",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "暮光色彩司库",
        "slug": "dusk-chroma-atelier",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "色彩叙事与材质实验的灵感仓库助手。",
        "description": "根据品牌调性生成夕阳、霓虹及金属等多段色彩方案。",
        "primary_category": "概念设计",
        "secondary_category": "材质实验",
        "categories": ["概念设计", "材质实验", "品牌叙事"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#fb7185",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "信标品牌战略塔",
        "slug": "beacon-brand-tower",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "品牌战略驱动的视觉资产统筹助手。",
        "description": "提供全年Campaign节奏、视觉资产清单与测算指标建议。",
        "primary_category": "品牌主理人",
        "secondary_category": "城市地景",
        "categories": ["品牌主理人", "品牌叙事", "城市地景"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#facc15",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "野生视觉工作坊",
        "slug": "wild-vision-studio",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "结合真实素材二次创作，适合独立摄影师快速延展灵感。",
        "description": "支持上传参考人物与场景，智能保持风格一致性。",
        "primary_category": "品牌主理人",
        "secondary_category": "概念设计",
        "categories": ["品牌主理人", "概念设计"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#38bdf8",
        "owner_code": "DEMO2025",
        "visibility": "private",
    },
    {
        "name": "一瞬剧场导演席",
        "slug": "moment-theatre",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "复刻微电影镜头语言，提供构图脚本、动作提示与光影策略。",
        "description": "支持自动生成分镜脚注，并能输出动图预览。",
        "primary_category": "商业短片",
        "secondary_category": "未来科幻",
        "categories": ["商业短片", "未来科幻"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#f97316",
        "owner_code": "VIP2025",
        "visibility": "public",
    },
    {
        "name": "脉冲舞台交互室",
        "slug": "pulse-stage-lab",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1470229538611-16ba8c7ffbd7?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "围绕沉浸舞台打造灯光与动势指挥脚本。",
        "description": "实时计算舞台机械与观众视线，提供交互化cue表。",
        "primary_category": "舞台视觉",
        "secondary_category": "互动体验",
        "categories": ["舞台视觉", "互动体验", "商业短片"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#f43f5e",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "流光物料研究站",
        "slug": "lumaforge-lab",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "材质演算与能量表达的视觉实验助手。",
        "description": "提供材质能量图与色域迭代，帮助品牌快速锁定触感叙事。",
        "primary_category": "材质实验",
        "secondary_category": "概念设计",
        "categories": ["材质实验", "概念设计", "空间视觉"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#14b8a6",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "潮汐光绘联盟",
        "slug": "tide-light-alliance",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "擅长长曝光与光绘运动视觉的创作者助手。",
        "description": "针对海岸与城市夜景，生成光绘路径、色带与拍摄脚本。",
        "primary_category": "未来科幻",
        "secondary_category": "城市地景",
        "categories": ["未来科幻", "城市地景", "视觉特效"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#0ea5e9",
        "owner_code": "DEMO2025",
        "visibility": "public",
    },
    {
        "name": "深海造物间",
        "slug": "abyss-atelier",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "面向水下时尚与实验生物造型的灵感工作坊。",
        "description": "自动匹配水下质感、流线衣型与浮游构图，保护私有图库。",
        "primary_category": "时尚视觉",
        "secondary_category": "概念设计",
        "categories": ["时尚视觉", "概念设计", "材质实验"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#2563eb",
        "owner_code": "TEST001",
        "visibility": "private",
    },
    {
        "name": "星涌体验社",
        "slug": "starflux-studio",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "帮助独立艺术家筹划沉浸式体验节点与票务节奏。",
        "description": "输出氛围脚本、场地布光与多感官提示，维持创作者私有资产。",
        "primary_category": "沉浸体验",
        "secondary_category": "品牌主理人",
        "categories": ["沉浸体验", "品牌主理人", "互动体验"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#d946ef",
        "owner_code": "VIP2025",
        "visibility": "private",
    },
]


ADDITIONAL_SEED_ASSISTANTS = [
    {
        "name": "影脉场景引擎",
        "slug": "aether-stage-engine",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "自动编排沉浸式场景、光影与机位节奏的导演助手。",
        "description": "提供实时光效模拟、舞台走位与镜头节奏建议，快速输出导演手册。",
        "primary_category": "舞台视觉",
        "secondary_category": "互动体验",
        "categories": ["舞台视觉", "互动体验", "商业短片"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#7dd3fc",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "月潮光感蓝图",
        "slug": "lunar-tide-blueprint",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "聚焦夜景与海岸氛围的光影蓝图生成器。",
        "description": "适用于夜跑道、岸线与高层立面，输出高对比度光感方案。",
        "primary_category": "城市地景",
        "secondary_category": "未来科幻",
        "categories": ["城市地景", "未来科幻", "情绪人像"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#fef08a",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "火花叙事矩阵",
        "slug": "ember-story-matrix",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "品牌叙事与商业短片的脚本拆分引擎。",
        "description": "自动分析情绪节点与CTA，导出节奏化镜头脚本。",
        "primary_category": "品牌叙事",
        "secondary_category": "商业短片",
        "categories": ["品牌叙事", "商业短片", "品牌主理人"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#f97316",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "森域装置事务所",
        "slug": "forest-device-bureau",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "为自然主题展览生成装置脚本与结构草图。",
        "description": "融合声场、气味与光影，输出可执行的沉浸式装置方案。",
        "primary_category": "空间视觉",
        "secondary_category": "装置艺术",
        "categories": ["空间视觉", "装置艺术", "自然构造"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#84cc16",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "量子皮肤织造者",
        "slug": "quantum-skin-weaver",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "面向高定材质的细节纹理与肌理放大助手。",
        "description": "自动推演织物粒度、微光泽与实验材质混搭方式。",
        "primary_category": "时尚视觉",
        "secondary_category": "材质实验",
        "categories": ["时尚视觉", "材质实验", "概念设计"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#a855f7",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "曦光交互工坊",
        "slug": "aurora-interface-lab",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1482192597420-4817fdd7e8b0?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "多感官交互体验的脚本合成助手。",
        "description": "输出触摸、光影与声效的多轨交互时间线，并可导出工程表。",
        "primary_category": "互动体验",
        "secondary_category": "沉浸体验",
        "categories": ["互动体验", "沉浸体验", "音乐可视化"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#22d3ee",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "空港声像导演组",
        "slug": "aerohub-sonic-director",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "巡演与机场大屏声像一体的导演助手。",
        "description": "自动匹配航站节奏、客流行为与声光脚本，适配多语种播报。",
        "primary_category": "舞台视觉",
        "secondary_category": "音乐可视化",
        "categories": ["舞台视觉", "音乐可视化", "商业短片"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#fde047",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "霁夜动效剧社",
        "slug": "crystal-night-motion",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1505731132164-cca3d82d83d8?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "动效镜头与光绘交叠的视觉导演助手。",
        "description": "输出夜景动效分层、光迹速度与粒子脚本，便于快速合成。",
        "primary_category": "视觉特效",
        "secondary_category": "未来科幻",
        "categories": ["视觉特效", "未来科幻", "音乐可视化"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#818cf8",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "极光品牌调音室",
        "slug": "aurora-brand-tuner",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "品牌声像统一与调性色板生成助手。",
        "description": "整合品牌语气、音频识别与视觉调色，输出一致的内容套件。",
        "primary_category": "品牌主理人",
        "secondary_category": "品牌叙事",
        "categories": ["品牌主理人", "品牌叙事", "音乐可视化"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#f9a8d4",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "灵弦城市光谱站",
        "slug": "lyra-urban-spectrum",
        "type": "official",
        "cover_url": "https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?auto=format&fit=crop&w=1600&q=80&sat=-35",
        "cover_type": "image",
        "definition": "城市地标光谱与色带基调的快速生成助手。",
        "description": "根据城市属性推荐光谱曲线、材质反射率与镜面布局。",
        "primary_category": "城市地景",
        "secondary_category": "概念设计",
        "categories": ["城市地景", "概念设计", "品牌叙事"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#38bdf8",
        "owner_code": None,
        "visibility": "public",
    },
    {
        "name": "墨序插画工作室",
        "slug": "ink-sequence-studio",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1470104240373-bc1812eddc9f?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "结合手绘与AI延展的插画风格助手。",
        "description": "可锁定笔刷纹理并批量生成系列插画，保护原始线稿。",
        "primary_category": "概念设计",
        "secondary_category": "情绪人像",
        "categories": ["概念设计", "情绪人像"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#fb7185",
        "owner_code": "DEMO2025",
        "visibility": "private",
    },
    {
        "name": "回声时装基因库",
        "slug": "echo-couture-vault",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1521572163421-5c8e1a66f228?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "存储创作者时装风格DNA并快速复用。",
        "description": "可按季节导出走秀故事线，适配公开展示。",
        "primary_category": "时尚视觉",
        "secondary_category": "潮流主理",
        "categories": ["时尚视觉", "潮流主理"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#f472b6",
        "owner_code": "VIP2025",
        "visibility": "public",
    },
    {
        "name": "折光空间手册",
        "slug": "refraction-space-manual",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1441974231531-c6227db76b6a?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "聚焦玻璃、金属等折射材质的空间脚本助手。",
        "description": "可将实景参数和模型结合，输出沉浸式空间手册。",
        "primary_category": "空间视觉",
        "secondary_category": "装置艺术",
        "categories": ["空间视觉", "装置艺术", "沉浸体验"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#67e8f9",
        "owner_code": "TEST001",
        "visibility": "private",
    },
    {
        "name": "霁云舞台写作社",
        "slug": "serene-stage-script",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1469478715127-42292d9427b2?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "帮助舞台导演快速输出cue表与旁白脚本。",
        "description": "可与灯光、舞美数据联动，适配公开演出。",
        "primary_category": "舞台视觉",
        "secondary_category": "品牌叙事",
        "categories": ["舞台视觉", "品牌叙事"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#c084fc",
        "owner_code": "DEMO2025",
        "visibility": "public",
    },
    {
        "name": "星尘音乐视觉",
        "slug": "stardust-music-visuals",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80&sat=-35",
        "cover_type": "image",
        "definition": "绑定音乐节拍生成VJ视觉与灯光脚本。",
        "description": "可输出实时音频反应模板，保障私有素材安全。",
        "primary_category": "音乐可视化",
        "secondary_category": "未来科幻",
        "categories": ["音乐可视化", "未来科幻", "视觉特效"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#22d3ee",
        "owner_code": "VIP2025",
        "visibility": "private",
    },
    {
        "name": "浪潮品牌策动所",
        "slug": "surge-brand-lab",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1471070855862-329e50a1e6b1?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "聚焦节点营销的品牌节奏管理助手。",
        "description": "公开共享年度Campaign路线，适配多渠道投放。",
        "primary_category": "品牌主理人",
        "secondary_category": "商业短片",
        "categories": ["品牌主理人", "商业短片", "品牌叙事"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#fbbf24",
        "owner_code": "VIP2025",
        "visibility": "public",
    },
    {
        "name": "南弦互动小组",
        "slug": "southstring-interactive",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "针对疗愈系互动体验的故事脚本助手。",
        "description": "保存私有互动素材，并输出多感官路径设计。",
        "primary_category": "互动体验",
        "secondary_category": "沉浸体验",
        "categories": ["互动体验", "沉浸体验", "未来科幻"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#34d399",
        "owner_code": "TEST001",
        "visibility": "private",
    },
    {
        "name": "玻璃体光绘局",
        "slug": "glassframe-light-dept",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "专注玻璃幕墙与光绘摄影的创作助手。",
        "description": "公开输出部分光绘路径，保留私有RAW文件。",
        "primary_category": "视觉特效",
        "secondary_category": "潮流主理",
        "categories": ["视觉特效", "潮流主理", "城市地景"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#60a5fa",
        "owner_code": "DEMO2025",
        "visibility": "public",
    },
    {
        "name": "潮景素材银行",
        "slug": "tidescape-asset-bank",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "聚合海岸、潮汐与雾景素材的私有资产库。",
        "description": "批量管理素材版权，并按项目输出精选合集。",
        "primary_category": "品牌主理人",
        "secondary_category": "素材资产",
        "categories": ["品牌主理人", "素材资产", "城市地景"],
        "models": ["gemini-3-pro-image-preview"],
        "supports_image": True,
        "supports_video": False,
        "accent_color": "#0ea5e9",
        "owner_code": "TEST001",
        "visibility": "private",
    },
    {
        "name": "夜航影调方案库",
        "slug": "noctilux-grade-bay",
        "type": "custom",
        "cover_url": "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=1600&q=80",
        "cover_type": "image",
        "definition": "夜景影片的调色与颗粒质感配方库。",
        "description": "储存个人LookUp文件并可一键套用于短片项目。",
        "primary_category": "商业短片",
        "secondary_category": "情绪人像",
        "categories": ["商业短片", "情绪人像", "视觉特效"],
        "models": ["gemini-3-pro-image-preview", "gemini-2.5-flash-image"],
        "supports_image": True,
        "supports_video": True,
        "accent_color": "#f472b6",
        "owner_code": "VIP2025",
        "visibility": "private",
    },
]

SEED_ASSISTANTS.extend(ADDITIONAL_SEED_ASSISTANTS)


_seed_initialized = False
_categories_synchronized = False
_model_registry_seeded = False

_seed_lock = Lock()
_category_sync_lock = Lock()
_model_registry_lock = Lock()


def sanitize_required_text(value: str, field_name: str) -> str:
    trimmed = value.strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name}不能为空",
        )
    return trimmed


def sanitize_optional_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def extract_text_from_ai_payload(payload: Any) -> str:
    if payload is None:
        return ""
    if isinstance(payload, str):
        return payload
    if isinstance(payload, list):
        parts = [extract_text_from_ai_payload(item) for item in payload]
        return "\n".join(part for part in parts if part).strip()
    if isinstance(payload, dict):
        if "text" in payload:
            return extract_text_from_ai_payload(payload["text"])
        if "content" in payload:
            return extract_text_from_ai_payload(payload["content"])
        return "\n".join(
            extract_text_from_ai_payload(value)
            for value in payload.values()
            if value is not None
        ).strip()
    return str(payload)


def sanitize_comment_content(value: str) -> str:
    trimmed = (value or "").strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="评论内容不能为空",
        )
    if len(trimmed) > MAX_COMMENT_LENGTH:
        trimmed = trimmed[:MAX_COMMENT_LENGTH]
    return trimmed


def sanitize_group_name(value: str) -> str:
    trimmed = (value or "").strip()
    if not trimmed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="分组名称不能为空",
        )
    if len(trimmed) > 100:
        trimmed = trimmed[:100]
    return trimmed


def normalize_category_ids(category_ids: Optional[List[int]]) -> List[int]:
    normalized: List[int] = []
    seen: Set[int] = set()
    if not category_ids:
        return normalized
    for raw_id in category_ids:
        if raw_id is None:
            continue
        try:
            value = int(raw_id)
        except (TypeError, ValueError):
            continue
        if value <= 0 or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def normalize_category_names(names: Optional[List[str]]) -> List[str]:
    normalized: List[str] = []
    seen: Set[str] = set()
    if not names:
        return normalized
    for name in names:
        if not name:
            continue
        trimmed = name.strip()
        if not trimmed or trimmed in seen:
            continue
        seen.add(trimmed)
        normalized.append(trimmed)
    return normalized


def is_absolute_url(value: Optional[str]) -> bool:
    if not value:
        return False
    return value.lower().startswith(("http://", "https://"))


def build_cover_url(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if is_absolute_url(trimmed):
        return trimmed
    return f"{COVER_CDN_BASE_URL}/{trimmed.lstrip('/')}"


def resolve_cover_storage_path(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    trimmed = value.strip()
    if not trimmed or is_absolute_url(trimmed):
        return None
    return trimmed


def ensure_model_registry_initialized(db: Session) -> None:
    global _model_registry_seeded
    if _model_registry_seeded:
        return

    with _model_registry_lock:
        if _model_registry_seeded:
            return

        required_fields = (
            "credit_cost",
            "discount_credit_cost",
            "is_free_to_use",
        )
        missing_fields = [
            field for field in required_fields if not hasattr(ModelDefinition, field)
        ]
        if missing_fields:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "ModelDefinition 缺少字段："
                    + ", ".join(missing_fields)
                    + "。请确认 backend/app/models.py 同步完毕，并执行 SQL 脚本 backend/sql/202513_add_model_credit_recharge_and_agents.sql 后完整重启后端服务。"
                ),
            )

        existing_records = {
            row.name: row for row in db.query(ModelDefinition).all()
        }
        inserted = False
        updated = False
        for entry in ASSISTANT_MODEL_SEED:
            desired_order = entry.get("order_index", 100)
            desired_type = entry.get("model_type", "image")
            desired_cost = entry.get("credit_cost", 1)
            desired_discount = entry.get("discount_credit_cost")
            desired_free = entry.get("is_free_to_use", False)
            existing = existing_records.get(entry["name"])
            if existing:
                field_changed = False
                if existing.order_index != desired_order:
                    existing.order_index = desired_order
                    field_changed = True
                if existing.model_type != desired_type:
                    existing.model_type = desired_type
                    field_changed = True
                if existing.credit_cost != desired_cost:
                    existing.credit_cost = desired_cost
                    field_changed = True
                if existing.discount_credit_cost != desired_discount:
                    existing.discount_credit_cost = desired_discount
                    field_changed = True
                if existing.is_free_to_use != desired_free:
                    existing.is_free_to_use = desired_free
                    field_changed = True
                if field_changed:
                    updated = True
                continue
            record = ModelDefinition(
                name=entry["name"],
                alias=entry.get("alias"),
                description=entry.get("description"),
                logo_url=entry.get("logo_url"),
                status=entry.get("status", "active"),
                model_type=desired_type,
                order_index=desired_order,
                credit_cost=desired_cost,
                discount_credit_cost=desired_discount,
                is_free_to_use=desired_free,
            )
            db.add(record)
            inserted = True

        if inserted or updated:
            db.commit()

        _model_registry_seeded = True


def fetch_models_by_names(db: Session, model_names: Optional[List[str]]) -> List[ModelDefinition]:
    normalized: List[str] = []
    seen: Set[str] = set()
    if model_names:
        for raw in model_names:
            if not raw:
                continue
            trimmed = raw.strip()
            if not trimmed or trimmed in seen:
                continue
            normalized.append(trimmed)
            seen.add(trimmed)

    if not normalized:
        return []

    rows = (
        db.query(ModelDefinition)
        .filter(ModelDefinition.name.in_(normalized))
        .filter(ModelDefinition.status == "active")
        .all()
    )
    found = {row.name: row for row in rows}
    missing = [name for name in normalized if name not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"模型不存在：{missing}",
        )
    return [found[name] for name in normalized]


def assign_models_to_assistant(
    db: Session,
    assistant: AssistantProfile,
    models: List[ModelDefinition],
) -> None:
    db.query(AssistantModelLink).filter(
        AssistantModelLink.assistant_id == assistant.id
    ).delete()

    for model in models:
        db.add(
            AssistantModelLink(
                assistant_id=assistant.id,
                model_id=model.id,
            )
        )


def extract_model_names(assistant: AssistantProfile) -> List[str]:
    model_links = getattr(assistant, "model_links", None) or []
    names: List[str] = []
    for link in model_links:
        if link.model and link.model.name:
            names.append(link.model.name)
    return names


def generate_cover_object_key(owner_code: str, filename: Optional[str]) -> str:
    sanitized_owner = (owner_code or "anonymous").strip() or "anonymous"
    extension = "png"
    if filename and "." in filename:
        candidate = filename.rsplit(".", 1)[-1].lower()
        if candidate:
            extension = candidate
    return f"{sanitized_owner}/assistant/cover/{uuid4().hex}.{extension}"


def upload_cover_to_cos(
    file_bytes: bytes,
    object_key: str,
    original_filename: str,
    content_type: Optional[str],
) -> None:
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件内容为空",
        )

    client = TenCentCloudTool().init(COS_APP_ID).buildClient(COS_REGION)
    payload = {
        "name": original_filename,
        "type": content_type or "application/octet-stream",
        "body": file_bytes,
    }
    response = client.upload_file(
        bucket=COS_BUCKET,
        file=payload,
        fileName=object_key,
    )
    if not response.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=response.get("data") or "封面上传失败",
        )


def slugify(value: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return base or "assistant"


def generate_unique_slug(db: Session, candidate: str, current_id: Optional[int] = None) -> str:
    base_slug = slugify(candidate)
    slug = base_slug
    counter = 2
    while True:
        query = db.query(AssistantProfile).filter(AssistantProfile.slug == slug)
        if current_id is not None:
            query = query.filter(AssistantProfile.id != current_id)
        if not query.first():
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1


def generate_unique_category_slug(db: Session, name: str) -> str:
    base_slug = slugify(name) or "category"
    slug = base_slug
    counter = 2
    while db.query(AssistantCategory).filter(AssistantCategory.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug


def get_or_create_category_by_name(db: Session, name: str) -> AssistantCategory:
    normalized_name = name.strip()
    existing = (
        db.query(AssistantCategory)
        .filter(AssistantCategory.name == normalized_name)
        .first()
    )
    if existing:
        if not existing.is_active:
            existing.is_active = True
        return existing

    slug = generate_unique_category_slug(db, normalized_name)
    category = AssistantCategory(
        name=normalized_name,
        slug=slug,
        is_active=True,
    )
    db.add(category)
    db.flush()
    return category


def fetch_categories_by_ids(db: Session, category_ids: List[int]) -> List[AssistantCategory]:
    if not category_ids:
        return []

    rows = (
        db.query(AssistantCategory)
        .filter(
            AssistantCategory.id.in_(category_ids),
            AssistantCategory.is_active.is_(True),
        )
        .all()
    )
    found = {row.id: row for row in rows}
    missing = [cid for cid in set(category_ids) if cid not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"分类不存在：{missing}",
        )
    return [found[cid] for cid in category_ids]


def fetch_categories_by_names(
    db: Session,
    names: List[str],
    allow_create: bool = False,
) -> List[AssistantCategory]:
    categories: List[AssistantCategory] = []
    for name in names:
        record = (
            db.query(AssistantCategory)
            .filter(AssistantCategory.name == name)
            .first()
        )
        if record:
            if not record.is_active:
                record.is_active = True
            categories.append(record)
            continue
        if not allow_create:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"分类不存在：{name}",
            )
        categories.append(get_or_create_category_by_name(db, name))
    return categories


def resolve_categories_for_payload(
    db: Session,
    category_ids: Optional[List[int]],
) -> List[AssistantCategory]:
    normalized_ids = normalize_category_ids(category_ids)
    if not normalized_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="请至少选择一个有效分类",
        )
    return fetch_categories_by_ids(db, normalized_ids)


def apply_category_assignments(
    db: Session,
    assistant: AssistantProfile,
    categories: List[AssistantCategory],
) -> None:
    unique_categories: List[AssistantCategory] = []
    seen_category_ids: Set[int] = set()
    for category in categories:
        if not category or category.id in seen_category_ids:
            continue
        seen_category_ids.add(category.id)
        unique_categories.append(category)

    category_names = [category.name for category in unique_categories]
    assistant.categories = json.dumps(category_names, ensure_ascii=False)

    db.query(AssistantCategoryLink).filter(
        AssistantCategoryLink.assistant_id == assistant.id
    ).delete(synchronize_session=False)
    db.flush()

    for category in unique_categories:
        db.add(
            AssistantCategoryLink(
                assistant_id=assistant.id,
                category_id=category.id,
            )
        )


def ensure_category_dictionary_initialized(db: Session) -> None:
    global _categories_synchronized
    if _categories_synchronized:
        return

    with _category_sync_lock:
        if _categories_synchronized:
            return

        assistants = db.query(AssistantProfile).all()
        updated = False
        for assistant in assistants:
            existing_names = parse_json_field(assistant.categories)

            normalized_names = normalize_category_names(existing_names)
            if not normalized_names:
                continue

            categories = fetch_categories_by_names(
                db,
                normalized_names,
                allow_create=True,
            )
            if assistant.id is None:
                db.flush()
            apply_category_assignments(db, assistant, categories)
            updated = True

        if updated:
            db.commit()

        _categories_synchronized = True


def require_active_auth_code(db: Session, auth_code: Optional[str]) -> AuthCode:
    if not auth_code:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少授权码",
        )

    record = db.query(AuthCode).filter(AuthCode.code == auth_code).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="授权码不存在",
        )

    if record.expire_time and record.expire_time < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="授权码已过期",
        )

    if record.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="授权码不可用",
        )

    return record


def ensure_custom_assistant_owned(
    db: Session,
    assistant_id: int,
    owner_code: str,
) -> AssistantProfile:
    assistant = (
        db.query(AssistantProfile)
        .filter(AssistantProfile.id == assistant_id)
        .first()
    )
    if not assistant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="助手不存在",
        )

    if assistant.type != "custom":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅自定义助手支持此操作",
        )

    if assistant.owner_code != owner_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权操作该助手",
        )

    return assistant


def ensure_commentable_assistant(
    db: Session,
    assistant_id: int,
) -> AssistantProfile:
    assistant = (
        db.query(AssistantProfile)
        .filter(
            AssistantProfile.id == assistant_id,
            AssistantProfile.status == "active",
        )
        .first()
    )
    if not assistant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="助手不存在",
        )

    if assistant.type == "official":
        return assistant

    if assistant.type == "custom" and assistant.visibility == "public":
        return assistant

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="仅官方助手或公开创作者助手支持评论",
    )


def ensure_seed_data(db: Session) -> None:
    global _seed_initialized
    if _seed_initialized:
        return

    with _seed_lock:
        if _seed_initialized:
            return

        ensure_model_registry_initialized(db)

        existing_slugs = {
            slug for (slug,) in db.query(AssistantProfile.slug).all() if slug
        }
        inserted = False

        for entry in SEED_ASSISTANTS:
            slug = entry.get("slug") or slugify(entry["name"])
            if slug in existing_slugs:
                continue

            record = AssistantProfile(
                name=entry["name"],
                slug=slug,
                type=entry["type"],
                owner_code=entry["owner_code"],
                cover_url=entry["cover_url"],
                cover_type=entry["cover_type"],
                definition=entry["definition"],
                description=entry.get("description"),
                categories=json.dumps(entry.get("categories", []), ensure_ascii=False),
                supports_image=entry.get("supports_image", True),
                supports_video=entry.get("supports_video", False),
                accent_color=entry.get("accent_color"),
                visibility=entry.get("visibility", "public"),
                status="active",
            )
            db.add(record)
            db.flush()

            seed_category_names = normalize_category_names(entry.get("categories", []))
            if not seed_category_names:
                fallback_names: List[str] = []
                if entry.get("primary_category"):
                    fallback_names.append(entry["primary_category"])
                if entry.get("secondary_category"):
                    fallback_names.append(entry["secondary_category"])
                seed_category_names = normalize_category_names(fallback_names)

            if seed_category_names:
                category_records = fetch_categories_by_names(
                    db,
                    seed_category_names,
                    allow_create=True,
                )
                apply_category_assignments(db, record, category_records)

            models = fetch_models_by_names(db, entry.get("models"))
            if models:
                assign_models_to_assistant(db, record, models)

            inserted = True
            existing_slugs.add(slug)

        if inserted:
            db.commit()

        ensure_category_dictionary_initialized(db)
        _seed_initialized = True


def parse_json_field(value: Optional[str]) -> List[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def build_owner_public_metadata(
    db: Session,
    owner_codes: Set[str],
) -> Dict[str, Dict[str, Optional[str]]]:
    metadata: Dict[str, Dict[str, Optional[str]]] = {}
    if not owner_codes:
        return metadata

    rows = (
        db.query(AuthCode.code, AuthCode.creator_name)
        .filter(AuthCode.code.in_(owner_codes))
        .all()
    )

    for code, creator_name in rows:
        display_name = (creator_name or "").strip() or "未定义"
        metadata[code] = {
            "display_name": display_name,
            "masked_code": mask_auth_code(code),
        }

    return metadata


def serialize_assistant(
    assistant: AssistantProfile,
    owner_metadata: Optional[Dict[str, Dict[str, Optional[str]]]] = None,
    favorite_assistant_ids: Optional[Set[int]] = None,
    favorite_assignments: Optional[Dict[int, Dict[str, Optional[str]]]] = None,
) -> AssistantProfileResponse:
    category_links = getattr(assistant, "category_links", None) or []
    category_ids: List[int] = []
    category_names: List[str] = []

    for link in category_links:
        if link.category:
            category_ids.append(link.category.id)
            category_names.append(link.category.name)

    if not category_names:
        category_names = parse_json_field(assistant.categories)

    metadata = owner_metadata or {}
    owner_display_name: Optional[str] = None
    owner_code_masked: Optional[str] = None
    if assistant.owner_code:
        owner_info = metadata.get(assistant.owner_code)
        if owner_info:
            owner_display_name = owner_info.get("display_name")
            owner_code_masked = owner_info.get("masked_code")
        else:
            owner_code_masked = mask_auth_code(assistant.owner_code)

    resolved_cover_url = build_cover_url(assistant.cover_url) or assistant.cover_url
    cover_storage_path = resolve_cover_storage_path(assistant.cover_url)
    model_names = extract_model_names(assistant)
    primary_category = category_names[0] if category_names else None
    secondary_category = category_names[1] if len(category_names) > 1 else None
    is_favorited = False
    if favorite_assistant_ids and assistant.id is not None:
        is_favorited = assistant.id in favorite_assistant_ids

    favorite_group_id: Optional[int] = None
    favorite_group_name: Optional[str] = None
    if favorite_assignments and assistant.id is not None:
        assignment = favorite_assignments.get(assistant.id)
        if assignment:
            favorite_group_id = assignment.get("group_id")
            favorite_group_name = assignment.get("group_name")

    return AssistantProfileResponse(
        id=assistant.id,
        name=assistant.name,
        slug=assistant.slug,
        definition=assistant.definition,
        description=assistant.description,
        cover_url=resolved_cover_url or "",
        cover_storage_path=cover_storage_path,
        cover_type=assistant.cover_type,
        primary_category=primary_category,
        secondary_category=secondary_category,
        categories=category_names,
        category_ids=category_ids,
        models=model_names,
        supports_image=assistant.supports_image,
        supports_video=assistant.supports_video,
        accent_color=assistant.accent_color,
        type=assistant.type,
        owner_code=assistant.owner_code,
        owner_display_name=owner_display_name,
        owner_code_masked=owner_code_masked,
        visibility=assistant.visibility,
        is_favorited=is_favorited,
        favorite_group_id=favorite_group_id,
        favorite_group_name=favorite_group_name,
        status=assistant.status,
        created_at=assistant.created_at,
        updated_at=assistant.updated_at,
    )


def serialize_assistant_with_owner(
    db: Session,
    assistant: AssistantProfile,
    favorite_assistant_ids: Optional[Set[int]] = None,
    favorite_assignments: Optional[Dict[int, Dict[str, Optional[str]]]] = None,
) -> AssistantProfileResponse:
    owner_codes = {assistant.owner_code} if assistant.owner_code else set()
    owner_metadata = build_owner_public_metadata(db, owner_codes)
    return serialize_assistant(
        assistant,
        owner_metadata,
        favorite_assistant_ids,
        favorite_assignments,
    )


def serialize_comment(
    comment: AssistantComment,
    liked_comment_ids: Optional[Set[int]] = None,
    viewer_code: Optional[str] = None,
) -> AssistantCommentResponse:
    author_display_name = "未定义"
    if comment.author:
        preferred_name = (comment.author.creator_name or comment.author.contact_name or "").strip()
        if preferred_name:
            author_display_name = preferred_name
    author_code_masked = mask_auth_code(comment.auth_code)
    like_count = comment.like_count or 0
    liked = bool(liked_comment_ids and comment.id in liked_comment_ids)
    can_delete = viewer_code is not None and viewer_code == comment.auth_code
    return AssistantCommentResponse(
        id=comment.id,
        assistant_id=comment.assistant_id,
        content=comment.content,
        like_count=like_count,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        author_display_name=author_display_name,
        author_code_masked=author_code_masked,
        can_delete=can_delete,
        liked_by_viewer=liked,
    )


def apply_common_filters(
    query,
    search: Optional[str],
    category: Optional[str],
    category_id: Optional[int],
    cover_type: Optional[str],
):
    if search:
        keyword = f"%{search.strip()}%"
        query = query.outerjoin(AuthCode, AssistantProfile.owner_code == AuthCode.code)
        query = query.filter(
            or_(
                AssistantProfile.name.ilike(keyword),
                AssistantProfile.definition.ilike(keyword),
                AssistantProfile.description.ilike(keyword),
                AuthCode.creator_name.ilike(keyword),
            )
        )

    normalized_cover_type = (cover_type or "").lower()
    if normalized_cover_type in {"image", "video", "gif"}:
        query = query.filter(AssistantProfile.cover_type == normalized_cover_type)

    category_filter_id = category_id if category_id and category_id > 0 else None
    if category_filter_id:
        query = query.filter(
            AssistantProfile.category_links.any(
                AssistantCategoryLink.category_id == category_filter_id
            )
        )
    elif category and category not in {"", "全部", "all"}:
        normalized_category = category.strip()
        if normalized_category:
            query = query.filter(
                AssistantProfile.category_links.any(
                    AssistantCategoryLink.category.has(
                        AssistantCategory.name == normalized_category
                    )
                )
            )

    return query


def build_paginated_section(
    db: Session,
    assistant_type: str,
    page: int,
    page_size: int,
    search: Optional[str],
    category: Optional[str],
    category_id: Optional[int],
    owner_code: Optional[str],
    visibility_filter: Optional[str] = None,
    cover_type: Optional[str] = None,
    favorite_assistant_ids: Optional[Set[int]] = None,
    favorite_owner_code: Optional[str] = None,
) -> AssistantPaginatedSection:
    if page < 1:
        page = 1
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    query = (
        db.query(AssistantProfile)
        .filter(
            AssistantProfile.type == assistant_type,
            AssistantProfile.status == "active",
        )
        .options(
            selectinload(AssistantProfile.category_links).selectinload(
                AssistantCategoryLink.category
            ),
            selectinload(AssistantProfile.model_links).selectinload(
                AssistantModelLink.model
            ),
        )
    )

    normalized_visibility = (visibility_filter or "all").lower()

    if assistant_type == "custom":
        if not owner_code:
            # 未传入授权码时，自定义助手不可见
            return AssistantPaginatedSection(items=[], total=0, page=page, page_size=page_size)

        if normalized_visibility not in {"all", "public", "private"}:
            normalized_visibility = "all"

        if normalized_visibility == "private":
            query = query.filter(
                AssistantProfile.visibility == "private",
                AssistantProfile.owner_code == owner_code,
            )
        elif normalized_visibility == "public":
            query = query.filter(AssistantProfile.visibility == "public")
        else:
            query = query.filter(
                or_(
                    AssistantProfile.visibility == "public",
                    AssistantProfile.owner_code == owner_code,
                )
            )
    else:
        query = query.filter(
            AssistantProfile.owner_code.is_(None),
            AssistantProfile.visibility == "public",
        )

    query = apply_common_filters(
        query,
        search=search,
        category=category,
        category_id=category_id,
        cover_type=cover_type,
    )

    total = query.count()
    sort_order = []
    if assistant_type == "custom":
        visibility_priority = case(
            (AssistantProfile.visibility == "private", 1),
            else_=0,
        )
        sort_order.append(visibility_priority.desc())
    sort_order.append(AssistantProfile.updated_at.desc())

    rows = (
        query.order_by(*sort_order)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    owner_codes = {row.owner_code for row in rows if row.owner_code}
    owner_metadata = build_owner_public_metadata(db, owner_codes)
    assistant_ids = [row.id for row in rows if row.id is not None]
    favorite_assignments = get_favorite_assignment_map(
        db,
        favorite_owner_code,
        assistant_ids,
    )
    items = [
        serialize_assistant(
            row,
            owner_metadata,
            favorite_assistant_ids,
            favorite_assignments,
        )
        for row in rows
    ]
    return AssistantPaginatedSection(items=items, total=total, page=page, page_size=page_size)


def get_favorite_assistant_ids(db: Session, auth_code: Optional[str]) -> Set[int]:
    if not auth_code:
        return set()
    rows = (
        db.query(AssistantFavorite.assistant_id)
        .filter(AssistantFavorite.auth_code == auth_code)
        .all()
    )
    return {assistant_id for (assistant_id,) in rows}


def get_favorite_assignment_map(
    db: Session,
    auth_code: Optional[str],
    assistant_ids: List[int],
) -> Dict[int, Dict[str, Optional[str]]]:
    if not auth_code or not assistant_ids:
        return {}

    rows = (
        db.query(
            AssistantFavorite.assistant_id,
            FavoriteGroup.id.label("group_id"),
            FavoriteGroup.name.label("group_name"),
        )
        .outerjoin(FavoriteGroup, FavoriteGroup.id == AssistantFavorite.group_id)
        .filter(
            AssistantFavorite.auth_code == auth_code,
            AssistantFavorite.assistant_id.in_(assistant_ids),
        )
        .all()
    )

    assignments: Dict[int, Dict[str, Optional[str]]] = {}
    for assistant_id, group_id, group_name in rows:
        assignments[assistant_id] = {
            "group_id": group_id,
            "group_name": group_name,
        }
    return assignments


def build_favorites_section(
    db: Session,
    auth_code: Optional[str],
    favorite_assistant_ids: Set[int],
    page: int,
    page_size: int,
    search: Optional[str],
    category: Optional[str],
    category_id: Optional[int],
    cover_type: Optional[str],
    favorite_group_ids: Optional[List[int]] = None,
) -> AssistantPaginatedSection:
    if not auth_code or not favorite_assistant_ids:
        return AssistantPaginatedSection(items=[], total=0, page=page, page_size=page_size)

    query = (
        db.query(AssistantProfile)
        .join(AssistantFavorite, AssistantFavorite.assistant_id == AssistantProfile.id)
        .filter(
            AssistantFavorite.auth_code == auth_code,
            AssistantProfile.status == "active",
        )
        .options(
            selectinload(AssistantProfile.category_links).selectinload(
                AssistantCategoryLink.category
            ),
            selectinload(AssistantProfile.model_links).selectinload(
                AssistantModelLink.model
            ),
        )
    )

    include_ungrouped = False
    normalized_group_ids: List[int] = []
    if favorite_group_ids:
        seen: Set[int] = set()
        for raw_group_id in favorite_group_ids:
            if raw_group_id is None:
                continue
            if raw_group_id == 0:
                include_ungrouped = True
                continue
            try:
                value = int(raw_group_id)
            except (TypeError, ValueError):
                continue
            if value <= 0 or value in seen:
                continue
            seen.add(value)
            normalized_group_ids.append(value)

    if normalized_group_ids and include_ungrouped:
        query = query.filter(
            or_(
                AssistantFavorite.group_id.in_(normalized_group_ids),
                AssistantFavorite.group_id.is_(None),
            )
        )
    elif normalized_group_ids:
        query = query.filter(AssistantFavorite.group_id.in_(normalized_group_ids))
    elif include_ungrouped:
        query = query.filter(AssistantFavorite.group_id.is_(None))

    query = apply_common_filters(
        query,
        search=search,
        category=category,
        category_id=category_id,
        cover_type=cover_type,
    )

    total = query.count()
    rows = (
        query.order_by(AssistantFavorite.created_at.desc(), AssistantProfile.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    owner_codes = {row.owner_code for row in rows if row.owner_code}
    owner_metadata = build_owner_public_metadata(db, owner_codes)
    assistant_ids = [row.id for row in rows if row.id is not None]
    favorite_assignments = get_favorite_assignment_map(db, auth_code, assistant_ids)
    items = [
        serialize_assistant(
            row,
            owner_metadata,
            favorite_assistant_ids,
            favorite_assignments,
        )
        for row in rows
    ]
    return AssistantPaginatedSection(items=items, total=total, page=page, page_size=page_size)


def serialize_favorite_group_response(
    group: FavoriteGroup,
    assistant_count: int,
) -> FavoriteGroupResponse:
    return FavoriteGroupResponse(
        id=group.id,
        name=group.name,
        assistant_count=assistant_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def ensure_favorite_group_owned(
    db: Session,
    group_id: int,
    auth_code: str,
) -> FavoriteGroup:
    group = (
        db.query(FavoriteGroup)
        .filter(
            FavoriteGroup.id == group_id,
            FavoriteGroup.auth_code == auth_code,
        )
        .first()
    )
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="收藏分组不存在",
        )
    return group


def fetch_favorite_groups_with_counts(
    db: Session,
    auth_code: str,
) -> List[FavoriteGroupResponse]:
    rows = (
        db.query(
            FavoriteGroup,
            func.count(AssistantFavorite.id).label("assistant_count"),
        )
        .outerjoin(
            AssistantFavorite,
            and_(
                AssistantFavorite.group_id == FavoriteGroup.id,
                AssistantFavorite.auth_code == FavoriteGroup.auth_code,
            ),
        )
        .filter(FavoriteGroup.auth_code == auth_code)
        .group_by(FavoriteGroup.id)
        .order_by(FavoriteGroup.created_at.asc())
        .all()
    )
    return [
        serialize_favorite_group_response(group, assistant_count)
        for group, assistant_count in rows
    ]


def count_favorites_in_group(
    db: Session,
    auth_code: str,
    group_id: int,
) -> int:
    result = (
        db.query(func.count(AssistantFavorite.id))
        .filter(
            AssistantFavorite.auth_code == auth_code,
            AssistantFavorite.group_id == group_id,
        )
        .scalar()
    )
    return int(result or 0)


def get_available_categories(
    db: Session,
    include_empty: bool = False,
) -> List[AssistantCategorySummary]:
    ensure_category_dictionary_initialized(db)

    query = (
        db.query(
            AssistantCategory.id,
            AssistantCategory.name,
            AssistantCategory.slug,
            AssistantCategory.description,
            AssistantCategory.accent_color,
            AssistantCategory.sort_order,
            AssistantCategory.is_active,
            func.count(AssistantCategoryLink.assistant_id).label("assistant_count"),
        )
        .outerjoin(
            AssistantCategoryLink,
            AssistantCategoryLink.category_id == AssistantCategory.id,
        )
        .filter(AssistantCategory.is_active.is_(True))
        .group_by(AssistantCategory.id)
        .order_by(AssistantCategory.sort_order.asc(), AssistantCategory.name.asc())
    )

    if not include_empty:
        query = query.having(func.count(AssistantCategoryLink.assistant_id) > 0)

    rows = query.all()
    return [
        AssistantCategorySummary(
            id=row.id,
            name=row.name,
            slug=row.slug,
            description=row.description,
            accent_color=row.accent_color,
            sort_order=row.sort_order,
            assistant_count=row.assistant_count,
            is_active=row.is_active,
        )
        for row in rows
    ]


@router.get("/", response_model=AssistantMarketplaceResponse)
def list_assistants(
    search: Optional[str] = Query(None, max_length=100),
    category: Optional[str] = Query(None, max_length=50),
    category_id: Optional[int] = Query(
        None,
        ge=1,
        description="按分类ID筛选助手",
    ),
    official_page: int = Query(1, ge=1),
    custom_page: int = Query(1, ge=1),
    favorites_page: int = Query(1, ge=1),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    favorites_page_size: Optional[int] = Query(
        None,
        ge=1,
        le=MAX_PAGE_SIZE,
        description="收藏分页大小，默认与page_size一致",
    ),
    auth_code: Optional[str] = Query(None, description="当前登录的授权码，用于筛选自定义助手"),
    custom_visibility: Optional[str] = Query(
        "all",
        regex="^(all|public|private)$",
        description="自定义助手可见性：all/public/private",
    ),
    cover_type: Optional[str] = Query(
        None,
        regex="^(image|video|gif)$",
        description="按封面媒介筛选助手",
    ),
    favorite_group_ids: Optional[List[int]] = Query(
        None,
        description="按收藏分组筛选，传入多个 favorite_group_ids=1&favorite_group_ids=2，0 表示未分组",
    ),
    db: Session = Depends(get_db),
) -> AssistantMarketplaceResponse:
    ensure_seed_data(db)

    normalized_favorites_page_size = favorites_page_size or page_size
    favorite_assistant_ids = get_favorite_assistant_ids(db, auth_code)

    official_section = build_paginated_section(
        db=db,
        assistant_type="official",
        page=official_page,
        page_size=page_size,
        search=search,
        category=category,
        category_id=category_id,
        owner_code=None,
        visibility_filter="public",
        cover_type=cover_type,
        favorite_assistant_ids=favorite_assistant_ids,
        favorite_owner_code=auth_code,
    )

    custom_section = build_paginated_section(
        db=db,
        assistant_type="custom",
        page=custom_page,
        page_size=page_size,
        search=search,
        category=category,
        category_id=category_id,
        owner_code=auth_code,
        visibility_filter=custom_visibility,
        cover_type=cover_type,
        favorite_assistant_ids=favorite_assistant_ids,
        favorite_owner_code=auth_code,
    )

    favorites_section = build_favorites_section(
        db=db,
        auth_code=auth_code,
        favorite_assistant_ids=favorite_assistant_ids,
        page=favorites_page,
        page_size=normalized_favorites_page_size,
        search=search,
        category=category,
        category_id=category_id,
        cover_type=cover_type,
        favorite_group_ids=favorite_group_ids,
    )

    return AssistantMarketplaceResponse(
        official=official_section,
        custom=custom_section,
        favorites=favorites_section,
        available_categories=get_available_categories(db),
    )


@router.get("/favorites/groups", response_model=List[FavoriteGroupResponse])
def list_favorite_groups(
    auth_code: str = Query(..., max_length=100, description="授权码"),
    db: Session = Depends(get_db),
) -> List[FavoriteGroupResponse]:
    owner = require_active_auth_code(db, auth_code)
    return fetch_favorite_groups_with_counts(db, owner.code)


@router.post(
    "/favorites/groups",
    response_model=FavoriteGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_favorite_group(
    payload: FavoriteGroupCreateRequest,
    db: Session = Depends(get_db),
) -> FavoriteGroupResponse:
    owner = require_active_auth_code(db, payload.auth_code)
    name = sanitize_group_name(payload.name)
    existing = (
        db.query(FavoriteGroup)
        .filter(
            FavoriteGroup.auth_code == owner.code,
            FavoriteGroup.name == name,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="分组名称已存在",
        )

    group = FavoriteGroup(auth_code=owner.code, name=name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return serialize_favorite_group_response(group, 0)


@router.patch("/favorites/groups/{group_id}", response_model=FavoriteGroupResponse)
def update_favorite_group(
    group_id: int,
    payload: FavoriteGroupUpdateRequest,
    db: Session = Depends(get_db),
) -> FavoriteGroupResponse:
    owner = require_active_auth_code(db, payload.auth_code)
    group = ensure_favorite_group_owned(db, group_id, owner.code)
    name = sanitize_group_name(payload.name)

    duplicate = (
        db.query(FavoriteGroup)
        .filter(
            FavoriteGroup.auth_code == owner.code,
            FavoriteGroup.name == name,
            FavoriteGroup.id != group.id,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="分组名称已存在",
        )

    group.name = name
    db.commit()
    db.refresh(group)
    assistant_count = count_favorites_in_group(db, owner.code, group.id)
    return serialize_favorite_group_response(group, assistant_count)


@router.delete("/favorites/groups/{group_id}")
def delete_favorite_group(
    group_id: int,
    auth_code: str = Query(..., max_length=100, description="授权码"),
    db: Session = Depends(get_db),
) -> Dict[str, bool]:
    owner = require_active_auth_code(db, auth_code)
    group = ensure_favorite_group_owned(db, group_id, owner.code)

    (
        db.query(AssistantFavorite)
        .filter(
            AssistantFavorite.auth_code == owner.code,
            AssistantFavorite.group_id == group.id,
        )
        .update({AssistantFavorite.group_id: None}, synchronize_session=False)
    )

    db.delete(group)
    db.commit()
    return {"success": True}


@router.get("/categories", response_model=List[AssistantCategoryResponse])
def list_assistant_categories(
    include_empty: bool = Query(False, description="是否返回仍未关联助手的分类"),
    db: Session = Depends(get_db),
) -> List[AssistantCategoryResponse]:
    ensure_seed_data(db)
    categories = get_available_categories(db, include_empty=include_empty)
    return [AssistantCategoryResponse(**category.dict()) for category in categories]


@router.get("/models", response_model=List[AssistantModelResponse])
def list_assistant_models(
    include_inactive: bool = Query(False, description="是否包含失效模型"),
    model_type: Optional[str] = Query(None, description="按媒介类型过滤，可选 chat/image/video"),
    db: Session = Depends(get_db),
) -> List[AssistantModelResponse]:
    ensure_model_registry_initialized(db)
    query = db.query(ModelDefinition)
    if not include_inactive:
        query = query.filter(ModelDefinition.status == "active")
    normalized_type: Optional[str] = None
    if model_type:
        normalized_type = model_type.strip().lower()
        if normalized_type not in MODEL_TYPE_CHOICES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不支持的模型类型",
            )
        query = query.filter(ModelDefinition.model_type == normalized_type)
    rows = query.order_by(ModelDefinition.order_index.asc(), ModelDefinition.name.asc()).all()
    return [
        AssistantModelResponse(
            id=row.id,
            name=row.name,
            alias=row.alias,
            description=row.description,
            logo_url=row.logo_url,
            status=row.status,
            model_type=row.model_type,
            order_index=row.order_index,
            credit_cost=row.credit_cost,
            discount_credit_cost=row.discount_credit_cost,
            is_free_to_use=row.is_free_to_use,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.post("/", response_model=AssistantProfileResponse, status_code=status.HTTP_201_CREATED)
def create_custom_assistant(
    payload: AssistantProfileCreate,
    db: Session = Depends(get_db),
) -> AssistantProfileResponse:
    ensure_seed_data(db)
    ensure_model_registry_initialized(db)
    owner = require_active_auth_code(db, payload.auth_code)
    slug = generate_unique_slug(db, payload.slug or payload.name)

    category_records = resolve_categories_for_payload(
        db,
        payload.category_ids,
    )

    record = AssistantProfile(
        name=sanitize_required_text(payload.name, "助手名称"),
        slug=slug,
        type="custom",
        owner_code=owner.code,
        cover_url=sanitize_required_text(payload.cover_url, "封面地址"),
        cover_type=sanitize_required_text(payload.cover_type or "image", "封面类型"),
        definition=sanitize_required_text(payload.definition, "助手定义"),
        description=sanitize_optional_text(payload.description),
        categories="[]",
        supports_image=payload.supports_image,
        supports_video=payload.supports_video,
        accent_color=sanitize_optional_text(payload.accent_color),
        visibility=payload.visibility,
        status="active",
    )

    db.add(record)
    db.flush()

    selected_models = fetch_models_by_names(db, payload.models)
    if selected_models:
        assign_models_to_assistant(db, record, selected_models)

    if category_records:
        apply_category_assignments(db, record, category_records)

    db.commit()
    db.refresh(record)
    return serialize_assistant_with_owner(db, record)


@router.put("/{assistant_id}", response_model=AssistantProfileResponse)
def update_custom_assistant(
    assistant_id: int,
    payload: AssistantProfileUpdate,
    db: Session = Depends(get_db),
) -> AssistantProfileResponse:
    owner = require_active_auth_code(db, payload.auth_code)
    assistant = ensure_custom_assistant_owned(db, assistant_id, owner.code)
    ensure_model_registry_initialized(db)

    category_update_requested = payload.category_ids is not None

    categories_to_assign: Optional[List[AssistantCategory]] = None
    if category_update_requested:
        categories_to_assign = resolve_categories_for_payload(
            db,
            payload.category_ids,
        )

    models_to_assign: Optional[List[ModelDefinition]] = None
    if payload.models is not None:
        models_to_assign = fetch_models_by_names(db, payload.models)

    if payload.name is not None:
        assistant.name = sanitize_required_text(payload.name, "助手名称")
    if payload.definition is not None:
        assistant.definition = sanitize_required_text(payload.definition, "助手定义")
    if payload.description is not None:
        assistant.description = sanitize_optional_text(payload.description)
    if payload.cover_url is not None:
        assistant.cover_url = sanitize_required_text(payload.cover_url, "封面地址")
    if payload.cover_type is not None:
        assistant.cover_type = sanitize_required_text(payload.cover_type, "封面类型")
    if payload.supports_image is not None:
        assistant.supports_image = payload.supports_image
    if payload.supports_video is not None:
        assistant.supports_video = payload.supports_video
    if payload.accent_color is not None:
        assistant.accent_color = sanitize_optional_text(payload.accent_color)
    if payload.visibility is not None:
        assistant.visibility = payload.visibility
    if payload.slug is not None:
        slug_source = payload.slug or assistant.name
        assistant.slug = generate_unique_slug(db, slug_source, current_id=assistant.id)

    if categories_to_assign is not None:
        apply_category_assignments(db, assistant, categories_to_assign)

    if models_to_assign is not None:
        assign_models_to_assistant(db, assistant, models_to_assign)

    db.commit()
    db.refresh(assistant)
    return serialize_assistant_with_owner(db, assistant)


@router.patch("/{assistant_id}/visibility", response_model=AssistantProfileResponse)
def update_custom_assistant_visibility(
    assistant_id: int,
    payload: AssistantVisibilityUpdate,
    db: Session = Depends(get_db),
) -> AssistantProfileResponse:
    owner = require_active_auth_code(db, payload.auth_code)
    assistant = ensure_custom_assistant_owned(db, assistant_id, owner.code)
    assistant.visibility = payload.visibility

    db.commit()
    db.refresh(assistant)
    return serialize_assistant_with_owner(db, assistant)


@router.post("/{assistant_id}/favorites/toggle", response_model=AssistantFavoriteToggleResponse)
def toggle_assistant_favorite(
    assistant_id: int,
    payload: AssistantFavoriteToggleRequest,
    db: Session = Depends(get_db),
) -> AssistantFavoriteToggleResponse:
    owner = require_active_auth_code(db, payload.auth_code)
    assistant = (
        db.query(AssistantProfile)
        .filter(
            AssistantProfile.id == assistant_id,
            AssistantProfile.status == "active",
        )
        .first()
    )
    if not assistant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="助手不存在",
        )

    if (
        assistant.type == "custom"
        and assistant.visibility == "private"
        and assistant.owner_code != owner.code
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权收藏该助手",
        )

    existing = (
        db.query(AssistantFavorite)
        .filter(
            AssistantFavorite.auth_code == owner.code,
            AssistantFavorite.assistant_id == assistant_id,
        )
        .first()
    )

    if existing:
        db.delete(existing)
        db.commit()
        return AssistantFavoriteToggleResponse(
            assistant_id=assistant_id,
            is_favorited=False,
            favorite_group_id=None,
            favorite_group_name=None,
        )

    assigned_group = None
    if payload.group_id is not None:
        assigned_group = ensure_favorite_group_owned(db, payload.group_id, owner.code)

    record = AssistantFavorite(
        auth_code=owner.code,
        assistant_id=assistant.id,
        group_id=assigned_group.id if assigned_group else None,
    )
    db.add(record)
    db.commit()
    return AssistantFavoriteToggleResponse(
        assistant_id=assistant_id,
        is_favorited=True,
        favorite_group_id=assigned_group.id if assigned_group else None,
        favorite_group_name=assigned_group.name if assigned_group else None,
    )


@router.post(
    "/{assistant_id}/favorites/group",
    response_model=AssistantFavoriteGroupAssignmentResponse,
)
def assign_favorite_group_to_assistant(
    assistant_id: int,
    payload: AssistantFavoriteGroupAssignmentRequest,
    db: Session = Depends(get_db),
) -> AssistantFavoriteGroupAssignmentResponse:
    owner = require_active_auth_code(db, payload.auth_code)
    favorite = (
        db.query(AssistantFavorite)
        .filter(
            AssistantFavorite.auth_code == owner.code,
            AssistantFavorite.assistant_id == assistant_id,
        )
        .first()
    )
    if not favorite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="尚未收藏该助手",
        )

    target_group = None
    if payload.group_id is not None:
        target_group = ensure_favorite_group_owned(db, payload.group_id, owner.code)
        favorite.group_id = target_group.id
    else:
        favorite.group_id = None

    db.commit()
    return AssistantFavoriteGroupAssignmentResponse(
        assistant_id=assistant_id,
        favorite_group_id=target_group.id if target_group else None,
        favorite_group_name=target_group.name if target_group else None,
    )


@router.get("/{assistant_id}/comments", response_model=AssistantCommentListResponse)
def list_assistant_comments(
    assistant_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(
        COMMENTS_DEFAULT_PAGE_SIZE,
        ge=1,
        le=COMMENTS_MAX_PAGE_SIZE,
    ),
    auth_code: Optional[str] = Query(None, max_length=100),
    db: Session = Depends(get_db),
) -> AssistantCommentListResponse:
    assistant = ensure_commentable_assistant(db, assistant_id)
    viewer_code: Optional[str] = None
    if auth_code:
        viewer = require_active_auth_code(db, auth_code)
        viewer_code = viewer.code

    query = (
        db.query(AssistantComment)
        .options(selectinload(AssistantComment.author))
        .filter(AssistantComment.assistant_id == assistant.id)
        .order_by(AssistantComment.created_at.desc())
    )

    total = query.count()
    rows = (
        query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    liked_comment_ids: Set[int] = set()
    if viewer_code and rows:
        comment_ids = [comment.id for comment in rows]
        if comment_ids:
            liked_comment_ids = {
                comment_id
                for (comment_id,) in (
                    db.query(AssistantCommentLike.comment_id)
                    .filter(
                        AssistantCommentLike.comment_id.in_(comment_ids),
                        AssistantCommentLike.auth_code == viewer_code,
                    )
                    .all()
                )
            }

    items = [serialize_comment(comment, liked_comment_ids, viewer_code) for comment in rows]
    return AssistantCommentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/{assistant_id}/comments",
    response_model=AssistantCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_assistant_comment(
    assistant_id: int,
    payload: AssistantCommentCreateRequest,
    db: Session = Depends(get_db),
) -> AssistantCommentResponse:
    assistant = ensure_commentable_assistant(db, assistant_id)
    author = require_active_auth_code(db, payload.auth_code)
    content = sanitize_comment_content(payload.content)

    comment = AssistantComment(
        assistant_id=assistant.id,
        auth_code=author.code,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    comment.author = author
    return serialize_comment(comment, viewer_code=author.code)


@router.delete("/{assistant_id}/comments/{comment_id}")
def delete_assistant_comment(
    assistant_id: int,
    comment_id: int,
    auth_code: str = Query(..., max_length=100),
    db: Session = Depends(get_db),
) -> Dict[str, bool]:
    assistant = ensure_commentable_assistant(db, assistant_id)
    owner = require_active_auth_code(db, auth_code)
    comment = (
        db.query(AssistantComment)
        .filter(
            AssistantComment.id == comment_id,
            AssistantComment.assistant_id == assistant.id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="评论不存在",
        )
    if comment.auth_code != owner.code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅评论发布者可删除",
        )

    db.delete(comment)
    db.commit()
    return {"success": True}


@router.post(
    "/{assistant_id}/comments/{comment_id}/like",
    response_model=AssistantCommentLikeToggleResponse,
)
def toggle_assistant_comment_like(
    assistant_id: int,
    comment_id: int,
    payload: AssistantCommentLikeToggleRequest,
    db: Session = Depends(get_db),
) -> AssistantCommentLikeToggleResponse:
    assistant = ensure_commentable_assistant(db, assistant_id)
    voter = require_active_auth_code(db, payload.auth_code)
    comment = (
        db.query(AssistantComment)
        .filter(
            AssistantComment.id == comment_id,
            AssistantComment.assistant_id == assistant.id,
        )
        .first()
    )
    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="评论不存在",
        )

    existing_like = (
        db.query(AssistantCommentLike)
        .filter(
            AssistantCommentLike.comment_id == comment.id,
            AssistantCommentLike.auth_code == voter.code,
        )
        .first()
    )

    liked = False
    if existing_like:
        db.delete(existing_like)
        comment.like_count = max((comment.like_count or 0) - 1, 0)
    else:
        db.add(AssistantCommentLike(comment_id=comment.id, auth_code=voter.code))
        comment.like_count = (comment.like_count or 0) + 1
        liked = True

    db.commit()
    db.refresh(comment)
    return AssistantCommentLikeToggleResponse(
        comment_id=comment.id,
        like_count=comment.like_count or 0,
        liked=liked,
    )


@router.post("/definition/optimize", response_model=AssistantDefinitionOptimizeResponse)
def optimize_assistant_definition(
    payload: AssistantDefinitionOptimizeRequest,
    db: Session = Depends(get_db),
) -> AssistantDefinitionOptimizeResponse:
    require_active_auth_code(db, payload.auth_code)
    definition = sanitize_required_text(payload.definition, "助手定义")
    model_name = sanitize_required_text(payload.model_name, "助手大脑模型")

    model = (
        db.query(ModelDefinition)
        .filter(
            ModelDefinition.name == model_name,
            ModelDefinition.status == "active",
            ModelDefinition.model_type == "chat",
        )
        .first()
    )
    if not model:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="助手大脑模型无效或未启用",
        )

    system_agent = (
        db.query(SystemAgent)
        .filter(
            SystemAgent.id == ASSISTANT_OPTIMIZER_AGENT_ID,
            SystemAgent.is_active.is_(True),
        )
        .first()
    )
    if not system_agent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="系统提示词未配置，请联系管理员",
        )

    try:
        ai_tool = AiHubMixTool().init("int_serv").init_client(type="openai")
        response = ai_tool.chat(
            model=model_name,
            system_user_role_prompt=system_agent.system_prompt,
            user_prompt=definition,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"助手定义优化失败：{exc}",
        ) from exc

    if not isinstance(response, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 服务响应异常",
        )

    if not response.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(response.get("data") or "AI 服务返回失败"),
        )

    optimized_definition = extract_text_from_ai_payload(response.get("data")).strip()
    if not optimized_definition:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI 服务未返回内容",
        )

    return AssistantDefinitionOptimizeResponse(optimized_definition=optimized_definition)


@router.post("/covers/upload", response_model=AssistantCoverUploadResponse)
async def upload_assistant_cover(
    auth_code: str = Form(..., description="授权码"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> AssistantCoverUploadResponse:
    owner = require_active_auth_code(db, auth_code)
    if not file:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请选择要上传的文件")

    if not file.content_type or not file.content_type.lower().startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="仅支持图片类型作为封面",
        )

    contents = await file.read()
    object_key = generate_cover_object_key(owner.code, file.filename)
    upload_cover_to_cos(contents, object_key, file.filename or object_key, file.content_type)

    return AssistantCoverUploadResponse(
        file_name=object_key,
        url=build_cover_url(object_key) or "",
    )

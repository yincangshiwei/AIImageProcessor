import {
  GenerateRequest,
  GenerateResponse,
  GenerationRecord,
  AuthResponse,
  UploadedFile,
  AssistantMarketplaceResponse,
  AssistantQueryParams,
  AssistantProfile,
  AssistantReviewStatus,
  AssistantPaginatedSection,
  AssistantUpsertPayload,
  AssistantVisibility,
  AssistantVisibilityFilter,
  AssistantVisibilityUpdatePayload,
  AssistantDefinitionOptimizePayload,
  AssistantDefinitionOptimizeResult,
  AssistantCategorySummary,
  AssistantModelDefinition,
  AssistantCoverUploadResult,
  AssistantComment,
  AssistantCommentList,
  AuthCodeProfileUpdatePayload,
  FavoriteGroup
} from '../types'
import { sanitizeLogData, SECURITY_CONFIG } from '../config/security'
import { resolveCoverUrl, isAbsoluteUrl } from '../config/storage'
import { maskAuthCode } from '../utils/authUtils'
import { getDefaultModelOptions } from './modelCapabilities'

// API配置 - 根据环境自动选择
const getApiBase = () => {
  // 如果是开发环境或localhost，使用本地API
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000'
  }
  // 生产环境使用mock模式
  return 'mock'
}

const API_BASE = getApiBase()

const MOCK_CREATOR_TEAMS: Record<number, {
  id: number
  name: string
  displayName: string
  description: string
  credits: number
}> = {
  1: {
    id: 1,
    name: 'aurora-lab',
    displayName: 'Aurora 联合工作室',
    description: '专注时尚视觉与品牌叙事的多学科团队',
    credits: 3200
  },
  2: {
    id: 2,
    name: 'wild-vision',
    displayName: '野生视觉工坊',
    description: '强调实验质感与空间叙事的创作小组',
    credits: 1800
  },
  3: {
    id: 3,
    name: 'starsea-alliance',
    displayName: '星海联盟',
    description: '跨城市的商业导演社群，负责大型 Campaign',
    credits: 4500
  }
}

// Mock数据
const MOCK_AUTH_CODES = {
  'DEMO2025': {
    code: 'DEMO2025',
    credits: 1000,
    status: 'active',
    expire_time: '2026-08-27',
    description: '演示专用授权码，包含基础创作额度',
    contact_name: '演示用户',
    creator_name: 'Demo Studio',
    phone_number: '+86-13800000000',
    ip_whitelist: ['127.0.0.1'],
    allowed_models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-02-01T00:00:00Z',
    team_id: 1,
    team_role: 'admin'
  },
  'TEST001': {
    code: 'TEST001',
    credits: 500,
    status: 'active',
    expire_time: null,
    description: '测试环境授权码，适合本地联调',
    contact_name: '测试账号',
    creator_name: 'Test Collective',
    phone_number: '+86-13900000000',
    ip_whitelist: ['127.0.0.1', '192.168.0.0/16'],
    allowed_models: ['gemini-3-pro-image-preview'],
    created_at: '2025-01-05T00:00:00Z',
    updated_at: '2025-02-02T00:00:00Z',
    team_id: 2,
    team_role: 'member'
  },
  'VIP2025': {
    code: 'VIP2025',
    credits: 5000,
    status: 'active',
    expire_time: '2025-11-25',
    description: '高阶创作者专用授权码，包含更高额度',
    contact_name: 'VIP 创作者',
    creator_name: 'Aurora Studio',
    phone_number: '+86-18800000000',
    ip_whitelist: [],
    allowed_models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image', 'gemini-1.5-pro'],
    created_at: '2025-01-03T00:00:00Z',
    updated_at: '2025-02-03T00:00:00Z',
    team_id: 3,
    team_role: 'admin'
  }
}

const attachMockTeamPayload = (record: any) => {
  if (!record) {
    return record
  }
  const teamId = record.team_id ?? null
  const team = teamId ? MOCK_CREATOR_TEAMS[teamId] : null
  const teamCredits = team?.credits ?? 0

  return {
    ...record,
    team_name: team?.name ?? null,
    team_display_name: team?.displayName ?? team?.name ?? null,
    team_description: team?.description ?? null,
    team_credits: teamCredits,
    available_credits: (record.credits ?? 0) + teamCredits
  }
}

const DEFAULT_ASSISTANT_PAGE_SIZE = 6
const DEFAULT_COMMENT_PAGE_SIZE = 10

type MockAssistantProfile = Omit<
  AssistantProfile,
  'categoryIds' | 'isFavorited' | 'favoriteGroupId' | 'favoriteGroupName'
> & {
  categoryIds?: number[]
  isFavorited?: boolean
  favoriteGroupId?: number | null
  favoriteGroupName?: string | null
  reviewStatus?: AssistantReviewStatus
}

const mockCategoryRegistry = new Map<string, { id: number; slug: string }>()
const mockCategoryMetaById = new Map<number, { name: string; slug: string }>()
let mockCategorySequence = 1
const mockFavoriteGroupsByAuthCode = new Map<string, FavoriteGroup[]>()
let mockFavoriteGroupSequence = 1

interface MockAssistantComment {
  id: number
  assistantId: number
  authCode: string
  content: string
  likedAuthCodes: Set<string>
  createdAt: string
  updatedAt: string
}

const mockCommentsByAssistant = new Map<number, MockAssistantComment[]>()
let mockCommentSequence = 1

const slugifyCategoryName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const ensureMockCategoryId = (name: string): number => {
  const trimmed = name?.trim()
  if (!trimmed) {
    return 0
  }
  const existing = mockCategoryRegistry.get(trimmed)
  if (existing) {
    mockCategoryMetaById.set(existing.id, { name: trimmed, slug: existing.slug })
    return existing.id
  }
  const record = {
    id: mockCategorySequence++,
    slug: slugifyCategoryName(trimmed) || `category-${mockCategorySequence}`
  }
  mockCategoryRegistry.set(trimmed, record)
  mockCategoryMetaById.set(record.id, { name: trimmed, slug: record.slug })
  return record.id
}

const seedMockCategoryRegistry = () => {
  MOCK_ASSISTANT_CATEGORIES.forEach((category) => ensureMockCategoryId(category))
}

const MOCK_ASSISTANT_CATEGORIES = [
  '概念设计',
  '空间视觉',
  '商业短片',
  '时尚视觉',
  '品牌主理人',
  '未来科幻',
  '互动体验',
  '舞台视觉',
  '装置艺术',
  '视觉特效',
  '潮流主理',
  '城市地景',
  '品牌叙事',
  '情绪人像',
  '建筑推演',
  '材质实验',
  '音乐可视化',
  '沉浸体验'
]

seedMockCategoryRegistry()

const getMockCategoryNamesByIds = (ids: number[]): string[] =>
  ids
    .map((id) => mockCategoryMetaById.get(id)?.name)
    .filter((name): name is string => Boolean(name))

const MOCK_ASSISTANTS: Record<'official' | 'custom', MockAssistantProfile[]> = {
  official: [
    {
      id: 1,
      name: '霓虹分镜导演',
      slug: 'neon-director',
      definition: '围绕剧情提示快速生成电影级镜头与光影布局。',
      description: '擅长赛博朋克、霓虹灯光、宏大场景，自动匹配镜头切换节奏。',
      coverUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '概念设计',
      secondaryCategory: '影视分镜',
      categories: ['概念设计', '未来科幻'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#60a5fa',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-10T08:00:00Z',
      updatedAt: '2025-01-18T08:00:00Z'
    },
    {
      id: 2,
      name: '织梦时装总监',
      slug: 'couture-dreamer',
      definition: '一键生成高级定制时装大片，提供姿势、灯光与材质指引。',
      description: '融合未来材质与东方廓形，可切换静帧或动态走秀风格。',
      coverUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '时尚视觉',
      secondaryCategory: '商业短片',
      categories: ['时尚视觉', '商业短片'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#f472b6',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-05T08:00:00Z',
      updatedAt: '2025-02-01T08:00:00Z'
    },
    {
      id: 3,
      name: '星港叙事设计院',
      slug: 'starsea-lab',
      definition: '专注未来城市、工业概念与品牌视觉故事，支持多模型协同。',
      description: '将空间结构、材质记忆和品牌口吻融为一体，适合大型装置提案。',
      coverUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '空间视觉',
      secondaryCategory: '品牌主理人',
      categories: ['空间视觉', '品牌主理人'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#34d399',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2024-12-12T08:00:00Z',
      updatedAt: '2025-01-20T08:00:00Z'
    },
    {
      id: 4,
      name: '极昼空间编导',
      slug: 'polar-dawn-director',
      definition: 'AI辅助的沉浸式空间叙事导演，擅长光影流动与层级镜头。',
      description: '预设多维空间结构与动态灯光，输出可直接装置化的视觉脚本。',
      coverUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '空间视觉',
      secondaryCategory: '装置艺术',
      categories: ['空间视觉', '装置艺术', '互动体验'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#0ea5e9',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-12T09:00:00Z',
      updatedAt: '2025-02-02T09:00:00Z'
    },
    {
      id: 5,
      name: '雾岛潮流造梦局',
      slug: 'mist-island-maker',
      definition: '集合潮流文化资产的视觉策展助手，自动生成lookbook与场景设定。',
      description: '提供姿态排布、材质搭配与氛围灯组建议，适配快闪展与商业大片。',
      coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '潮流主理',
      secondaryCategory: '时尚视觉',
      categories: ['潮流主理', '时尚视觉', '品牌主理人'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#f59e0b',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-14T09:30:00Z',
      updatedAt: '2025-02-05T09:30:00Z'
    },
    {
      id: 6,
      name: '流明商业剧场',
      slug: 'lumen-commerce-stage',
      definition: '专注商业短片节奏与镜位排布，快速生成多机位脚本。',
      description: '自动匹配镜头语言与品牌语气，可导出逐镜故事板与调色建议。',
      coverUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '商业短片',
      secondaryCategory: '舞台视觉',
      categories: ['商业短片', '舞台视觉', '品牌叙事'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#eab308',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2024-12-28T07:00:00Z',
      updatedAt: '2025-02-03T07:00:00Z'
    },
    {
      id: 7,
      name: '星穹感知研究所',
      slug: 'stellar-sense-lab',
      definition: '面向未来科幻与交互体验的概念推演助手。',
      description: '通过多模态Prompt组合构建感官叙事线，可生成交互流程与空间节点示意。',
      coverUrl: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '未来科幻',
      secondaryCategory: '互动体验',
      categories: ['未来科幻', '互动体验', '空间视觉'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#10b981',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2024-12-20T10:00:00Z',
      updatedAt: '2025-01-25T10:00:00Z'
    },
    {
      id: 8,
      name: '幻日叙事中枢',
      slug: 'halo-narrative-core',
      definition: '品牌叙事策略助手，自动生成情绪板与脚本分层。',
      description: '聚合品牌语气、受众画像与传播渠道，输出节奏化的内容矩阵。',
      coverUrl: 'https://images.unsplash.com/photo-1470229538611-16ba8c7ffbd7?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '品牌叙事',
      secondaryCategory: '品牌主理人',
      categories: ['品牌叙事', '商业短片', '品牌主理人'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#c084fc',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-02T12:00:00Z',
      updatedAt: '2025-02-06T12:00:00Z'
    },
    {
      id: 9,
      name: '曜石机能影坊',
      slug: 'obsidian-motion-studio',
      definition: '专注视觉特效与机能风影像的调校助手。',
      description: '生成特效层、材质烘焙与动态光晕建议，匹配机能时尚语境。',
      coverUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '视觉特效',
      secondaryCategory: '未来科幻',
      categories: ['视觉特效', '未来科幻', '商业短片'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#6366f1',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2024-11-30T11:00:00Z',
      updatedAt: '2025-01-28T11:00:00Z'
    },
    {
      id: 10,
      name: '浮岛体验制作组',
      slug: 'levitating-experience-lab',
      definition: '沉浸体验导览设计助手，为展览与快闪空间提供故事线。',
      description: '自动生成路线指引、互动节点与动态音景，输出整套体验手册。',
      coverUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '互动体验',
      secondaryCategory: '沉浸体验',
      categories: ['互动体验', '沉浸体验', '空间视觉'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#06b6d4',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2024-12-05T08:30:00Z',
      updatedAt: '2025-02-04T08:30:00Z'
    },
    {
      id: 11,
      name: '霜蓝建筑推演所',
      slug: 'frost-architect-lab',
      definition: '建筑推演与材料测试助手，快速输出差异化结构草图。',
      description: '结合气候、材质与结构逻辑，生成多方案空间草图与推演动图。',
      coverUrl: 'https://images.unsplash.com/photo-1503389152951-9f343605f61c?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '建筑推演',
      secondaryCategory: '空间视觉',
      categories: ['建筑推演', '空间视觉', '概念设计'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#38bdf8',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2024-12-15T06:45:00Z',
      updatedAt: '2025-01-30T06:45:00Z'
    },
    {
      id: 12,
      name: '暮光色彩司库',
      slug: 'dusk-chroma-atelier',
      definition: '色彩叙事与材质实验的灵感仓库助手。',
      description: '根据品牌调性生成夕阳、霓虹及金属等多段色彩方案。',
      coverUrl: 'https://images.unsplash.com/photo-1470246973918-29a93221c455?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '概念设计',
      secondaryCategory: '材质实验',
      categories: ['概念设计', '材质实验', '品牌叙事'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#fb7185',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-09T05:30:00Z',
      updatedAt: '2025-02-07T05:30:00Z'
    },
    {
      id: 13,
      name: '信标品牌战略塔',
      slug: 'beacon-brand-tower',
      definition: '品牌战略驱动的视觉资产统筹助手。',
      description: '提供全年Campaign节奏、视觉资产清单与测算指标建议。',
      coverUrl: 'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '品牌主理人',
      secondaryCategory: '城市地景',
      categories: ['品牌主理人', '品牌叙事', '城市地景'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#facc15',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-07T07:15:00Z',
      updatedAt: '2025-02-08T07:15:00Z'
    }
  ],
  custom: [
    {
      id: 101,
      name: '野生视觉工作坊',
      slug: 'wild-vision-studio',
      definition: '结合真实素材二次创作，适合独立摄影师快速延展灵感。',
      description: '支持上传参考人物与场景，智能保持风格一致性。',
      coverUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '品牌主理人',
      secondaryCategory: '概念设计',
      categories: ['品牌主理人', '概念设计'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#38bdf8',
      type: 'custom',
      ownerCode: 'DEMO2025',
      visibility: 'private',
      status: 'active',
      createdAt: '2025-02-02T08:00:00Z',
      updatedAt: '2025-02-05T08:00:00Z'
    },
    {
      id: 102,
      name: '一瞬剧场导演席',
      slug: 'moment-theatre',
      definition: '复刻微电影镜头语言，提供构图脚本、动作提示与光影策略。',
      description: '支持自动生成分镜脚注，并能输出动图预览。',
      coverUrl: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '商业短片',
      secondaryCategory: '未来科幻',
      categories: ['商业短片', '未来科幻'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#f97316',
      type: 'custom',
      ownerCode: 'VIP2025',
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-08T08:00:00Z',
      updatedAt: '2025-02-10T08:00:00Z'
    }
  ]
}

const ADDITIONAL_MOCK_ASSISTANTS: Record<'official' | 'custom', MockAssistantProfile[]> = {
  official: [
    {
      id: 14,
      name: '影脉场景引擎',
      slug: 'aether-stage-engine',
      definition: '自动编排沉浸式场景、光影与机位节奏的导演助手。',
      description: '提供实时光效模拟、舞台走位与镜头节奏建议，快速输出导演手册。',
      coverUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '舞台视觉',
      secondaryCategory: '互动体验',
      categories: ['舞台视觉', '互动体验', '商业短片'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#7dd3fc',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-10T09:00:00Z',
      updatedAt: '2025-02-11T09:30:00Z'
    },
    {
      id: 15,
      name: '月潮光感蓝图',
      slug: 'lunar-tide-blueprint',
      definition: '聚焦夜景与海岸氛围的光影蓝图生成器。',
      description: '适用于夜跑道、岸线与高层立面，输出高对比度光感方案。',
      coverUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '城市地景',
      secondaryCategory: '未来科幻',
      categories: ['城市地景', '未来科幻', '情绪人像'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#fef08a',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-09T13:00:00Z',
      updatedAt: '2025-02-11T04:00:00Z'
    },
    {
      id: 16,
      name: '火花叙事矩阵',
      slug: 'ember-story-matrix',
      definition: '品牌叙事与商业短片的脚本拆分引擎。',
      description: '自动分析情绪节点与CTA，导出节奏化镜头脚本。',
      coverUrl: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '品牌叙事',
      secondaryCategory: '商业短片',
      categories: ['品牌叙事', '商业短片', '品牌主理人'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#f97316',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-08T08:30:00Z',
      updatedAt: '2025-02-11T05:45:00Z'
    },
    {
      id: 17,
      name: '森域装置事务所',
      slug: 'forest-device-bureau',
      definition: '为自然主题展览生成装置脚本与结构草图。',
      description: '融合声场、气味与光影，输出可执行的沉浸式装置方案。',
      coverUrl: 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '空间视觉',
      secondaryCategory: '装置艺术',
      categories: ['空间视觉', '装置艺术', '自然构造'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#84cc16',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-07T10:00:00Z',
      updatedAt: '2025-02-10T11:00:00Z'
    },
    {
      id: 18,
      name: '量子皮肤织造者',
      slug: 'quantum-skin-weaver',
      definition: '面向高定材质的细节纹理与肌理放大助手。',
      description: '自动推演织物粒度、微光泽与实验材质混搭方式。',
      coverUrl: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '时尚视觉',
      secondaryCategory: '材质实验',
      categories: ['时尚视觉', '材质实验', '概念设计'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#a855f7',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-06T07:45:00Z',
      updatedAt: '2025-02-10T03:15:00Z'
    },
    {
      id: 19,
      name: '曦光交互工坊',
      slug: 'aurora-interface-lab',
      definition: '多感官交互体验的脚本合成助手。',
      description: '输出触摸、光影与声效的多轨交互时间线，并可导出工程表。',
      coverUrl: 'https://images.unsplash.com/photo-1482192597420-4817fdd7e8b0?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '互动体验',
      secondaryCategory: '沉浸体验',
      categories: ['互动体验', '沉浸体验', '音乐可视化'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#22d3ee',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-05T05:20:00Z',
      updatedAt: '2025-02-09T02:10:00Z'
    },
    {
      id: 20,
      name: '空港声像导演组',
      slug: 'aerohub-sonic-director',
      definition: '巡演与机场大屏声像一体的导演助手。',
      description: '自动匹配航站节奏、客流行为与声光脚本，适配多语种播报。',
      coverUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '舞台视觉',
      secondaryCategory: '音乐可视化',
      categories: ['舞台视觉', '音乐可视化', '商业短片'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#fde047',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-04T11:00:00Z',
      updatedAt: '2025-02-09T07:45:00Z'
    },
    {
      id: 21,
      name: '霁夜动效剧社',
      slug: 'crystal-night-motion',
      definition: '动效镜头与光绘交叠的视觉导演助手。',
      description: '输出夜景动效分层、光迹速度与粒子脚本，便于快速合成。',
      coverUrl: 'https://images.unsplash.com/photo-1505731132164-cca3d82d83d8?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '视觉特效',
      secondaryCategory: '未来科幻',
      categories: ['视觉特效', '未来科幻', '音乐可视化'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#818cf8',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-03T09:40:00Z',
      updatedAt: '2025-02-08T22:00:00Z'
    },
    {
      id: 22,
      name: '极光品牌调音室',
      slug: 'aurora-brand-tuner',
      definition: '品牌声像统一与调性色板生成助手。',
      description: '整合品牌语气、音频识别与视觉调色，输出一致的内容套件。',
      coverUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '品牌主理人',
      secondaryCategory: '品牌叙事',
      categories: ['品牌主理人', '品牌叙事', '音乐可视化'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#f9a8d4',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-02T08:15:00Z',
      updatedAt: '2025-02-08T11:10:00Z'
    },
    {
      id: 23,
      name: '灵弦城市光谱站',
      slug: 'lyra-urban-spectrum',
      definition: '城市地标光谱与色带基调的快速生成助手。',
      description: '根据城市属性推荐光谱曲线、材质反射率与镜面布局。',
      coverUrl: 'https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?auto=format&fit=crop&w=1200&q=80&sat=-35',
      coverType: 'image',
      primaryCategory: '城市地景',
      secondaryCategory: '概念设计',
      categories: ['城市地景', '概念设计', '品牌叙事'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#38bdf8',
      type: 'official',
      ownerCode: null,
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-01T05:00:00Z',
      updatedAt: '2025-02-07T06:25:00Z'
    }
  ],
  custom: [
    {
      id: 103,
      name: '墨序插画工作室',
      slug: 'ink-sequence-studio',
      definition: '结合手绘与AI延展的插画风格助手。',
      description: '可锁定笔刷纹理并批量生成系列插画，保护原始线稿。',
      coverUrl: 'https://images.unsplash.com/photo-1470104240373-bc1812eddc9f?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '概念设计',
      secondaryCategory: '情绪人像',
      categories: ['概念设计', '情绪人像'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#fb7185',
      type: 'custom',
      ownerCode: 'DEMO2025',
      visibility: 'private',
      status: 'active',
      createdAt: '2025-02-05T08:00:00Z',
      updatedAt: '2025-02-10T08:30:00Z'
    },
    {
      id: 104,
      name: '回声时装基因库',
      slug: 'echo-couture-vault',
      definition: '存储创作者时装风格DNA并快速复用。',
      description: '可按季节导出走秀故事线，适配公开展示。',
      coverUrl: 'https://images.unsplash.com/photo-1521572163421-5c8e1a66f228?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '时尚视觉',
      secondaryCategory: '潮流主理',
      categories: ['时尚视觉', '潮流主理'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#f472b6',
      type: 'custom',
      ownerCode: 'VIP2025',
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-04T09:00:00Z',
      updatedAt: '2025-02-09T10:15:00Z'
    },
    {
      id: 105,
      name: '折光空间手册',
      slug: 'refraction-space-manual',
      definition: '聚焦玻璃、金属等折射材质的空间脚本助手。',
      description: '可将实景参数和模型结合，输出沉浸式空间手册。',
      coverUrl: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6a?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '空间视觉',
      secondaryCategory: '装置艺术',
      categories: ['空间视觉', '装置艺术', '沉浸体验'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#67e8f9',
      type: 'custom',
      ownerCode: 'TEST001',
      visibility: 'private',
      status: 'active',
      createdAt: '2025-02-03T11:45:00Z',
      updatedAt: '2025-02-08T06:40:00Z'
    },
    {
      id: 106,
      name: '霁云舞台写作社',
      slug: 'serene-stage-script',
      definition: '帮助舞台导演快速输出cue表与旁白脚本。',
      description: '可与灯光、舞美数据联动，适配公开演出。',
      coverUrl: 'https://images.unsplash.com/photo-1469478715127-42292d9427b2?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '舞台视觉',
      secondaryCategory: '品牌叙事',
      categories: ['舞台视觉', '品牌叙事'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#c084fc',
      type: 'custom',
      ownerCode: 'DEMO2025',
      visibility: 'public',
      status: 'active',
      createdAt: '2025-02-02T10:20:00Z',
      updatedAt: '2025-02-07T12:10:00Z'
    },
    {
      id: 107,
      name: '星尘音乐视觉',
      slug: 'stardust-music-visuals',
      definition: '绑定音乐节拍生成VJ视觉与灯光脚本。',
      description: '可输出实时音频反应模板，保障私有素材安全。',
      coverUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80&sat=-35',
      coverType: 'image',
      primaryCategory: '音乐可视化',
      secondaryCategory: '未来科幻',
      categories: ['音乐可视化', '未来科幻', '视觉特效'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#22d3ee',
      type: 'custom',
      ownerCode: 'VIP2025',
      visibility: 'private',
      status: 'active',
      createdAt: '2025-02-01T08:10:00Z',
      updatedAt: '2025-02-06T09:20:00Z'
    },
    {
      id: 108,
      name: '浪潮品牌策动所',
      slug: 'surge-brand-lab',
      definition: '聚焦节点营销的品牌节奏管理助手。',
      description: '公开共享年度Campaign路线，适配多渠道投放。',
      coverUrl: 'https://images.unsplash.com/photo-1471070855862-329e50a1e6b1?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '品牌主理人',
      secondaryCategory: '商业短片',
      categories: ['品牌主理人', '商业短片', '品牌叙事'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#fbbf24',
      type: 'custom',
      ownerCode: 'VIP2025',
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-31T06:00:00Z',
      updatedAt: '2025-02-05T08:30:00Z'
    },
    {
      id: 109,
      name: '南弦互动小组',
      slug: 'southstring-interactive',
      definition: '针对疗愈系互动体验的故事脚本助手。',
      description: '保存私有互动素材，并输出多感官路径设计。',
      coverUrl: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '互动体验',
      secondaryCategory: '沉浸体验',
      categories: ['互动体验', '沉浸体验', '未来科幻'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#34d399',
      type: 'custom',
      ownerCode: 'TEST001',
      visibility: 'private',
      status: 'active',
      createdAt: '2025-01-30T11:35:00Z',
      updatedAt: '2025-02-04T07:25:00Z'
    },
    {
      id: 110,
      name: '玻璃体光绘局',
      slug: 'glassframe-light-dept',
      definition: '专注玻璃幕墙与光绘摄影的创作助手。',
      description: '公开输出部分光绘路径，保留私有RAW文件。',
      coverUrl: 'https://images.unsplash.com/photo-1496307042754-b4aa456c4a2d?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '视觉特效',
      secondaryCategory: '潮流主理',
      categories: ['视觉特效', '潮流主理', '城市地景'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#60a5fa',
      type: 'custom',
      ownerCode: 'DEMO2025',
      visibility: 'public',
      status: 'active',
      createdAt: '2025-01-29T09:15:00Z',
      updatedAt: '2025-02-03T10:45:00Z'
    },
    {
      id: 111,
      name: '潮景素材银行',
      slug: 'tidescape-asset-bank',
      definition: '聚合海岸、潮汐与雾景素材的私有资产库。',
      description: '批量管理素材版权，并按项目输出精选合集。',
      coverUrl: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '品牌主理人',
      secondaryCategory: '素材资产',
      categories: ['品牌主理人', '素材资产', '城市地景'],
      models: ['gemini-3-pro-image-preview'],
      supportsImage: true,
      supportsVideo: false,
      accentColor: '#0ea5e9',
      type: 'custom',
      ownerCode: 'TEST001',
      visibility: 'private',
      status: 'active',
      createdAt: '2025-01-28T07:50:00Z',
      updatedAt: '2025-02-02T08:20:00Z'
    },
    {
      id: 112,
      name: '夜航影调方案库',
      slug: 'noctilux-grade-bay',
      definition: '夜景影片的调色与颗粒质感配方库。',
      description: '储存个人LookUp文件并可一键套用于短片项目。',
      coverUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?auto=format&fit=crop&w=1200&q=80',
      coverType: 'image',
      primaryCategory: '商业短片',
      secondaryCategory: '情绪人像',
      categories: ['商业短片', '情绪人像', '视觉特效'],
      models: ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'],
      supportsImage: true,
      supportsVideo: true,
      accentColor: '#f472b6',
      type: 'custom',
      ownerCode: 'VIP2025',
      visibility: 'private',
      status: 'active',
      createdAt: '2025-01-27T06:25:00Z',
      updatedAt: '2025-02-01T09:55:00Z'
    }
  ]
}

ADDITIONAL_MOCK_ASSISTANTS.official.forEach((assistant) => MOCK_ASSISTANTS.official.push(assistant))
ADDITIONAL_MOCK_ASSISTANTS.custom.forEach((assistant) => MOCK_ASSISTANTS.custom.push(assistant))

Object.values(MOCK_ASSISTANTS).forEach((collection) => {
  collection.forEach((assistant) => {
    if (assistant.isFavorited === undefined) {
      assistant.isFavorited = false
    }
  })
})

const syncMockAssistantCategories = () => {
  const allAssistants = [...MOCK_ASSISTANTS.official, ...MOCK_ASSISTANTS.custom]
  allAssistants.forEach((assistant) => {
    const categoryNames = assistant.categories ?? []
    assistant.categoryIds = (assistant.categoryIds ?? categoryNames.map((name) => ensureMockCategoryId(name))).filter(
      (id) => id > 0
    )
  })
}

syncMockAssistantCategories()

const getAllMockAssistants = () => [...MOCK_ASSISTANTS.official, ...MOCK_ASSISTANTS.custom]

const getMockAssistantById = (assistantId: number) => getAllMockAssistants().find((assistant) => assistant.id === assistantId)

const isMockAssistantCommentable = (assistant?: MockAssistantProfile) => {
  if (!assistant) {
    return false
  }
  return assistant.type === 'official' || assistant.visibility === 'public'
}

const ensureMockCommentableAssistant = (assistantId: number) => {
  const assistant = getMockAssistantById(assistantId)
  if (!assistant) {
    throw new Error('助手不存在')
  }
  if (!isMockAssistantCommentable(assistant)) {
    throw new Error('仅官方或公开助手支持评论')
  }
  return assistant
}

const ensureMockFavoriteGroups = (authCode: string): FavoriteGroup[] => {
  if (!mockFavoriteGroupsByAuthCode.has(authCode)) {
    mockFavoriteGroupsByAuthCode.set(authCode, [])
  }
  return mockFavoriteGroupsByAuthCode.get(authCode) as FavoriteGroup[]
}

const ensureMockCommentBucket = (assistantId: number): MockAssistantComment[] => {
  if (!mockCommentsByAssistant.has(assistantId)) {
    mockCommentsByAssistant.set(assistantId, [])
  }
  return mockCommentsByAssistant.get(assistantId) as MockAssistantComment[]
}

const getMockFavoriteGroupById = (authCode: string, groupId: number) => {
  return ensureMockFavoriteGroups(authCode).find((group) => group.id === groupId)
}

const computeMockFavoriteGroupCounts = (authCode: string): FavoriteGroup[] => {
  const groups = ensureMockFavoriteGroups(authCode)
  const allAssistants = getAllMockAssistants()
  return groups.map((group) => {
    const assistantCount = allAssistants.filter(
      (assistant) => assistant.isFavorited && assistant.favoriteGroupId === group.id
    ).length
    group.assistantCount = assistantCount
    return { ...group }
  })
}

const assignMockAssistantGroup = (
  assistantId: number,
  group: FavoriteGroup | null
): { favoriteGroupId: number | null; favoriteGroupName: string | null } => {
  const target = getAllMockAssistants().find((assistant) => assistant.id === assistantId)
  if (!target) {
    throw new Error('助手不存在')
  }
  target.favoriteGroupId = group?.id ?? null
  target.favoriteGroupName = group?.name ?? null
  return {
    favoriteGroupId: target.favoriteGroupId ?? null,
    favoriteGroupName: target.favoriteGroupName ?? null
  }
}

const clearMockGroupReference = (authCode: string, groupId: number) => {
  getAllMockAssistants().forEach((assistant) => {
    if (assistant.favoriteGroupId === groupId && assistant.isFavorited) {
      assistant.favoriteGroupId = null
      assistant.favoriteGroupName = null
    }
  })
  const groups = ensureMockFavoriteGroups(authCode)
  const target = groups.find((group) => group.id === groupId)
  if (target) {
    target.assistantCount = 0
  }
}

const normalizeFavoriteGroup = (group: any): FavoriteGroup => ({
  id: group.id,
  name: group.name,
  assistantCount: group.assistant_count ?? group.assistantCount ?? 0,
  createdAt: group.created_at ?? group.createdAt ?? new Date().toISOString(),
  updatedAt: group.updated_at ?? group.updatedAt ?? new Date().toISOString()
})

const getMockCreatorName = (ownerCode?: string | null) => {
  if (!ownerCode) {
    return null
  }
  const record = MOCK_AUTH_CODES[ownerCode as keyof typeof MOCK_AUTH_CODES]
  if (!record) {
    return null
  }
  return (record.creator_name ?? record.creatorName ?? record.contact_name ?? record.contactName ?? '').trim() || null
}

const normalizeOwnerDisplayName = (assistant: any, ownerCode: string | null): string | null => {
  const provided = assistant.owner_display_name ?? assistant.ownerDisplayName
  if (typeof provided === 'string') {
    const trimmed = provided.trim()
    if (trimmed) {
      return trimmed
    }
  }
  if (!ownerCode) {
    return assistant.type === 'official' ? '官方平台' : '未定义'
  }
  return getMockCreatorName(ownerCode) ?? '未定义'
}

const normalizeOwnerMaskedCode = (assistant: any, ownerCode: string | null): string | null => {
  const provided = assistant.owner_code_masked ?? assistant.ownerCodeMasked
  if (typeof provided === 'string') {
    const trimmed = provided.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return ownerCode ? maskAuthCode(ownerCode) : null
}

const normalizeAssistantProfile = (assistant: any): AssistantProfile => {
  const ownerCode = assistant.owner_code ?? assistant.ownerCode ?? null
  const ownerDisplayName = normalizeOwnerDisplayName(assistant, ownerCode)
  const ownerCodeMasked = normalizeOwnerMaskedCode(assistant, ownerCode)
  const rawCoverUrl = assistant.cover_url ?? assistant.coverUrl ?? ''
  const resolvedCoverUrl = rawCoverUrl
    ? isAbsoluteUrl(rawCoverUrl)
      ? rawCoverUrl
      : resolveCoverUrl(rawCoverUrl)
    : ''

  return {
    id: assistant.id,
    name: assistant.name,
    slug: assistant.slug,
    definition: assistant.definition,
    description: assistant.description ?? undefined,
    coverUrl: resolvedCoverUrl,
    coverStoragePath: assistant.cover_storage_path ?? assistant.coverStoragePath ?? null,
    coverType: assistant.cover_type ?? assistant.coverType ?? 'image',
    primaryCategory: assistant.primary_category ?? assistant.primaryCategory ?? undefined,
    secondaryCategory: assistant.secondary_category ?? assistant.secondaryCategory ?? undefined,
    categories: assistant.categories ?? [],
    categoryIds: assistant.category_ids ?? assistant.categoryIds ?? [],
    models: assistant.models ?? [],
    supportsImage: assistant.supports_image ?? assistant.supportsImage ?? true,
    supportsVideo: assistant.supports_video ?? assistant.supportsVideo ?? false,
    accentColor: assistant.accent_color ?? assistant.accentColor ?? null,
    type: assistant.type ?? 'official',
    ownerCode,
    ownerDisplayName: ownerDisplayName ?? undefined,
    ownerCodeMasked: ownerCodeMasked ?? undefined,
    visibility: assistant.visibility ?? assistant.visibility ?? 'public',
    reviewStatus: (assistant.review_status ?? assistant.reviewStatus ?? 'approved') as AssistantReviewStatus,
    isFavorited: Boolean(assistant.is_favorited ?? assistant.isFavorited ?? false),
    favoriteGroupId: assistant.favorite_group_id ?? assistant.favoriteGroupId ?? null,
    favoriteGroupName: assistant.favorite_group_name ?? assistant.favoriteGroupName ?? null,
    status: assistant.status ?? 'active',
    createdAt: assistant.created_at ?? assistant.createdAt ?? new Date().toISOString(),
    updatedAt: assistant.updated_at ?? assistant.updatedAt ?? new Date().toISOString()
  }
}

const normalizeAssistantSection = (
  section: any,
  fallbackPage: number,
  fallbackPageSize: number
): AssistantPaginatedSection => {
  const items = Array.isArray(section?.items) ? section.items.map(normalizeAssistantProfile) : []
  const total = typeof section?.total === 'number' ? section.total : items.length
  const page = section?.page ?? section?.page_number ?? fallbackPage
  const pageSize = section?.pageSize ?? section?.page_size ?? fallbackPageSize

  return {
    items,
    total,
    page,
    pageSize
  }
}

const normalizeAssistantCommentResponse = (comment: any): AssistantComment => {
  const assistantId = comment.assistant_id ?? comment.assistantId ?? 0
  const rawCode = comment.auth_code ?? comment.authCode ?? ''
  return {
    id: comment.id,
    assistantId,
    content: comment.content ?? '',
    likeCount: comment.like_count ?? comment.likeCount ?? 0,
    createdAt: comment.created_at ?? comment.createdAt ?? new Date().toISOString(),
    updatedAt: comment.updated_at ?? comment.updatedAt ?? new Date().toISOString(),
    authorDisplayName: comment.author_display_name ?? comment.authorDisplayName ?? '创作者',
    authorCodeMasked: comment.author_code_masked ?? comment.authorCodeMasked ?? maskAuthCode(rawCode),
    canDelete: Boolean(comment.can_delete ?? comment.canDelete ?? false),
    likedByViewer: Boolean(comment.liked_by_viewer ?? comment.likedByViewer ?? false)
  }
}

const normalizeMockAssistantComment = (
  comment: MockAssistantComment,
  viewerCode?: string | null
): AssistantComment => {
  const displayName = getMockCreatorName(comment.authCode) ?? '创作者'
  return {
    id: comment.id,
    assistantId: comment.assistantId,
    content: comment.content,
    likeCount: comment.likedAuthCodes.size,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    authorDisplayName: displayName,
    authorCodeMasked: maskAuthCode(comment.authCode),
    canDelete: Boolean(viewerCode && viewerCode === comment.authCode),
    likedByViewer: Boolean(viewerCode && comment.likedAuthCodes.has(viewerCode))
  }
}

const paginateAssistantList = (
  assistants: AssistantProfile[],
  page: number,
  pageSize: number
): AssistantPaginatedSection => {
  const start = (page - 1) * pageSize
  return {
    items: assistants.slice(start, start + pageSize),
    total: assistants.length,
    page,
    pageSize
  }
}

const getMockCategories = (includeEmpty = false): AssistantCategorySummary[] => {
  const counts = new Map<number, number>()
  const tally = (assistant: MockAssistantProfile) => {
    const ids = assistant.categoryIds ?? []
    new Set(ids).forEach((id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1)
    })
  }

  MOCK_ASSISTANTS.official.forEach(tally)
  MOCK_ASSISTANTS.custom.forEach(tally)

  return Array.from(mockCategoryRegistry.entries())
    .map(([name, meta]) => ({
      id: meta.id,
      name,
      slug: meta.slug,
      description: undefined,
      accentColor: undefined,
      sortOrder: meta.id,
      assistantCount: counts.get(meta.id) ?? 0,
      isActive: true
    }))
    .filter((category) => (includeEmpty ? true : category.assistantCount > 0))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

const normalizeOptionalText = (value?: string | null) => {
  if (value === undefined || value === null) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

const slugifyAssistantIdentifier = (value: string) => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || `assistant-${Date.now()}`
}

const serializeAssistantPayload = (payload: AssistantUpsertPayload) => ({
  auth_code: payload.authCode,
  name: payload.name,
  slug: normalizeOptionalText(payload.slug),
  definition: payload.definition,
  description: normalizeOptionalText(payload.description),
  cover_url: payload.coverUrl,
  cover_type: payload.coverType ?? 'image',
  category_ids: payload.categoryIds,
  models: payload.models,
  supports_image: payload.supportsImage,
  supports_video: payload.supportsVideo,
  accent_color: normalizeOptionalText(payload.accentColor ?? undefined),
  visibility: payload.visibility
})

const buildAssistantFromPayload = (
  payload: AssistantUpsertPayload,
  id: number,
  overrides?: { createdAt?: string }
): AssistantProfile => {
  const timestamp = new Date().toISOString()
  const slugSource = normalizeOptionalText(payload.slug) ?? `${payload.name}-${id}`
  const categoryIds = payload.categoryIds ?? []
  const categoryNames = getMockCategoryNamesByIds(categoryIds)
  const normalizedModels = payload.models.map((item) => item.trim()).filter(Boolean)
  const coverIsExternal = isAbsoluteUrl(payload.coverUrl)
  const coverStoragePath = coverIsExternal ? null : payload.coverUrl
  const resolvedCoverUrl = coverIsExternal ? payload.coverUrl : resolveCoverUrl(payload.coverUrl)

  return {
    id,
    name: payload.name,
    slug: slugifyAssistantIdentifier(slugSource),
    definition: payload.definition,
    description: normalizeOptionalText(payload.description),
    coverUrl: resolvedCoverUrl,
    coverStoragePath,
    coverType: payload.coverType ?? 'image',
    primaryCategory: categoryNames[0] ?? undefined,
    secondaryCategory: categoryNames[1] ?? undefined,
    categories: categoryNames,
    categoryIds,
    models: normalizedModels,
    supportsImage: payload.supportsImage,
    supportsVideo: payload.supportsVideo,
    accentColor: normalizeOptionalText(payload.accentColor ?? undefined) ?? null,
    type: 'custom',
    ownerCode: payload.authCode,
    visibility: payload.visibility,
    reviewStatus: payload.visibility === 'public' ? 'pending' : 'approved',
    isFavorited: false,
    status: 'active',
    createdAt: overrides?.createdAt ?? timestamp,
    updatedAt: timestamp
  }
}

const getNextMockAssistantId = () => {
  return [...MOCK_ASSISTANTS.official, ...MOCK_ASSISTANTS.custom].reduce((max, assistant) => Math.max(max, assistant.id), 0) + 1
}

const findMockCustomAssistantIndex = (assistantId: number) =>
  MOCK_ASSISTANTS.custom.findIndex((assistant) => assistant.id === assistantId)

class ApiService {
  // 认证相关
  async verifyAuthCode(code: string): Promise<AuthResponse> {
    if (SECURITY_CONFIG.API_SECURITY.HIDE_SENSITIVE_LOGS) {
      console.log('Verifying auth code:', sanitizeLogData({ code }))
    }
    
    if (API_BASE === 'mock') {
      // Mock模式
      await new Promise(resolve => setTimeout(resolve, 500)) // 模拟网络延迟
      const authData = MOCK_AUTH_CODES[code as keyof typeof MOCK_AUTH_CODES]
      
      if (authData) {
        return {
          success: true,
          message: '验证成功',
          user_data: attachMockTeamPayload(authData)
        }
      } else {
        return {
          success: false,
          message: '授权码不存在'
        }
      }
    }
    
    // 真实API调用
    const response = await fetch(`${API_BASE}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    })
    const result = await response.json()
    
    // 安全日志记录
    if (SECURITY_CONFIG.API_SECURITY.HIDE_SENSITIVE_LOGS) {
      console.log('Auth verification result:', sanitizeLogData(result))
    }
    
    return result
  }

  async getUserInfo(code: string) {
    if (API_BASE === 'mock') {
      const authData = MOCK_AUTH_CODES[code as keyof typeof MOCK_AUTH_CODES]
      return authData ? attachMockTeamPayload(authData) : { error: '授权码不存在' }
    }
    
    const response = await fetch(`${API_BASE}/api/auth/user-info/${code}`)
    return response.json()
  }

  async updateAuthCodeProfile(code: string, payload: AuthCodeProfileUpdatePayload) {
    if (API_BASE === 'mock') {
      const record = MOCK_AUTH_CODES[code as keyof typeof MOCK_AUTH_CODES]
      if (!record) {
        throw new Error('授权码不存在')
      }
      if (payload.contactName !== undefined) {
        record.contact_name = normalizeOptionalText(payload.contactName) ?? null
      }
      if (payload.creatorName !== undefined) {
        record.creator_name = normalizeOptionalText(payload.creatorName) ?? null
      }
      if (payload.phoneNumber !== undefined) {
        record.phone_number = normalizeOptionalText(payload.phoneNumber) ?? null
      }
      if (payload.description !== undefined) {
        record.description = normalizeOptionalText(payload.description) ?? null
      }
      if (payload.ipWhitelist !== undefined) {
        record.ip_whitelist = payload.ipWhitelist?.map((item) => item.trim()).filter(Boolean) ?? []
      }
      if (payload.allowedModels !== undefined) {
        record.allowed_models = payload.allowedModels?.map((item) => item.trim()).filter(Boolean) ?? []
      }
      record.updated_at = new Date().toISOString()
      return attachMockTeamPayload(record)
    }

    const response = await fetch(`${API_BASE}/api/auth/user-info/${code}/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contact_name: normalizeOptionalText(payload.contactName) ?? null,
        creator_name: normalizeOptionalText(payload.creatorName) ?? null,
        phone_number: normalizeOptionalText(payload.phoneNumber) ?? null,
        description: normalizeOptionalText(payload.description) ?? null,
        ip_whitelist: payload.ipWhitelist,
        allowed_models: payload.allowedModels
      })
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '授权码信息更新失败')
    }

    return response.json()
  }

  // 图像上传
  async uploadImages(files: File[], authCode: string): Promise<{ success: boolean, files: UploadedFile[] }> {
    if (API_BASE === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 1000))
      return {
        success: true,
        files: files.map((file) => ({
          original_name: file.name,
          saved_path: `/uploads/${file.name}`,
          url: URL.createObjectURL(file)
        }))
      }
    }
    
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))
    formData.append('auth_code', authCode)

    const response = await fetch(`${API_BASE}/api/images/upload`, {
      method: 'POST',
      body: formData,
    })
    return response.json()
  }

  // 图像生成
  async generateImages(request: GenerateRequest): Promise<GenerateResponse> {
    if (API_BASE === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 3000))
      return {
        success: true,
        message: '生成成功',
        output_images: [
          '/api/placeholder/512/512',
          '/api/placeholder/512/512'
        ],
        credits_used: 50,
        processing_time: 3000
      }
    }
    
    const response = await fetch(`${API_BASE}/api/images/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })
    return response.json()
  }

  // 历史记录
  async getHistory(authCode: string): Promise<GenerationRecord[]> {
    if (API_BASE === 'mock') {
      return [
        {
          id: 1,
          auth_code: authCode,
          prompt_text: '科幻风格头像制作',
          mode_type: 'multi',
          input_images: ['/api/placeholder/300/300'],
          output_count: 2,
          output_images: ['/api/placeholder/300/300', '/api/placeholder/300/300'],
          credits_used: 50,
          processing_time: 3000,
          created_at: '2025-08-27T10:00:00Z'
        }
      ]
    }
    
    const response = await fetch(`${API_BASE}/api/v1/history/${authCode}`)
    return response.json()
  }

  async createAssistant(payload: AssistantUpsertPayload): Promise<AssistantProfile> {
    const authCode = payload.authCode?.trim()
    if (!authCode) {
      throw new Error('请先绑定授权码')
    }

    const normalizedPayload: AssistantUpsertPayload = {
      ...payload,
      authCode,
      visibility: payload.visibility ?? 'private',
      categoryIds: payload.categoryIds ?? [],
      models: payload.models.map((item) => item.trim()).filter(Boolean)
    }

    if (API_BASE === 'mock') {
      const record = buildAssistantFromPayload(normalizedPayload, getNextMockAssistantId())
      MOCK_ASSISTANTS.custom.unshift(record)
      return record
    }

    const response = await fetch(`${API_BASE}/api/assistants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(serializeAssistantPayload(normalizedPayload))
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '助手创建失败')
    }

    return normalizeAssistantProfile(await response.json())
  }

  async updateAssistant(assistantId: number, payload: AssistantUpsertPayload): Promise<AssistantProfile> {
    const authCode = payload.authCode?.trim()
    if (!authCode) {
      throw new Error('请先绑定授权码')
    }

    const normalizedPayload: AssistantUpsertPayload = {
      ...payload,
      authCode,
      visibility: payload.visibility ?? 'private',
      categoryIds: payload.categoryIds ?? [],
      models: payload.models.map((item) => item.trim()).filter(Boolean)
    }

    if (API_BASE === 'mock') {
      const index = findMockCustomAssistantIndex(assistantId)
      if (index === -1) {
        throw new Error('助手不存在')
      }
      const existing = MOCK_ASSISTANTS.custom[index]
      if (existing.ownerCode !== authCode) {
        throw new Error('无权限操作该助手')
      }
      const updated = buildAssistantFromPayload(normalizedPayload, assistantId, {
        createdAt: existing.createdAt
      })
      updated.visibility = normalizedPayload.visibility
      if (updated.visibility === 'public' && existing.visibility !== 'public') {
        updated.reviewStatus = 'pending'
      } else if (updated.visibility === 'private') {
        updated.reviewStatus = 'approved'
      } else {
        updated.reviewStatus = existing.reviewStatus ?? 'approved'
      }
      updated.isFavorited = existing.isFavorited ?? false
      updated.favoriteGroupId = existing.favoriteGroupId ?? null
      updated.favoriteGroupName = existing.favoriteGroupName ?? null
      MOCK_ASSISTANTS.custom[index] = updated
      return updated
    }

    const response = await fetch(`${API_BASE}/api/assistants/${assistantId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(serializeAssistantPayload(normalizedPayload))
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '助手更新失败')
    }

    return normalizeAssistantProfile(await response.json())
  }

  async updateAssistantVisibility(
    assistantId: number,
    payload: AssistantVisibilityUpdatePayload
  ): Promise<AssistantProfile> {
    const authCode = payload.authCode?.trim()
    if (!authCode) {
      throw new Error('请先绑定授权码')
    }

    if (API_BASE === 'mock') {
      const index = findMockCustomAssistantIndex(assistantId)
      if (index === -1) {
        throw new Error('助手不存在')
      }
      const target = MOCK_ASSISTANTS.custom[index]
      if (target.ownerCode !== authCode) {
        throw new Error('无权限操作该助手')
      }
      const becamePublic = payload.visibility === 'public' && target.visibility !== 'public'
      const updated = {
        ...target,
        visibility: payload.visibility,
        reviewStatus:
          payload.visibility === 'public'
            ? becamePublic
              ? 'pending'
              : target.reviewStatus ?? 'approved'
            : 'approved',
        updatedAt: new Date().toISOString()
      }
      MOCK_ASSISTANTS.custom[index] = updated
      return updated
    }

    const response = await fetch(`${API_BASE}/api/assistants/${assistantId}/visibility`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_code: authCode,
        visibility: payload.visibility
      })
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '可见性更新失败')
    }

    return normalizeAssistantProfile(await response.json())
  }

  async toggleAssistantFavorite(
    assistantId: number,
    authCode: string,
    options?: { groupId?: number | null }
  ): Promise<{
    isFavorited: boolean
    favoriteGroupId: number | null
    favoriteGroupName: string | null
  }> {
    const sanitizedCode = authCode?.trim()
    if (!sanitizedCode) {
      throw new Error('请先绑定授权码')
    }

    const desiredGroupId = options?.groupId

    if (API_BASE === 'mock') {
      const allAssistants = [...MOCK_ASSISTANTS.official, ...MOCK_ASSISTANTS.custom]
      const target = allAssistants.find((assistant) => assistant.id === assistantId)
      if (!target) {
        throw new Error('助手不存在')
      }
      if (
        target.type === 'custom' &&
        target.visibility === 'private' &&
        target.ownerCode !== sanitizedCode
      ) {
        throw new Error('无权收藏该助手')
      }
      if (
        target.type === 'custom' &&
        target.visibility === 'public' &&
        target.ownerCode !== sanitizedCode &&
        (target.reviewStatus ?? 'approved') !== 'approved'
      ) {
        throw new Error('助手尚未审核通过，暂不可收藏')
      }
      target.isFavorited = !target.isFavorited
      if (target.isFavorited) {
        let assignedGroup: FavoriteGroup | null = null
        if (desiredGroupId !== undefined) {
          if (desiredGroupId === null) {
            assignedGroup = null
          } else {
            assignedGroup = getMockFavoriteGroupById(sanitizedCode, desiredGroupId) ?? null
            if (!assignedGroup) {
              throw new Error('分组不存在')
            }
          }
        }
        const assignment = assignMockAssistantGroup(assistantId, assignedGroup)
        return {
          isFavorited: true,
          favoriteGroupId: assignment.favoriteGroupId,
          favoriteGroupName: assignment.favoriteGroupName
        }
      }
      assignMockAssistantGroup(assistantId, null)
      return {
        isFavorited: false,
        favoriteGroupId: null,
        favoriteGroupName: null
      }
    }

    const payload: Record<string, unknown> = { auth_code: sanitizedCode }
    if (desiredGroupId !== undefined) {
      payload.group_id = desiredGroupId
    }

    const response = await fetch(`${API_BASE}/api/assistants/${assistantId}/favorites/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '收藏操作失败')
    }

    const result = await response.json()
    return {
      isFavorited: Boolean(result.is_favorited ?? result.isFavorited ?? false),
      favoriteGroupId: result.favorite_group_id ?? result.favoriteGroupId ?? null,
      favoriteGroupName: result.favorite_group_name ?? result.favoriteGroupName ?? null
    }
  }

  async getFavoriteGroups(authCode: string): Promise<FavoriteGroup[]> {
    const sanitizedCode = authCode?.trim()
    if (!sanitizedCode) {
      throw new Error('请先绑定授权码')
    }

    if (API_BASE === 'mock') {
      return computeMockFavoriteGroupCounts(sanitizedCode)
    }

    const query = new URLSearchParams({ auth_code: sanitizedCode })
    const response = await fetch(
      `${API_BASE}/api/assistants/favorites/groups?${query.toString()}`
    )
    if (!response.ok) {
      throw new Error('收藏分组加载失败')
    }
    const result = await response.json()
    if (!Array.isArray(result)) {
      return []
    }
    return result.map(normalizeFavoriteGroup)
  }

  async createFavoriteGroup(authCode: string, name: string): Promise<FavoriteGroup> {
    const sanitizedCode = authCode?.trim()
    const trimmedName = name?.trim()
    if (!sanitizedCode) {
      throw new Error('请先绑定授权码')
    }
    if (!trimmedName) {
      throw new Error('分组名称不能为空')
    }

    if (API_BASE === 'mock') {
      const groups = ensureMockFavoriteGroups(sanitizedCode)
      if (groups.some((group) => group.name === trimmedName)) {
        throw new Error('分组名称已存在')
      }
      const now = new Date().toISOString()
      const group: FavoriteGroup = {
        id: mockFavoriteGroupSequence++,
        name: trimmedName,
        assistantCount: 0,
        createdAt: now,
        updatedAt: now
      }
      groups.push(group)
      return { ...group }
    }

    const response = await fetch(`${API_BASE}/api/assistants/favorites/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ auth_code: sanitizedCode, name: trimmedName })
    })
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '分组创建失败')
    }
    return normalizeFavoriteGroup(await response.json())
  }

  async updateFavoriteGroup(
    groupId: number,
    authCode: string,
    name: string
  ): Promise<FavoriteGroup> {
    const sanitizedCode = authCode?.trim()
    const trimmedName = name?.trim()
    if (!sanitizedCode) {
      throw new Error('请先绑定授权码')
    }
    if (!trimmedName) {
      throw new Error('分组名称不能为空')
    }

    if (API_BASE === 'mock') {
      const groups = ensureMockFavoriteGroups(sanitizedCode)
      const target = groups.find((group) => group.id === groupId)
      if (!target) {
        throw new Error('分组不存在')
      }
      if (groups.some((group) => group.id !== groupId && group.name === trimmedName)) {
        throw new Error('分组名称已存在')
      }
      target.name = trimmedName
      target.updatedAt = new Date().toISOString()
      return { ...target }
    }

    const response = await fetch(`${API_BASE}/api/assistants/favorites/groups/${groupId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ auth_code: sanitizedCode, name: trimmedName })
    })
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '分组重命名失败')
    }
    return normalizeFavoriteGroup(await response.json())
  }

  async deleteFavoriteGroup(groupId: number, authCode: string): Promise<void> {
    const sanitizedCode = authCode?.trim()
    if (!sanitizedCode) {
      throw new Error('请先绑定授权码')
    }

    if (API_BASE === 'mock') {
      const groups = ensureMockFavoriteGroups(sanitizedCode)
      const index = groups.findIndex((group) => group.id === groupId)
      if (index === -1) {
        throw new Error('分组不存在')
      }
      clearMockGroupReference(sanitizedCode, groupId)
      groups.splice(index, 1)
      return
    }

    const query = new URLSearchParams({ auth_code: sanitizedCode })
    const response = await fetch(
      `${API_BASE}/api/assistants/favorites/groups/${groupId}?${query.toString()}`,
      {
        method: 'DELETE'
      }
    )
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '分组删除失败')
    }
  }

  async assignFavoriteGroup(
    assistantId: number,
    authCode: string,
    groupId?: number | null
  ): Promise<{ favoriteGroupId: number | null; favoriteGroupName: string | null }> {
    const sanitizedCode = authCode?.trim()
    if (!sanitizedCode) {
      throw new Error('请先绑定授权码')
    }

    if (API_BASE === 'mock') {
      const target = getAllMockAssistants().find((assistant) => assistant.id === assistantId)
      if (!target || !target.isFavorited) {
        throw new Error('请先收藏该助手')
      }
      if (groupId === undefined) {
        return {
          favoriteGroupId: target.favoriteGroupId ?? null,
          favoriteGroupName: target.favoriteGroupName ?? null
        }
      }
      let assignedGroup: FavoriteGroup | null = null
      if (groupId !== null) {
        assignedGroup = getMockFavoriteGroupById(sanitizedCode, groupId) ?? null
        if (!assignedGroup) {
          throw new Error('分组不存在')
        }
      }
      return assignMockAssistantGroup(assistantId, assignedGroup)
    }

    const payload: Record<string, unknown> = { auth_code: sanitizedCode }
    if (groupId !== undefined) {
      payload.group_id = groupId
    }

    const response = await fetch(`${API_BASE}/api/assistants/${assistantId}/favorites/group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '分组调整失败')
    }

    const result = await response.json()
    return {
      favoriteGroupId: result.favorite_group_id ?? result.favoriteGroupId ?? null,
      favoriteGroupName: result.favorite_group_name ?? result.favoriteGroupName ?? null
    }
  }

  async getAssistantComments(
    assistantId: number,
    params: { page?: number; pageSize?: number; authCode?: string } = {}
  ): Promise<AssistantCommentList> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? DEFAULT_COMMENT_PAGE_SIZE
    const sanitizedCode = params.authCode?.trim()

    if (API_BASE === 'mock') {
      ensureMockCommentableAssistant(assistantId)
      const bucket = ensureMockCommentBucket(assistantId)
      const sorted = [...bucket].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      const total = sorted.length
      const start = (page - 1) * pageSize
      const items = sorted
        .slice(start, start + pageSize)
        .map((comment) => normalizeMockAssistantComment(comment, sanitizedCode))
      return {
        items,
        total,
        page,
        pageSize
      }
    }

    const query = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize)
    })
    if (sanitizedCode) {
      query.set('auth_code', sanitizedCode)
    }
    const response = await fetch(`${API_BASE}/api/assistants/${assistantId}/comments?${query.toString()}`)
    if (!response.ok) {
      throw new Error('评论加载失败')
    }
    const data = await response.json()
    const rawItems = Array.isArray(data.items) ? data.items : []
    return {
      items: rawItems.map(normalizeAssistantCommentResponse),
      total: data.total ?? rawItems.length,
      page: data.page ?? page,
      pageSize: data.page_size ?? pageSize
    }
  }

  async createAssistantComment(
    assistantId: number,
    payload: { authCode: string; content: string }
  ): Promise<AssistantComment> {
    const authCode = payload.authCode?.trim()
    if (!authCode) {
      throw new Error('请先绑定授权码')
    }
    const content = payload.content?.trim()
    if (!content) {
      throw new Error('请输入评论内容')
    }

    if (API_BASE === 'mock') {
      const assistant = ensureMockCommentableAssistant(assistantId)
      const bucket = ensureMockCommentBucket(assistant.id)
      const now = new Date().toISOString()
      const record: MockAssistantComment = {
        id: mockCommentSequence++,
        assistantId: assistant.id,
        authCode,
        content,
        likedAuthCodes: new Set(),
        createdAt: now,
        updatedAt: now
      }
      bucket.unshift(record)
      return normalizeMockAssistantComment(record, authCode)
    }

    const response = await fetch(`${API_BASE}/api/assistants/${assistantId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_code: authCode,
        content
      })
    })
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '评论发送失败')
    }
    return normalizeAssistantCommentResponse(await response.json())
  }

  async deleteAssistantComment(
    assistantId: number,
    commentId: number,
    authCode: string
  ): Promise<void> {
    const sanitizedCode = authCode?.trim()
    if (!sanitizedCode) {
      throw new Error('请先绑定授权码')
    }

    if (API_BASE === 'mock') {
      ensureMockCommentableAssistant(assistantId)
      const bucket = ensureMockCommentBucket(assistantId)
      const index = bucket.findIndex((comment) => comment.id === commentId)
      if (index === -1) {
        throw new Error('评论不存在')
      }
      if (bucket[index].authCode !== sanitizedCode) {
        throw new Error('仅评论发布者可删除')
      }
      bucket.splice(index, 1)
      return
    }

    const query = new URLSearchParams({ auth_code: sanitizedCode })
    const response = await fetch(
      `${API_BASE}/api/assistants/${assistantId}/comments/${commentId}?${query.toString()}`,
      {
        method: 'DELETE'
      }
    )
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '评论删除失败')
    }
  }

  async toggleAssistantCommentLike(
    assistantId: number,
    commentId: number,
    authCode: string
  ): Promise<{ liked: boolean; likeCount: number }> {
    const sanitizedCode = authCode?.trim()
    if (!sanitizedCode) {
      throw new Error('请先绑定授权码')
    }

    if (API_BASE === 'mock') {
      ensureMockCommentableAssistant(assistantId)
      const bucket = ensureMockCommentBucket(assistantId)
      const target = bucket.find((comment) => comment.id === commentId)
      if (!target) {
        throw new Error('评论不存在')
      }
      if (target.likedAuthCodes.has(sanitizedCode)) {
        target.likedAuthCodes.delete(sanitizedCode)
        target.updatedAt = new Date().toISOString()
        return { liked: false, likeCount: target.likedAuthCodes.size }
      }
      target.likedAuthCodes.add(sanitizedCode)
      target.updatedAt = new Date().toISOString()
      return { liked: true, likeCount: target.likedAuthCodes.size }
    }

    const response = await fetch(
      `${API_BASE}/api/assistants/${assistantId}/comments/${commentId}/like`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ auth_code: sanitizedCode })
      }
    )
    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '评论操作失败')
    }
    const result = await response.json()
    return {
      liked: Boolean(result.liked ?? result.is_liked ?? false),
      likeCount: result.like_count ?? result.likeCount ?? 0
    }
  }

  async getAssistants(params: AssistantQueryParams = {}): Promise<AssistantMarketplaceResponse> {
    const {
      search = '',
      category = '全部',
      categoryId,
      officialPage = 1,
      customPage = 1,
      favoritesPage = 1,
      pageSize = DEFAULT_ASSISTANT_PAGE_SIZE,
      authCode,
      coverType,
      customVisibility = 'all',
      favoriteGroupIds,
      customReviewStatus,
      favoriteReviewStatus,
    } = params

    if (API_BASE === 'mock') {
      const keyword = search.trim().toLowerCase()
      const categoryFilter = category && category !== '全部' ? category : null
      const categoryIdFilter = typeof categoryId === 'number' ? categoryId : null
      const ownerFilter = authCode?.trim()
      const normalizedVisibility = (customVisibility ?? 'all') as AssistantVisibilityFilter
      const normalizedCoverType = coverType?.toLowerCase() as 'image' | 'video' | 'gif' | undefined

      const matchesBaseFilters = (assistant: AssistantProfile) => {
        const haystack = `${assistant.name} ${assistant.definition} ${assistant.description ?? ''}`.toLowerCase()
        const matchesKeyword = keyword ? haystack.includes(keyword) : true
        const matchesCategory = categoryIdFilter !== null
          ? (assistant.categoryIds ?? []).includes(categoryIdFilter)
          : categoryFilter
            ? assistant.categories.includes(categoryFilter)
            : true
        const matchesCoverType = normalizedCoverType ? assistant.coverType === normalizedCoverType : true
        return matchesKeyword && matchesCategory && matchesCoverType
      }

      const filteredOfficial = MOCK_ASSISTANTS.official.filter(
        (assistant) => (assistant.reviewStatus ?? 'approved') === 'approved' && matchesBaseFilters(assistant)
      )

      const filteredCustom = ownerFilter
        ? MOCK_ASSISTANTS.custom.filter((assistant) => {
            const isOwner = assistant.ownerCode === ownerFilter
            const reviewStatus = assistant.reviewStatus ?? 'approved'
            if (assistant.visibility === 'private' && !isOwner) {
              return false
            }
            if (assistant.visibility === 'public' && !isOwner && reviewStatus !== 'approved') {
              return false
            }

            if (normalizedVisibility === 'public') {
              if (assistant.visibility !== 'public') {
                return false
              }
              if (!isOwner && reviewStatus !== 'approved') {
                return false
              }
            } else if (normalizedVisibility === 'private') {
              if (!isOwner || assistant.visibility !== 'private') {
                return false
              }
            }

            return matchesBaseFilters(assistant)
          })
        : []

      const filteredFavorites = ownerFilter
        ? [...MOCK_ASSISTANTS.official, ...MOCK_ASSISTANTS.custom].filter((assistant) => {
            if (!assistant.isFavorited) {
              return false
            }
            if (
              assistant.type === 'custom' &&
              assistant.visibility === 'private' &&
              assistant.ownerCode !== ownerFilter
            ) {
              return false
            }
            if (
              assistant.type === 'custom' &&
              assistant.ownerCode !== ownerFilter &&
              (assistant.visibility !== 'public' || (assistant.reviewStatus ?? 'approved') !== 'approved')
            ) {
              return false
            }
            if (Array.isArray(favoriteGroupIds) && favoriteGroupIds.length) {
              const groupId = assistant.favoriteGroupId ?? null
              const selection = new Set(favoriteGroupIds)
              const matchesUngrouped = selection.has(0) && groupId === null
              const matchesGrouped = groupId !== null && selection.has(groupId)
              if (!matchesUngrouped && !matchesGrouped) {
                return false
              }
            }
            return matchesBaseFilters(assistant)
          })
        : []

      return {
        official: paginateAssistantList(filteredOfficial, officialPage, pageSize),
        custom: paginateAssistantList(filteredCustom, customPage, pageSize),
        favorites: paginateAssistantList(filteredFavorites, favoritesPage, pageSize),
        availableCategories: getMockCategories()
      }
    }

    const query = new URLSearchParams({
      search: search || '',
      category: category || '',
      official_page: String(officialPage),
      custom_page: String(customPage),
      favorites_page: String(favoritesPage),
      page_size: String(pageSize),
      favorites_page_size: String(pageSize)
    })

    if (typeof categoryId === 'number') {
      query.set('category_id', String(categoryId))
    }

    if (authCode) {
      query.set('auth_code', authCode)
    }

    if (customVisibility) {
      query.set('custom_visibility', customVisibility)
    }

    if (coverType) {
      query.set('cover_type', coverType)
    }

    if (favoriteGroupIds && favoriteGroupIds.length) {
      favoriteGroupIds.forEach((groupId) => {
        query.append('favorite_group_ids', String(groupId))
      })
    }

    if (customReviewStatus) {
      query.set('custom_review_status', customReviewStatus)
    }

    if (favoriteReviewStatus) {
      query.set('favorite_review_status', favoriteReviewStatus)
    }

    const response = await fetch(`${API_BASE}/api/assistants?${query.toString()}`)
    if (!response.ok) {
      throw new Error('助手数据加载失败')
    }
    const data = await response.json()

    return {
      official: normalizeAssistantSection(data.official, officialPage, pageSize),
      custom: normalizeAssistantSection(data.custom, customPage, pageSize),
      favorites: normalizeAssistantSection(data.favorites, favoritesPage, pageSize),
      availableCategories: (data.available_categories ?? data.availableCategories ?? []).map((category: any) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description ?? null,
        accentColor: category.accent_color ?? category.accentColor ?? null,
        sortOrder: category.sort_order ?? category.sortOrder ?? 0,
        assistantCount: category.assistant_count ?? category.assistantCount ?? 0,
        isActive: category.is_active ?? category.isActive ?? true
      }))
    }
  }

  async getAssistantCategories(options: { includeEmpty?: boolean } = {}): Promise<AssistantCategorySummary[]> {
    const includeEmpty = options.includeEmpty ?? false

    if (API_BASE === 'mock') {
      return getMockCategories(includeEmpty)
    }

    const params = new URLSearchParams()
    if (includeEmpty) {
      params.set('include_empty', 'true')
    }
    const query = params.toString()
    const response = await fetch(
      `${API_BASE}/api/assistants/categories${query ? `?${query}` : ''}`
    )
    if (!response.ok) {
      throw new Error('分类数据加载失败')
    }
    const data = await response.json()
    if (!Array.isArray(data)) {
      return []
    }
    return data.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description ?? null,
      accentColor: item.accent_color ?? item.accentColor ?? null,
      sortOrder: item.sort_order ?? item.sortOrder ?? 0,
      assistantCount: item.assistant_count ?? item.assistantCount ?? 0,
      isActive: item.is_active ?? item.isActive ?? true
    }))
  }

  async getAssistantModels(modelType?: 'chat' | 'image' | 'video'): Promise<AssistantModelDefinition[]> {
    if (API_BASE === 'mock') {
      const now = new Date().toISOString()
      const resolvedType = modelType ?? 'image'
      return getDefaultModelOptions().map((option, index) => ({
        id: index + 1,
        name: option.value,
        alias: option.alias ?? option.value,
        description: option.description,
        logoUrl: option.logoUrl,
        status: 'active',
        modelType: resolvedType,
        orderIndex: option.orderIndex ?? index + 1,
        creditCost: option.creditCost ?? null,
        discountCreditCost: option.discountCreditCost ?? null,
        isFreeToUse: option.isFreeToUse ?? false,
        createdAt: now,
        updatedAt: now
      }))
    }

    const params = new URLSearchParams()
    if (modelType) {
      params.set('model_type', modelType)
    }
    const query = params.toString()
    const response = await fetch(
      `${API_BASE}/api/assistants/models${query ? `?${query}` : ''}`
    )
    if (!response.ok) {
      throw new Error('模型数据加载失败')
    }
    const data = await response.json()
    if (!Array.isArray(data)) {
      return []
    }
    return data.map((item) => ({
      id: item.id,
      name: item.name,
      alias: item.alias ?? null,
      description: item.description ?? null,
      logoUrl: item.logo_url ?? item.logoUrl ?? null,
      status: item.status ?? 'active',
      modelType: item.model_type ?? item.modelType ?? 'image',
      orderIndex: item.order_index ?? item.orderIndex ?? null,
      creditCost: item.credit_cost ?? item.creditCost ?? null,
      discountCreditCost: item.discount_credit_cost ?? item.discountCreditCost ?? null,
      isFreeToUse: item.is_free_to_use ?? item.isFreeToUse ?? false,
      createdAt: item.created_at ?? item.createdAt ?? null,
      updatedAt: item.updated_at ?? item.updatedAt ?? null
    }))
  }

  async uploadAssistantCover(file: File, authCode: string): Promise<AssistantCoverUploadResult> {
    if (!authCode?.trim()) {
      throw new Error('请先绑定授权码')
    }

    if (API_BASE === 'mock') {
      const fileName = `${authCode}/assistant/cover/${Date.now()}-${file.name}`
      return {
        fileName,
        url: resolveCoverUrl(fileName)
      }
    }

    const formData = new FormData()
    formData.append('auth_code', authCode)
    formData.append('file', file)

    const response = await fetch(`${API_BASE}/api/assistants/covers/upload`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '封面上传失败')
    }

    const result = await response.json()
    const fileName = result.file_name ?? result.fileName ?? ''
    const url = result.url ?? resolveCoverUrl(fileName)
    if (!fileName || !url) {
      throw new Error('封面上传结果异常')
    }
    return { fileName, url }
  }

  async optimizeAssistantDefinition(
    payload: AssistantDefinitionOptimizePayload
  ): Promise<AssistantDefinitionOptimizeResult> {
    const authCode = payload.authCode?.trim()
    const modelName = payload.modelName?.trim()
    const definition = payload.definition?.trim()

    if (!authCode) {
      throw new Error('请先绑定授权码')
    }
    if (!modelName) {
      throw new Error('请选择助手大脑模型')
    }
    if (!definition) {
      throw new Error('请先输入助手定义内容')
    }

    if (API_BASE === 'mock') {
      await new Promise((resolve) => setTimeout(resolve, 600))
      return {
        optimizedDefinition: `${definition}\n\n（已自动优化定义，建议根据实际需求微调）`
      }
    }

    const response = await fetch(`${API_BASE}/api/assistants/definition/optimize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_code: authCode,
        model_name: modelName,
        definition
      })
    })

    if (!response.ok) {
      const message = await response.text().catch(() => '')
      throw new Error(message || '助手定义优化失败')
    }

    const result = await response.json()
    const optimizedDefinition =
      result.optimized_definition ?? result.optimizedDefinition ?? ''

    if (!optimizedDefinition) {
      throw new Error('AI 未返回优化内容，请稍后再试')
    }

    return { optimizedDefinition }
  }
}

export const apiService = new ApiService()

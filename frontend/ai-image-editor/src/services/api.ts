import {
  GenerateRequest,
  GenerateResponse,
  GenerationRecord,
  AuthResponse,
  UploadedFile,
  AssistantMarketplaceResponse,
  AssistantQueryParams,
  AssistantProfile,
  AssistantPaginatedSection,
  AssistantUpsertPayload,
  AssistantVisibility,
  AssistantVisibilityFilter,
  AssistantVisibilityUpdatePayload,
  AssistantCategorySummary,
  AuthCodeProfileUpdatePayload
} from '../types'
import { sanitizeLogData, SECURITY_CONFIG } from '../config/security'
import { maskAuthCode } from '../utils/authUtils'

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
    updated_at: '2025-02-01T00:00:00Z'
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
    updated_at: '2025-02-02T00:00:00Z'
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
    updated_at: '2025-02-03T00:00:00Z'
  }
}

const DEFAULT_ASSISTANT_PAGE_SIZE = 6

type MockAssistantProfile = Omit<AssistantProfile, 'categoryIds'> & {
  categoryIds?: number[]
}

const mockCategoryRegistry = new Map<string, { id: number; slug: string }>()
const mockCategoryMetaById = new Map<number, { name: string; slug: string }>()
let mockCategorySequence = 1

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

  return {
    id: assistant.id,
    name: assistant.name,
    slug: assistant.slug,
    definition: assistant.definition,
    description: assistant.description ?? undefined,
    coverUrl: assistant.cover_url ?? assistant.coverUrl ?? '',
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

  return {
    id,
    name: payload.name,
    slug: slugifyAssistantIdentifier(slugSource),
    definition: payload.definition,
    description: normalizeOptionalText(payload.description),
    coverUrl: payload.coverUrl,
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
          user_data: authData
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
      return authData || { error: '授权码不存在' }
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
      return record
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
      const updated = {
        ...target,
        visibility: payload.visibility,
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

  async getAssistants(params: AssistantQueryParams = {}): Promise<AssistantMarketplaceResponse> {
    const {
      search = '',
      category = '全部',
      categoryId,
      officialPage = 1,
      customPage = 1,
      pageSize = DEFAULT_ASSISTANT_PAGE_SIZE,
      authCode,
      customVisibility = 'all',
    } = params

    if (API_BASE === 'mock') {
      const keyword = search.trim().toLowerCase()
      const categoryFilter = category && category !== '全部' ? category : null
      const categoryIdFilter = typeof categoryId === 'number' ? categoryId : null
      const ownerFilter = authCode?.trim()
      const normalizedVisibility = (customVisibility ?? 'all') as AssistantVisibilityFilter

      const matchesBaseFilters = (assistant: AssistantProfile) => {
        const haystack = `${assistant.name} ${assistant.definition} ${assistant.description ?? ''}`.toLowerCase()
        const matchesKeyword = keyword ? haystack.includes(keyword) : true
        const matchesCategory = categoryIdFilter !== null
          ? (assistant.categoryIds ?? []).includes(categoryIdFilter)
          : categoryFilter
            ? assistant.categories.includes(categoryFilter)
            : true
        return matchesKeyword && matchesCategory
      }

      const filteredOfficial = MOCK_ASSISTANTS.official.filter(matchesBaseFilters)

      const filteredCustom = ownerFilter
        ? MOCK_ASSISTANTS.custom.filter((assistant) => {
            const isOwner = assistant.ownerCode === ownerFilter
            if (assistant.visibility === 'private' && !isOwner) {
              return false
            }

            if (normalizedVisibility === 'public') {
              if (assistant.visibility !== 'public') {
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

      return {
        official: paginateAssistantList(filteredOfficial, officialPage, pageSize),
        custom: paginateAssistantList(filteredCustom, customPage, pageSize),
        availableCategories: getMockCategories()
      }
    }

    const query = new URLSearchParams({
      search: search || '',
      category: category || '',
      official_page: String(officialPage),
      custom_page: String(customPage),
      page_size: String(pageSize)
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

    const response = await fetch(`${API_BASE}/api/assistants?${query.toString()}`)
    if (!response.ok) {
      throw new Error('助手数据加载失败')
    }
    const data = await response.json()

    return {
      official: normalizeAssistantSection(data.official, officialPage, pageSize),
      custom: normalizeAssistantSection(data.custom, customPage, pageSize),
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
}

export const apiService = new ApiService()

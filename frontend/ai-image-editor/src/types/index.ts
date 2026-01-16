export type TeamRole = 'admin' | 'member'

export interface User {
  code: string
  credits: number
  expireTime?: string
  status?: string
  description?: string | null
  contactName?: string | null
  creatorName?: string | null
  phoneNumber?: string | null
  ipWhitelist?: string[]
  allowedModels?: string[]
  teamId?: number | null
  teamRole?: TeamRole | null
  teamName?: string | null
  teamDisplayName?: string | null
  teamDescription?: string | null
  teamCredits?: number
  availableCredits?: number
}

export interface AuthUserPayload {
  code: string
  credits: number
  expire_time?: string
  status?: string
  description?: string | null
  contact_name?: string | null
  creator_name?: string | null
  phone_number?: string | null
  ip_whitelist?: string[] | string | null
  allowed_models?: string[] | string | null
  created_at?: string
  updated_at?: string
  team_id?: number
  team_role?: TeamRole
  team_name?: string | null
  team_display_name?: string | null
  team_description?: string | null
  team_credits?: number
  available_credits?: number
}

export interface AuthResponse {
  success: boolean
  message: string
  user_data?: AuthUserPayload
}

export interface AuthCodeProfileUpdatePayload {
  contactName?: string
  creatorName?: string
  phoneNumber?: string
  description?: string
  ipWhitelist?: string[]
  allowedModels?: string[]
}

export type MediaType = 'image' | 'video'
export type GenerationModuleName =
  | 'AI图像:多图模式'
  | 'AI图像:拼图模式-自定义画布'
  | 'AI图像:拼图模式-图像拼接'
  | (string & {})

export interface GenerationRecord {
  id: number
  auth_code: string
  module_name: GenerationModuleName
  media_type: MediaType
  input_images: string[]
  input_ext_param?: Record<string, unknown> | null
  prompt_text: string
  output_count: number
  output_images: string[]
  output_videos?: string[]
  credits_used: number
  processing_time?: number
  created_at: string
}

export interface HistoryQueryOptions {
  limit?: number
  offset?: number
  startDate?: string
  endDate?: string
}

export interface HistoryResponse {
  records: GenerationRecord[]
  availableDates: string[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
  nextOffset?: number | null
  range?: {
    start?: string | null
    end?: string | null
  } | null
}

export interface GenerateRequest {
  auth_code: string
  module_name: GenerationModuleName
  media_type: MediaType
  prompt_text: string
  output_count: number
  image_paths?: string[]
  model_name?: string
  aspect_ratio?: string | null
  image_size?: string | null
  mode_type?: string
}

export interface GenerateResponse {
  success: boolean
  message: string
  output_images?: string[]
  credits_used?: number
  processing_time?: number
}

export interface UploadedFile {
  original_name: string
  storage_key: string
  url: string
}

export type AssistantType = 'official' | 'custom'
export type AssistantVisibility = 'public' | 'private'
export type AssistantVisibilityFilter = 'all' | AssistantVisibility
export type AssistantReviewStatus = 'pending' | 'rejected' | 'approved'

export interface AssistantCategorySummary {
  id: number
  name: string
  slug: string
  description?: string
  accentColor?: string | null
  sortOrder?: number
  assistantCount: number
  isActive: boolean
}

export interface AssistantModelDefinition {
  id: number
  name: string
  alias?: string | null
  description?: string | null
  logoUrl?: string | null
  status: string
  modelType: 'chat' | 'image' | 'video'
  orderIndex?: number | null
  creditCost?: number | null
  discountCreditCost?: number | null
  isFreeToUse?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface AssistantCoverUploadResult {
  fileName: string
  url: string
}

export interface AssistantProfile {
  id: number
  name: string
  slug: string
  definition: string
  description?: string
  coverUrl: string
  coverStoragePath?: string | null
  coverType: 'image' | 'video' | 'gif'
  primaryCategory?: string
  secondaryCategory?: string
  categories: string[]
  categoryIds: number[]
  models: string[]
  supportsImage: boolean
  supportsVideo: boolean
  accentColor?: string | null
  type: AssistantType
  ownerCode?: string | null
  ownerDisplayName?: string | null
  ownerCodeMasked?: string | null
  visibility: AssistantVisibility
  reviewStatus: AssistantReviewStatus
  isFavorited: boolean
  favoriteGroupId?: number | null
  favoriteGroupName?: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface FavoriteGroup {
  id: number
  name: string
  assistantCount: number
  createdAt: string
  updatedAt: string
}

export interface AssistantPaginatedSection {
  items: AssistantProfile[]
  total: number
  page: number
  pageSize: number
}

export interface AssistantComment {
  id: number
  assistantId: number
  content: string
  likeCount: number
  createdAt: string
  updatedAt: string
  authorDisplayName: string
  authorCodeMasked: string
  canDelete: boolean
  likedByViewer: boolean
}

export interface AssistantCommentList {
  items: AssistantComment[]
  total: number
  page: number
  pageSize: number
}

export interface AssistantMarketplaceResponse {
  official: AssistantPaginatedSection
  custom: AssistantPaginatedSection
  favorites: AssistantPaginatedSection
  availableCategories: AssistantCategorySummary[]
}

export interface AssistantQueryParams {
  search?: string
  category?: string
  categoryId?: number
  officialPage?: number
  customPage?: number
  favoritesPage?: number
  pageSize?: number
  coverType?: 'image' | 'video' | 'gif'
  authCode?: string
  customVisibility?: AssistantVisibilityFilter
  favoriteGroupIds?: number[]
  customReviewStatus?: AssistantReviewStatus
  favoriteReviewStatus?: AssistantReviewStatus
}

export interface AssistantUpsertPayload {
  authCode: string
  name: string
  slug?: string
  definition: string
  description?: string
  coverUrl: string
  coverType?: 'image' | 'video' | 'gif'
  categoryIds: number[]
  models: string[]
  supportsImage: boolean
  supportsVideo: boolean
  accentColor?: string | null
  visibility: AssistantVisibility
}

export interface AssistantVisibilityUpdatePayload {
  authCode: string
  visibility: AssistantVisibility
}

export interface AssistantDefinitionOptimizePayload {
  authCode: string
  modelName: string
  definition: string
}

export interface AssistantDefinitionOptimizeResult {
  optimizedDefinition: string
}

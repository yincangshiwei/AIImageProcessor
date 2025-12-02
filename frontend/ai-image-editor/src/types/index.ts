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

export interface GenerationRecord {
  id: number
  auth_code: string
  mode_type: 'multi' | 'puzzle'
  input_images: string[]
  prompt_text: string
  output_count: number
  output_images: string[]
  credits_used: number
  processing_time?: number
  created_at: string
}

export interface GenerateRequest {
  auth_code: string
  mode_type: 'multi' | 'puzzle'
  prompt_text: string
  output_count: number
  image_paths?: string[]
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
  saved_path: string
  url: string
}

export type AssistantType = 'official' | 'custom'
export type AssistantVisibility = 'public' | 'private'
export type AssistantVisibilityFilter = 'all' | AssistantVisibility

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
  orderIndex?: number | null
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
  status: string
  createdAt: string
  updatedAt: string
}

export interface AssistantPaginatedSection {
  items: AssistantProfile[]
  total: number
  page: number
  pageSize: number
}

export interface AssistantMarketplaceResponse {
  official: AssistantPaginatedSection
  custom: AssistantPaginatedSection
  availableCategories: AssistantCategorySummary[]
}

export interface AssistantQueryParams {
  search?: string
  category?: string
  categoryId?: number
  officialPage?: number
  customPage?: number
  pageSize?: number
  coverType?: 'image' | 'video' | 'gif'
  authCode?: string
  customVisibility?: AssistantVisibilityFilter
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

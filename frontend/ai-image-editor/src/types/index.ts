export interface User {
  code: string
  credits: number
  expireTime?: string
}

export interface AuthResponse {
  success: boolean
  message: string
  user_data?: {
    code: string
    credits: number
    expire_time?: string
  }
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
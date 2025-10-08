import { GenerateRequest, GenerateResponse, TemplateCase, GenerationRecord, AuthResponse, UploadedFile } from '../types'
import { sanitizeLogData, SECURITY_CONFIG } from '../config/security'

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
  'DEMO2025': { code: 'DEMO2025', credits: 1000, status: 'active', expire_time: '2026-08-27' },
  'TEST001': { code: 'TEST001', credits: 500, status: 'active', expire_time: null },
  'VIP2025': { code: 'VIP2025', credits: 5000, status: 'active', expire_time: '2025-11-25' }
}

const MOCK_CASES: TemplateCase[] = [
  {
    id: 1,
    title: '科幻风格头像',
    description: '创造具有未来感的人物头像',
    category: '头像',
    mode_type: 'multi',
    prompt_text: 'futuristic portrait, cyberpunk style, neon lights, high-tech background',
    preview_image: '/api/placeholder/400/300',
    input_images: ['/api/placeholder/400/300'],
    popularity: 95,
    tags: ['科幻', '头像', '未来感']
  },
  {
    id: 2,
    title: '自然风景合成',
    description: '将多张自然照片合成为艺术作品',
    category: '风景',
    mode_type: 'puzzle',
    prompt_text: 'beautiful landscape, natural scenery, artistic composition, vibrant colors',
    preview_image: '/api/placeholder/400/300',
    input_images: ['/api/placeholder/400/300', '/api/placeholder/400/300'],
    popularity: 88,
    tags: ['风景', '自然', '合成']
  }
]

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

  // 图像上传
  async uploadImages(files: File[], authCode: string): Promise<{ success: boolean, files: UploadedFile[] }> {
    if (API_BASE === 'mock') {
      await new Promise(resolve => setTimeout(resolve, 1000))
      return {
        success: true,
        files: files.map((file, index) => ({
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

  // 案例管理
  async getCases(category?: string, modeType?: string): Promise<TemplateCase[]> {
    if (API_BASE === 'mock') {
      let filteredCases = [...MOCK_CASES]
      if (category && category !== 'all') {
        filteredCases = filteredCases.filter(c => c.category === category)
      }
      if (modeType) {
        filteredCases = filteredCases.filter(c => c.mode_type === modeType)
      }
      return filteredCases
    }
    
    const params = new URLSearchParams()
    if (category) params.append('category', category)
    if (modeType) params.append('mode_type', modeType)
    
    const response = await fetch(`${API_BASE}/api/cases/list?${params}`)
    return response.json()
  }

  async recommendCases(prompt: string, limit = 5): Promise<TemplateCase[]> {
    if (API_BASE === 'mock') {
      return MOCK_CASES.slice(0, limit)
    }
    
    const response = await fetch(`${API_BASE}/api/cases/recommend?prompt=${encodeURIComponent(prompt)}&limit=${limit}`)
    return response.json()
  }
}

export const apiService = new ApiService()
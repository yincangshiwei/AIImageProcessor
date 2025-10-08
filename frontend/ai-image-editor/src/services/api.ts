import { GenerateRequest, GenerateResponse, GenerationRecord, AuthResponse, UploadedFile } from '../types'
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
}

export const apiService = new ApiService()
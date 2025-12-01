import React, { createContext, useContext, useState, useEffect } from 'react'
import { User, AuthUserPayload } from '../types'
import { apiService } from '../services/api'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (code: string) => Promise<{ success: boolean, message: string }>
  logout: () => void
  refreshUserInfo: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = 'ai_image_editor_auth'

const parseDelimitedList = (value?: string[] | string | null, delimiter = ';'): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(delimiter)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

const mapServerUserToClient = (payload: AuthUserPayload): User => {
  return {
    code: payload.code,
    credits: payload.credits,
    expireTime: payload.expire_time ?? undefined,
    status: payload.status ?? 'unknown',
    description: payload.description ?? null,
    contactName: payload.contact_name ?? null,
    creatorName: payload.creator_name ?? null,
    phoneNumber: payload.phone_number ?? null,
    ipWhitelist: parseDelimitedList(payload.ip_whitelist, ';'),
    allowedModels: parseDelimitedList(payload.allowed_models, ',')
  }
}

const buildStorageSnapshot = (user: User) => ({
  codeHash: btoa(user.code),
  credits: user.credits,
  expireTime: user.expireTime,
  contactName: user.contactName ?? null,
  creatorName: user.creatorName ?? null,
  phoneNumber: user.phoneNumber ?? null
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 初始化时检查本地存储
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const stored = localStorage.getItem(AUTH_STORAGE_KEY)
        if (stored) {
          const storageData = JSON.parse(stored)
          // 如果是新格式（有codeHash），需要重新验证
          if (storageData.codeHash) {
            try {
              const originalCode = atob(storageData.codeHash)
              const result = await apiService.getUserInfo(originalCode)
              if (result && result.code) {
                const mappedUser = mapServerUserToClient(result as AuthUserPayload)
                setUser(mappedUser)
                localStorage.setItem(
                  AUTH_STORAGE_KEY,
                  JSON.stringify(buildStorageSnapshot(mappedUser))
                )
              } else {
                localStorage.removeItem(AUTH_STORAGE_KEY)
              }
            } catch {
              localStorage.removeItem(AUTH_STORAGE_KEY)
            }
          } else if (storageData.code) {
            // 兼容旧格式，但清除并要求重新登录
            localStorage.removeItem(AUTH_STORAGE_KEY)
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        localStorage.removeItem(AUTH_STORAGE_KEY)
      } finally {
        setLoading(false)
      }
    }
    
    checkAuth()
  }, [])

  const login = async (code: string): Promise<{ success: boolean, message: string }> => {
    try {
      const result = await apiService.verifyAuthCode(code)
      
      if (result.success && result.user_data) {
        const mappedUser = mapServerUserToClient(result.user_data)
        setUser(mappedUser)
        // 存储时不保存完整授权码，使用编码处理
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify(buildStorageSnapshot(mappedUser))
        )
        
        return { success: true, message: result.message }
      } else {
        return { success: false, message: result.message }
      }
    } catch (error) {
      console.error('Login failed:', error)
      return { success: false, message: '登录失败，请稍后重试' }
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(AUTH_STORAGE_KEY)
  }

  const refreshUserInfo = async () => {
    if (!user) return
    
    try {
      const result = await apiService.getUserInfo(user.code)
      if (result && result.code) {
        const updatedUser = mapServerUserToClient(result as AuthUserPayload)
        setUser(updatedUser)
        // 更新存储时同样使用编码格式
        localStorage.setItem(
          AUTH_STORAGE_KEY,
          JSON.stringify(buildStorageSnapshot(updatedUser))
        )
      }
    } catch (error) {
      console.error('Failed to refresh user info:', error)
    }
  }

  const value = {
    user,
    loading,
    login,
    logout,
    refreshUserInfo
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
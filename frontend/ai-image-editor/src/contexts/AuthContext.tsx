import React, { createContext, useContext, useState, useEffect } from 'react'
import { User } from '../types'
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
              if (result.code) {
                setUser({
                  code: result.code,
                  credits: result.credits,
                  expireTime: result.expire_time
                })
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
        const userData: User = {
          code: result.user_data.code,
          credits: result.user_data.credits,
          expireTime: result.user_data.expire_time
        }
        
        setUser(userData)
        // 存储时不保存完整授权码，使用编码处理
        const storageData = {
          codeHash: btoa(result.user_data.code), // base64编码
          credits: result.user_data.credits,
          expireTime: result.user_data.expire_time
        }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storageData))
        
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
      if (result.code) {
        const updatedUser: User = {
          code: result.code,
          credits: result.credits,
          expireTime: result.expire_time
        }
        setUser(updatedUser)
        // 更新存储时同样使用编码格式
        const storageData = {
          codeHash: btoa(result.code),
          credits: result.credits,
          expireTime: result.expire_time
        }
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(storageData))
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
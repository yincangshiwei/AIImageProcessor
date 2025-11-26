/**
 * 安全配置文件
 */

export const SECURITY_CONFIG = {
  // 授权码显示配置
  AUTH_CODE_DISPLAY: {
    // 是否启用授权码隐藏
    ENABLE_MASKING: true,
    // 显示的前缀长度
    PREFIX_LENGTH: 2,
    // 显示的后缀长度
    SUFFIX_LENGTH: 2,
    // 最小隐藏长度
    MIN_MASK_LENGTH: 3,
    // 最大隐藏长度
    MAX_MASK_LENGTH: 8
  },
  
  // 本地存储安全配置
  LOCAL_STORAGE: {
    // 是否加密存储
    ENCRYPT_STORAGE: true,
    // 存储键名
    AUTH_KEY: 'ai_image_editor_auth',
    // 会话超时时间（毫秒）
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000 // 24小时
  },
  
  // API安全配置
  API_SECURITY: {
    // 是否在控制台输出中隐藏敏感信息
    HIDE_SENSITIVE_LOGS: true,
    // 敏感字段列表
    SENSITIVE_FIELDS: ['code', 'auth_code', 'token', 'password'],
    // 请求超时时间
    REQUEST_TIMEOUT: 30000
  }
}

/**
 * 检查是否为敏感字段
 */
export function isSensitiveField(fieldName: string): boolean {
  return SECURITY_CONFIG.API_SECURITY.SENSITIVE_FIELDS.includes(fieldName.toLowerCase())
}

/**
 * 清理日志中的敏感信息
 */
export function sanitizeLogData(data: any): any {
  if (typeof data !== 'object' || data === null) {
    return data
  }
  
  const sanitized = { ...data }
  
  for (const key in sanitized) {
    if (isSensitiveField(key)) {
      sanitized[key] = '[HIDDEN]'
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeLogData(sanitized[key])
    }
  }
  
  return sanitized
}
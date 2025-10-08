/**
 * 授权码安全处理工具函数
 */

/**
 * 隐藏授权码中间部分，用固定数量的*号替换
 * @param code 原始授权码
 * @returns 隐藏后的授权码
 */
export function maskAuthCode(code: string): string {
  if (!code || code.length < 4) {
    return code;
  }
  
  // 显示前2位和后2位
  const start = code.substring(0, 2);
  const end = code.substring(code.length - 2);
  
  // 使用固定数量的*号（6个），避免随机变化导致的闪烁
  const mask = '*'.repeat(6);
  
  return `${start}${mask}${end}`;
}

/**
 * 验证授权码格式（基本验证）
 * @param code 授权码
 * @returns 是否有效
 */
export function validateAuthCode(code: string): boolean {
  if (!code) return false;
  
  // 基本格式验证：长度在4-50之间，只包含字母数字
  const regex = /^[A-Za-z0-9]{4,50}$/;
  return regex.test(code);
}

/**
 * 生成用于显示的用户标识
 * @param code 原始授权码
 * @returns 安全的显示标识
 */
export function generateUserDisplayId(code: string): string {
  if (!code) return 'Unknown';
  
  // 使用前缀 + 隐藏码的方式
  const masked = maskAuthCode(code);
  return `用户${masked}`;
}

/**
 * 检查授权码是否可能包含敏感信息
 * @param code 授权码
 * @returns 是否包含敏感信息
 */
export function containsSensitiveInfo(code: string): boolean {
  if (!code) return false;
  
  // 检查是否包含常见敏感词汇
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /key/i,
    /token/i,
    /admin/i
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(code));
}
// 图片处理工具函数

/**
 * 从URL创建File对象
 * @param url 图片URL
 * @param filename 文件名
 * @returns Promise<File>
 */
export const urlToFile = async (url: string, filename: string): Promise<File> => {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    return new File([blob], filename, { type: blob.type })
  } catch (error) {
    console.error('URL转换为File失败:', error)
    throw error
  }
}

/**
 * 批量从URL创建File对象
 * @param urls 图片URL数组
 * @param namePrefix 文件名前缀
 * @returns Promise<File[]>
 */
export const urlsToFiles = async (urls: string[], namePrefix = 'template_image'): Promise<File[]> => {
  const promises = urls.map((url, index) => {
    const filename = `${namePrefix}_${index + 1}.${getFileExtensionFromUrl(url) || 'jpg'}`
    return urlToFile(url, filename)
  })
  
  try {
    const files = await Promise.all(promises)
    return files
  } catch (error) {
    console.error('批量URL转换失败:', error)
    throw error
  }
}

/**
 * 从URL获取文件扩展名
 * @param url 图片URL
 * @returns 文件扩展名
 */
const getFileExtensionFromUrl = (url: string): string | null => {
  try {
    const pathname = new URL(url).pathname
    const extension = pathname.split('.').pop()
    return extension?.toLowerCase() || null
  } catch {
    return null
  }
}

/**
 * 创建带预览URL的图片对象
 * @param file File对象
 * @returns 包含预览URL的图片对象
 */
export const createImageWithPreview = (file: File) => {
  return {
    id: Date.now().toString() + Math.random().toString(),
    file,
    url: URL.createObjectURL(file),
    name: file.name
  }
}
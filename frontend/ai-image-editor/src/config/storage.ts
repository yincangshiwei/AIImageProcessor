const ABSOLUTE_URL_REGEX = /^https?:\/\//i

export const ASSISTANT_COVER_BASE_URL =
  'https://yh-server-1325210923.cos.accelerate.myqcloud.com/AIImageProcessor'

export const isAbsoluteUrl = (value?: string | null): boolean => {
  return ABSOLUTE_URL_REGEX.test((value ?? '').trim())
}

const buildCosUrl = (value?: string | null): string => {
  if (!value) {
    return ''
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (ABSOLUTE_URL_REGEX.test(trimmed)) {
    return trimmed
  }
  return `${ASSISTANT_COVER_BASE_URL}/${trimmed.replace(/^\/+/u, '')}`
}

export const resolveCoverUrl = (value?: string | null): string => buildCosUrl(value)
export const resolveStorageUrl = (value?: string | null): string => buildCosUrl(value)


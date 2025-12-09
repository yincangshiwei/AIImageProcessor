import { Image as ImageIcon, Video as VideoIcon } from 'lucide-react'
import { AssistantModelDefinition } from '../types'

export type CoverTypeValue = 'image' | 'video' | 'gif'

export const COVER_TYPE_META: Record<CoverTypeValue, { label: string; description: string; Icon: typeof ImageIcon }> = {
  image: {
    label: '图像',
    description: '静态封面与通用图像能力',
    Icon: ImageIcon
  },
  video: {
    label: '视频',
    description: '视频脚本与动效输出能力',
    Icon: VideoIcon
  },
  gif: {
    label: '动图',
    description: '动图与循环动效封面',
    Icon: ImageIcon
  }
}

export const normalizeCoverType = (value?: string | null): CoverTypeValue => {
  if (value === 'video') {
    return 'video'
  }
  if (value === 'gif') {
    return 'gif'
  }
  return 'image'
}

export const deriveSupportFlags = (coverType: CoverTypeValue) => ({
  supportsImage: coverType !== 'video',
  supportsVideo: coverType === 'video'
})

export type MediaModelValue = Extract<AssistantModelDefinition['modelType'], 'image' | 'video'>

export const MEDIA_MODEL_META: Record<MediaModelValue, { label: string }> = {
  image: {
    label: '图像模型'
  },
  video: {
    label: '视频模型'
  }
}

export const MEDIA_MODEL_ORDER: MediaModelValue[] = ['image', 'video']

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Image as ImageIcon, AlertCircle } from 'lucide-react'

interface UploadedImage {
  id: string
  file: File
  url: string
  name: string
}

interface ImageUploaderProps {
  maxFiles?: number
  onImagesChange: (images: UploadedImage[]) => void
  className?: string
  multiple?: boolean
  images?: UploadedImage[]
}

export default function ImageUploader({ 
  maxFiles = 5, 
  onImagesChange, 
  className = '',
  multiple = true,
  images = []
}: ImageUploaderProps) {
  const [error, setError] = useState('')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError('')
    
    // 检查文件数量
    if (images.length + acceptedFiles.length > maxFiles) {
      setError(`最多只能上传 ${maxFiles} 张图片`)
      return
    }

    const newImages = acceptedFiles.map(file => {
      const id = Math.random().toString(36).substr(2, 9)
      return {
        id,
        file,
        url: URL.createObjectURL(file),
        name: file.name
      }
    })

    const updatedImages = multiple ? [...images, ...newImages] : newImages
    onImagesChange(updatedImages)
  }, [images, maxFiles, multiple, onImagesChange])

  const removeImage = (id: string) => {
    const updatedImages = images.filter(img => {
      if (img.id === id) {
        URL.revokeObjectURL(img.url) // 清理内存
        return false
      }
      return true
    })
    onImagesChange(updatedImages)
  }

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif']
    },
    maxFiles: maxFiles - images.length,
    disabled: images.length >= maxFiles
  })

  return (
    <div className={className}>
      {/* Upload Zone */}
      {images.length < maxFiles && (
        <div
          {...getRootProps()}
          className={`upload-zone p-8 text-center cursor-pointer ${
            isDragActive ? 'drag-active border-neon-blue' : ''
          } ${
            isDragReject ? 'border-red-500' : ''
          }`}
        >
          <input {...getInputProps()} />
          
          <div className="mb-4">
            <Upload className={`w-12 h-12 mx-auto mb-4 ${
              isDragActive ? 'text-neon-blue' : 'text-gray-500'
            }`} />
            
            {isDragActive ? (
              <p className="text-neon-blue font-medium">
                释放以上传图片...
              </p>
            ) : (
              <div>
                <p className="text-gray-400 mb-2">
                  拖放图片到此处，或点击选择文件
                </p>
                <p className="text-sm text-gray-500">
                  支持 PNG, JPG, WEBP 格式，最多 {maxFiles} 张
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" />
          <span className="text-red-400 text-sm">{error}</span>
        </div>
      )}



    </div>
  )
}
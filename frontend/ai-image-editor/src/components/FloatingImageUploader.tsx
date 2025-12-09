import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Plus } from 'lucide-react';

interface FloatingImageUploaderProps {
  onAddFiles: (files: File[]) => void;
  maxFiles?: number | null;
  imageCount: number;
  className?: string;
  enforceLimit?: boolean;
  showUsageHint?: boolean;
}

export default function FloatingImageUploader({
  onAddFiles,
  maxFiles = 5,
  imageCount,
  className = '',
  enforceLimit = true,
  showUsageHint = true,
}: FloatingImageUploaderProps) {
  const limitedMax = typeof maxFiles === 'number' && Number.isFinite(maxFiles) ? maxFiles : null;
  const shouldEnforceLimit = enforceLimit && limitedMax !== null;

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (shouldEnforceLimit && limitedMax !== null) {
        const remainingSlots = limitedMax - imageCount;
        if (remainingSlots <= 0) {
          alert(`最多只能上传 ${limitedMax} 张图片`);
          return;
        }
        const filesToUse = acceptedFiles.slice(0, remainingSlots);
        if (acceptedFiles.length > remainingSlots) {
          alert(`最多只能上传 ${limitedMax} 张图片`);
        }
        onAddFiles(filesToUse);
        return;
      }

      onAddFiles(acceptedFiles);
    },
    [imageCount, limitedMax, onAddFiles, shouldEnforceLimit]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
    },
    noKeyboard: true,
    disabled: shouldEnforceLimit && limitedMax !== null && imageCount >= limitedMax,
  });

  if (shouldEnforceLimit && limitedMax !== null && imageCount >= limitedMax) {
    return null;
  }

  return (
    <div className={className} {...getRootProps({ className: 'dropzone' })}>
      <input {...getInputProps()} />
      <div
        className={`relative w-20 h-[100px] flex-shrink-0 rounded-lg bg-[#3a3a4c] hover:bg-[#4a4a5c] transition-colors cursor-pointer flex items-center justify-center transform -rotate-6 hover:rotate-0 ${isDragActive ? 'scale-110 rotate-0 bg-neon-blue' : ''}`}
        style={{ transition: 'transform 0.2s ease-in-out, background-color 0.2s' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Plus className="w-8 h-8 text-gray-400" />
        </div>
        {showUsageHint && shouldEnforceLimit && limitedMax !== null && (
          <div className="absolute bottom-2 right-2 text-xs text-gray-400">
            {imageCount}/{limitedMax}
          </div>
        )}
      </div>
    </div>
  );
}

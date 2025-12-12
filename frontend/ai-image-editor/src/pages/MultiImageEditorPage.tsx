import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import NavBar from '../components/NavBar'
import GenerationResultPanel from '../components/GenerationResultPanel'
import FloatingImageUploader from '../components/FloatingImageUploader'
import BottomGeneratePanel from '../components/BottomGeneratePanel'
import ImageEditModal from '../components/ImageEditModal'
import ModeNavigationPanel from '../components/ModeNavigationPanel'
import { MODE_NAVIGATION_TABS } from '../constants/modeTabs'
import { urlsToFiles } from '../utils/imageUtils'
import { SMART_ASPECT_VALUE, ResolutionId, RESOLUTION_TO_IMAGE_SIZE } from '../services/modelCapabilities'
import {
  Wand2,
  Edit3,
  Edit,
  Trash2
} from 'lucide-react'


type UploadedImage = { id: string; file: File; url: string; name: string }

const MAX_MULTI_IMAGE_COUNT = 5;



export default function MultiImageEditorPage() {
  const { user, refreshUserInfo } = useAuth()
  const { api } = useApi()

  // 编辑器状态
  const [images, setImages] = useState<UploadedImage[]>([])
  const [prompt, setPrompt] = useState('')
  const [outputCount, setOutputCount] = useState(1)
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-pro')
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(SMART_ASPECT_VALUE)
  const [selectedResolutionId, setSelectedResolutionId] = useState<ResolutionId>('standard')
  
  // UI状态

  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<string[]>([]) // 保留，用于右侧面板临时展示
  const [showResults, setShowResults] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<string[]>([]) // 新增：用于存储生成记录
  const [showGenerationPanel, setShowGenerationPanel] = useState(false) // 新增：控制生成记录面板的显示
  const [generatingProgress, setGeneratingProgress] = useState(0)
  
  // 多图模式特有状态
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0)
  
  // 图片编辑模态框状态
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null)
  const [currentEditImage, setCurrentEditImage] = useState<string>('')
  const [currentEditImageId, setCurrentEditImageId] = useState<string>('')

  const appendImagesToState = (incomingFiles: File[]) => {
    if (!incomingFiles.length) return;

    setImages(prev => {
      const remainingSlots = MAX_MULTI_IMAGE_COUNT - prev.length;

      if (remainingSlots <= 0) {
        alert(`最多只能上传 ${MAX_MULTI_IMAGE_COUNT} 张图片`);
        return prev;
      }

      const filesToUse = incomingFiles.slice(0, remainingSlots);
      if (incomingFiles.length > remainingSlots) {
        alert(`最多只能上传 ${MAX_MULTI_IMAGE_COUNT} 张图片`);
      }

      const mapped = filesToUse.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        url: URL.createObjectURL(file),
        name: file.name
      }));

      return [...prev, ...mapped];
    });
  };

  const hasPromptInput = prompt.trim().length > 0;
  const hasUploadedImages = images.length > 0;
  const creditsRequired = outputCount * 10;
  const totalAvailableCredits = user ? user.availableCredits ?? (user.teamCredits ?? 0) + (user.credits ?? 0) : 0;
  const hasEnoughCredits = totalAvailableCredits >= creditsRequired;
  const canTriggerGeneration = Boolean(user) && !generating && hasEnoughCredits && (hasPromptInput || hasUploadedImages);

  // 编辑图片
  const handleEditImage = (index: number) => {
    setCurrentEditIndex(index)
    setCurrentEditImage(images[index].url)
    setCurrentEditImageId(images[index].id)
    setEditModalOpen(true)
  }

  // 删除图片
  const handleDeleteImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index)
    setImages(newImages)
    if (selectedImageIndex >= newImages.length) {
      setSelectedImageIndex(Math.max(0, newImages.length - 1))
    }
  }

  // 保存编辑后的图片
  const handleSaveEditedImage = (editedImageData: string) => {
    if (currentEditIndex !== null) {
      fetch(editedImageData)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `edited_image_${Date.now()}.png`, { type: 'image/png' })
          const newImages = [...images]
          newImages[currentEditIndex] = {
            ...newImages[currentEditIndex],
            file,
            url: editedImageData
          }
          setImages(newImages)
        })
    }
    setEditModalOpen(false)
    setCurrentEditIndex(null)
    setCurrentEditImage('')
    setCurrentEditImageId('')
  }

  // 处理生成
  const handleGenerate = async () => {
    if (!user) return;

    if (!hasPromptInput && !hasUploadedImages) {
      alert('请至少输入提示词或上传图片');
      return;
    }

    if (!hasEnoughCredits) {
      alert(
        `积分不足，需要 ${creditsRequired} 积分，团队余额 ${user?.teamCredits ?? 0} · 个人余额 ${user?.credits ?? 0}`
      );
      return;
    }

    setGenerating(true);
    setGeneratingProgress(5);
    setResults([]);
    setShowResults(false);
    setShowGenerationPanel(false);

    try {
      let imageKeys: string[] = [];
      if (hasUploadedImages) {
        setGeneratingProgress(15);
        const uploadResponse = await api.uploadImages(images.map(image => image.file), user.code);
        if (!uploadResponse.success) {
          throw new Error(uploadResponse.message || '图片上传失败');
        }
        imageKeys = uploadResponse.files.map(file => file.storage_key);
      }

      setGeneratingProgress(hasUploadedImages ? 35 : 25);

      const request: GenerateRequest = {
        auth_code: user.code,
        module_name: 'AI图像:多图模式',
        media_type: 'image',
        prompt_text: prompt.trim(),
        output_count: outputCount,
        image_paths: imageKeys,
        model_name: selectedModel,
        aspect_ratio: selectedAspectRatio,
        image_size: RESOLUTION_TO_IMAGE_SIZE[selectedResolutionId] ?? '1K',
        mode_type: 'multi'
      };

      const response = await api.generateImages(request);
      if (!response.success || !response.output_images?.length) {
        throw new Error(response.message || '生成失败，请稍后再试');
      }

      const generated = response.output_images ?? [];
      setGeneratingProgress(90);
      setGeneratedImages((prev) => [...generated, ...prev].slice(0, 30));
      setShowGenerationPanel(true);
      setGeneratingProgress(100);
      await refreshUserInfo();
    } catch (error) {
      console.error('生成失败:', error);
      alert(error instanceof Error ? error.message : '生成失败，请稍后再试');
    } finally {
      setGenerating(false);
      setGeneratingProgress(0);
    }
  };


  const handleAddFiles = (files: File[]) => {
    appendImagesToState(files)
  }

  // 使用生成的图片
  const handleUseGeneratedImage = async (imageUrl: string) => {
    try {
      const files = await urlsToFiles([imageUrl]);
      if (files.length === 0) {
        throw new Error("Image conversion failed.");
      }

      appendImagesToState(files);
    } catch (error) {
      console.error("Error converting URL to file or updating state:", error);
      alert("无法使用这张图片，请稍后再试。");
    }
  };

  // 下载结果
  const downloadResult = (imageUrl: string, index: number) => {
    const link = document.createElement('a')
    link.href = imageUrl
    link.download = `ai-result-${index + 1}.png`
    link.click()
  }

  return (
    <div className="min-h-screen">
      <NavBar />
      
      <main className="pl-0 lg:pl-[120px] xl:pl-[150px] px-4 md:px-8 lg:px-12 py-8">
        <div className="mx-auto max-w-7xl">
        <ModeNavigationPanel modes={MODE_NAVIGATION_TABS} />

        <div className="pb-20">
          <div className="relative">
            {images.length > 0 && (
              <section className="relative py-8">
                <div className="pointer-events-none absolute inset-0 -z-10">
                  <div className="absolute -top-12 left-1/4 h-64 w-64 rounded-full bg-[#7d9dff]/30 blur-[120px]" />
                  <div className="absolute -bottom-16 right-1/6 h-72 w-72 rounded-full bg-[#ff9fd8]/25 blur-[140px]" />
                  <div className="absolute inset-0 rounded-[48px] border border-white/5 bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-40" />
                </div>

                <div className="relative z-10 space-y-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.45em] text-white/50 flex items-center gap-3">
                        <span className="h-px w-10 bg-white/40" />
                        Visual Stack
                      </p>
                      <h4 className="text-2xl font-semibold text-white flex items-center gap-3">
                        <Edit3 className="w-6 h-6 text-neon-green" />
                        多图画布矩阵
                      </h4>
                      <p className="text-sm text-white/60">
                        点击任意卡片聚焦编辑，悬停即可调出操作。
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.35em] text-white/60">
                      <span className="glass-chip bg-white/10">
                        已上传 · {images.length}/{MAX_MULTI_IMAGE_COUNT}
                      </span>
                      <span className="glass-chip bg-white/5 text-neon-blue">
                        Active Layer {String(selectedImageIndex + 1).padStart(2, '0')}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5 lg:gap-6">
                    {images.map((image, index) => {
                      const isSelected = selectedImageIndex === index
                      const layerLabel = String(index + 1).padStart(2, '0')
                      const imageDisplayName = image.name.replace(/\.[^/.]+$/, '')

                      return (
                        <div key={image.id} className="relative group">
                          <div
                            className={`absolute -inset-3 rounded-[32px] blur-3xl transition-opacity duration-500 ${
                              isSelected ? 'opacity-80 bg-[#8ab8ff]/50' : 'opacity-30 group-hover:opacity-60 bg-[#ff9ee2]/35'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedImageIndex(index)}
                            className={`relative z-10 w-full aspect-square rounded-[28px] overflow-hidden border border-white/10 bg-white/5 backdrop-blur-3xl transition-all duration-500 shadow-[0_25px_45px_rgba(3,5,23,0.45)] ${
                              isSelected
                                ? 'border-neon-blue/70 ring-2 ring-neon-blue/60 scale-[1.01]'
                                : 'hover:border-white/40 hover:scale-[1.01]'
                            }`}
                          >
                            <span className="absolute inset-0 bg-white/[0.04]" />
                            <span className="absolute inset-px rounded-[26px] bg-gradient-to-br from-white/25 via-transparent to-transparent opacity-70" />
                            <img
                              src={image.url}
                              alt={image.name}
                              className="relative z-10 h-full w-full object-contain"
                            />
                            <span className="absolute inset-0 bg-gradient-to-b from-transparent via-black/25 to-black/70 opacity-60" />
                            <div
                              className={`pointer-events-none absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300 ${
                                isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                            >
                              <div className="rounded-b-[26px] border-t border-white/15 bg-black/25 backdrop-blur-sm px-5 py-3 text-left text-white/95">
                                <p className="text-sm font-medium truncate">{imageDisplayName}</p>
                              </div>
                            </div>
                          </button>

                          <div
                            className={`absolute top-4 right-4 z-20 flex gap-2 transition-opacity duration-300 ${
                              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditImage(index)
                              }}
                              className="w-10 h-10 rounded-full border border-white/40 bg-gradient-to-br from-[#7af3ff] via-[#4d7dff] to-[#a855f7] text-white ring-1 ring-white/40 transition-all duration-300 flex items-center justify-center shadow-[0_18px_30px_rgba(5,8,25,0.55)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                              title="编辑图片"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteImage(index)
                              }}
                              className="w-10 h-10 rounded-full border border-white/35 bg-gradient-to-br from-[#ffd4a3] via-[#ff8f70] to-[#ff5f6d] text-white ring-1 ring-white/30 transition-all duration-300 flex items-center justify-center shadow-[0_18px_30px_rgba(5,8,25,0.55)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                              title="删除图片"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
        
        <BottomGeneratePanel
          prompt={prompt}
          onPromptChange={setPrompt}
          generating={generating}
          generatingProgress={generatingProgress}
          outputCount={outputCount}
          onChangeOutputCount={setOutputCount}
          onAddFiles={handleAddFiles}
          imageCount={images.length}
          maxFiles={MAX_MULTI_IMAGE_COUNT}
          initialModel={selectedModel}
          onModelChange={setSelectedModel}
          onAspectRatioChange={setSelectedAspectRatio}
          onResolutionChange={setSelectedResolutionId}
          onGenerate={handleGenerate}
          canGenerate={canTriggerGeneration}
          canOpenHistory={generatedImages.length > 0}
          onOpenHistory={() => setShowGenerationPanel(true)}
        />

        
        <ImageEditModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false)
            setCurrentEditIndex(null)
            setCurrentEditImage('')
            setCurrentEditImageId('')
          }}
          imageSrc={currentEditImage}
          imageId={currentEditImageId || undefined}
          onSave={handleSaveEditedImage}
        />

        <GenerationResultPanel
          isOpen={showGenerationPanel}
          onClose={() => setShowGenerationPanel(false)}
          generatedImages={generatedImages}
          onUseImage={handleUseGeneratedImage}
          onDownloadImage={downloadResult}
          onRegenerate={handleGenerate}
        />
      </div>
      </main>
    </div>
  )
}
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import NavBar from '../components/NavBar'
import GenerationResultPanel from '../components/GenerationResultPanel'
import FloatingImageUploader from '../components/FloatingImageUploader'
import BottomGeneratePanel from '../components/BottomGeneratePanel'
import ImageEditModal from '../components/ImageEditModal'
import { urlsToFiles } from '../utils/imageUtils'
import {
  Layers,
  Images,
  Wand2,
  Edit3,
  Edit,
  Trash2
} from 'lucide-react'
import { Link } from 'react-router-dom'

type UploadedImage = { id: string; file: File; url: string; name: string }

const MAX_MULTI_IMAGE_COUNT = 5;

const createPlaceholderImage = (text: string) => {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P8DwQACfsD/QxL7wAAAABJRU5ErkJggg==';
  }

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#1f2937');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 48px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const displayText = text.trim() ? text.trim().slice(0, 60) : 'AI 生成中';
  const lines = displayText.match(/.{1,12}/g) ?? [displayText];
  const lineHeight = 56;
  const startY = size / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    ctx.fillText(line, size / 2, startY + index * lineHeight);
  });

  return canvas.toDataURL('image/png');
};

export default function MultiImageEditorPage() {
  const { user, refreshUserInfo } = useAuth()
  const { api } = useApi()

  // 编辑器状态
  const [images, setImages] = useState<UploadedImage[]>([])
  const [prompt, setPrompt] = useState('')
  const [outputCount, setOutputCount] = useState(1)
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-pro')
  
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
  const hasEnoughCredits = (user?.credits || 0) >= creditsRequired;
  const canTriggerGeneration = Boolean(user) && !generating && hasEnoughCredits && (hasPromptInput || hasUploadedImages);

  // 编辑图片
  const handleEditImage = (index: number) => {
    setCurrentEditIndex(index)
    setCurrentEditImage(images[index].url)
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
  }

  // 处理生成
  const handleGenerate = async () => {
    if (!user) return;

    if (!hasPromptInput && !hasUploadedImages) {
      alert('请至少输入提示词或上传图片');
      return;
    }

    if (!hasEnoughCredits) {
      alert(`积分不足，需要 ${creditsRequired} 积分，当前余额 ${user?.credits ?? 0} 积分`);
      return;
    }

    console.log('Using model for generation:', selectedModel);

    setGenerating(true);
    setGeneratingProgress(0);
    setResults([]);
    setShowResults(false);
    setShowGenerationPanel(false);

    setTimeout(() => {
      const sourceImages = images.map(i => i.url);
      const fallbackPool =
        sourceImages.length === 0
          ? Array.from({ length: outputCount }, (_, index) =>
              createPlaceholderImage(`${prompt || 'AI 生成'}-${Date.now()}-${index + 1}`)
            )
          : [];
      const pool = sourceImages.length > 0 ? sourceImages : fallbackPool;

      if (pool.length === 0) {
        alert('生成失败，请稍后重试');
        setGenerating(false);
        return;
      }

      const mockResults = Array.from({ length: outputCount }, (_, i) => pool[i % pool.length]);

      setGeneratedImages((prev) => [...mockResults, ...prev].slice(0, 30));
      setShowGenerationPanel(true);
      setGenerating(false);
      setGeneratingProgress(100);
    }, 1000);
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
      
      <main className="pl-[130px] md:pl-[150px] px-4 md:px-8 lg:px-12 py-8">
        <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="cyber-card p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center">
                <Wand2 className="w-8 h-8 text-neon-blue mr-3" />
                AI 图像处理器
              </h1>
              <p className="text-gray-400">
                选择模式，上传图片，输入描述，创造令人惊叹的AI图像
              </p>
            </div>
            
            {/* Mode Switch */}
            <div className="mt-4 lg:mt-0">
              <div className="flex bg-cyber-gray rounded-lg p-1">
                <Link
                  to="/editor/multi"
                  className={`flex items-center px-4 py-2 rounded-lg transition-all bg-neon-blue text-white`}
                >
                  <Images className="w-4 h-4 mr-2" />
                  多图模式
                </Link>
                <Link
                  to="/editor/puzzle"
                  className={`flex items-center px-4 py-2 rounded-lg transition-all text-gray-400 hover:text-white`}
                >
                  <Layers className="w-4 h-4 mr-2" />
                  拼图模式
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="pb-20">
          {/* Main Editor Area */}
          <div>
            <div className="cyber-card">
              {/* Tab Content */}
              <div className="p-6">
                <div>
                  {/* 内容区 */}
                  <div>
                    {/* 选择要编辑的图片列表 */}
                    {images.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-4 flex items-center">
                          <Edit3 className="w-5 h-5 text-neon-green mr-2" />
                          选择要编辑的图片
                        </h4>
                        
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                          {images.map((image, index) => (
                            <div key={image.id} className="relative group">
                              <button
                                onClick={() => setSelectedImageIndex(index)}
                                className={`w-full aspect-square rounded-lg border-2 transition-all overflow-hidden ${
                                  selectedImageIndex === index
                                    ? 'border-neon-blue shadow-lg shadow-neon-blue/20'
                                    : 'border-gray-700 hover:border-gray-600'
                                }`}
                              >
                                <img
                                  src={image.url}
                                  alt={image.name}
                                  className="w-full h-full object-cover"
                                />
                                
                              </button>
                              
                              <div className={`absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 transition-opacity ${selectedImageIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <p className="text-xs truncate">图片 {index + 1}</p>
                                <p className="text-xs text-gray-300 truncate">{image.name}</p>
                              </div>
                              
                              <div className={`absolute top-2 right-2 transition-opacity flex gap-1 ${selectedImageIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleEditImage(index)
                                  }}
                                  className="w-6 h-6 bg-cyan-600 hover:bg-cyan-700 text-white rounded-full flex items-center justify-center transition-colors"
                                  title="编辑图片"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteImage(index)
                                  }}
                                  className="w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition-colors"
                                  title="删除图片"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
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
          }}
          imageSrc={currentEditImage}
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
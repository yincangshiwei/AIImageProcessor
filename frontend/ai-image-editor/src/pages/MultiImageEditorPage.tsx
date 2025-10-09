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

export default function MultiImageEditorPage() {
  const { user, refreshUserInfo } = useAuth()
  const { api } = useApi()

  // 编辑器状态
  const [images, setImages] = useState<UploadedImage[]>([])
  const [prompt, setPrompt] = useState('')
  const [outputCount, setOutputCount] = useState(1)
  
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
    if (!user) return
    
    if (!prompt.trim()) {
      alert('请输入提示词')
      return
    }
    
    if (images.length === 0) {
      alert('请先上传图片')
      return
    }
    
    // 检查积分
    const creditsNeeded = outputCount * 10;
    if (user.credits < creditsNeeded) {
      alert(`积分不足，需要 ${creditsNeeded} 积分，当前余额 ${user.credits} 积分`);
      return;
    }

    setGenerating(true);
    setGeneratingProgress(0);
    setResults([]);
    setShowResults(false);
    setShowGenerationPanel(false); // 先隐藏旧的面板

    // 模拟生成过程
    setTimeout(() => {
      const sourceImages = images.map(i => i.url) 

      if (sourceImages.length === 0) {
          alert("请先上传图片再进行生成。");
          setGenerating(false);
          return;
      }

      const mockResults = Array(outputCount)
        .fill(null)
        .map((_, i) => sourceImages[i % sourceImages.length]);
      
      setGeneratedImages(mockResults);
      setShowGenerationPanel(true);
      setGenerating(false);
      setGeneratingProgress(100);
    }, 1000);
  };

  const handleAddFiles = (files: File[]) => {
    const newImages = files.map(file => {
      const id = Math.random().toString(36).substr(2, 9)
      return {
        id,
        file,
        url: URL.createObjectURL(file),
        name: file.name
      }
    })
    const updatedImages = [...images, ...newImages].slice(0, 5) // Enforce max files
    setImages(updatedImages)
  }

  // 使用生成的图片
  const handleUseGeneratedImage = async (imageUrl: string) => {
    try {
      const files = await urlsToFiles([imageUrl]);
      if (files.length === 0) {
        throw new Error("Image conversion failed.");
      }
      const file = files[0];
      
      const newImage: UploadedImage = {
        id: `gen_${Date.now()}`,
        file: file,
        url: imageUrl,
        name: 'generated_image.png'
      };
      
      setImages([newImage]);

      setShowGenerationPanel(false);
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
      <NavBar className="mb-6" />
      
      <div className="container mx-auto max-w-7xl px-4">
        {/* Header */}
        <div className="cyber-card p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center">
                <Wand2 className="w-8 h-8 text-neon-blue mr-3" />
                AI 图像编辑器
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
          maxFiles={5}
          onGenerate={handleGenerate}
          canGenerate={!(
            generating ||
            !prompt.trim() ||
            images.length === 0 ||
            ((user?.credits || 0) < outputCount * 10)
          )}
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
    </div>
  )
}
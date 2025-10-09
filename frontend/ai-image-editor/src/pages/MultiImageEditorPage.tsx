import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import NavBar from '../components/NavBar'
import GenerationResultPanel from '../components/GenerationResultPanel'
import FloatingImageUploader from '../components/FloatingImageUploader'
import ImageEditModal from '../components/ImageEditModal'
import { urlsToFiles } from '../utils/imageUtils'
import {
  Layers,
  Images,
  Wand2,
  Edit3,
  Edit,
  Trash2,
  ArrowUp,
  Clock,
  Loader,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight
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

  // 新增：底部悬浮生成栏的状态
  const [aspectRatio, setAspectRatio] = useState('智能')
  const [showAspectRatioDropdown, setShowAspectRatioDropdown] = useState(false)
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    const handleDragMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartRef.current.startX;
        const dy = e.clientY - dragStartRef.current.startY;
        setDragOffset({
            x: dragStartRef.current.initialX + dx,
            y: dragStartRef.current.initialY + dy,
        });
    };

    const handleDragMouseUp = () => {
        if (isDragging) {
            setIsDragging(false);
            document.body.style.cursor = 'default';
        }
    };

    window.addEventListener('mousemove', handleDragMouseMove);
    window.addEventListener('mouseup', handleDragMouseUp);

    return () => {
        window.removeEventListener('mousemove', handleDragMouseMove);
        window.removeEventListener('mouseup', handleDragMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    
    if (!isPanelCollapsed && (target.closest('button, a, input, textarea') || window.getComputedStyle(target).cursor === 'pointer')) {
        return;
    }
    
    setIsDragging(true);
    dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        initialX: dragOffset.x,
        initialY: dragOffset.y,
    };
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  };

  // 关闭下拉菜单的点击事件监听
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowAspectRatioDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

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
                                
                                {selectedImageIndex === index && (
                                  <div className="absolute inset-0 bg-neon-blue/20 flex items-center justify-center">
                                    <div className="w-8 h-8 bg-neon-blue rounded-full flex items-center justify-center">
                                      <Edit className="w-4 h-4 text-white" />
                                    </div>
                                  </div>
                                )}
                              </button>
                              
                              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-xs truncate">图片 {index + 1}</p>
                                <p className="text-xs text-gray-300 truncate">{image.name}</p>
                              </div>
                              
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
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
        
        {/* Floating Generate Panel */}
        <div
            className="fixed bottom-6 left-1/2 z-50"
            style={{
                transform: `translateX(-50%) translate(${dragOffset.x}px, ${dragOffset.y}px)`,
            }}
            onMouseDown={handleMouseDown}
        >
            <div
                className={`
                    cyber-card bg-gray-800/80 backdrop-blur-md rounded-xl shadow-2xl shadow-black/50
                    relative
                    ${isPanelCollapsed ? 'cursor-grab' : 'cursor-grab'}
                `}
            >
                <div
                    className={`
                        transition-all duration-300 ease-in-out
                        ${isPanelCollapsed ? 'w-[48px] h-[48px]' : 'w-[850px] max-w-[85vw] p-4'}
                    `}
                >
                    <div
                        className={`
                            w-full h-full
                            transition-opacity duration-200
                            ${isPanelCollapsed ? 'opacity-0' : 'opacity-100'}
                        `}
                    >
                        <div className="flex items-start gap-4">
                          <FloatingImageUploader
                            onAddFiles={handleAddFiles}
                            imageCount={images.length}
                            maxFiles={5}
                          />
                          <div className="flex-grow min-w-0">
                              <textarea
                                  value={prompt}
                                  onChange={(e) => setPrompt(e.target.value)}
                                  placeholder="请输入图片生成的提示词, 例如: 做一张“中秋节”海报"
                                  rows={3}
                                  className="cyber-input w-full resize-none bg-transparent border-none focus:ring-0 p-0 text-base placeholder-gray-500 text-gray-200"
                                  disabled={generating}
                              />
                          </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-gray-700/80 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="relative dropdown-container">
                              <button
                                onClick={(e) => { e.stopPropagation(); setShowAspectRatioDropdown(!showAspectRatioDropdown); }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg text-sm transition-colors"
                              >
                                <span>比例: {aspectRatio}</span>
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              {showAspectRatioDropdown && (
                                <div className="absolute bottom-full mb-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10 w-32 max-h-60 overflow-y-auto">
                                  {['智能', '1:1', '3:4', '2:3', '9:16', '4:3', '3:2', '16:9', '21:9'].map(ratio => (
                                    <button
                                      key={ratio}
                                      onClick={(e) => { e.stopPropagation(); setAspectRatio(ratio); setShowAspectRatioDropdown(false); }}
                                      className={`w-full px-4 py-2 text-left hover:bg-gray-700/50 transition-colors text-sm ${
                                        aspectRatio === ratio ? 'text-neon-blue font-semibold' : 'text-gray-300'
                                      }`}
                                    >
                                      {ratio}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-300">数量:</span>
                              <div className="flex items-center bg-gray-700/50 rounded-lg">
                                <button onClick={(e) => { e.stopPropagation(); setOutputCount(Math.max(1, outputCount - 1)); }} className="px-2 py-1 text-gray-300 hover:bg-gray-600/50 rounded-l-lg transition-colors">-</button>
                                <span className="px-3 text-sm text-white font-medium">{outputCount}</span>
                                <button onClick={(e) => { e.stopPropagation(); setOutputCount(Math.min(4, outputCount + 1)); }} className="px-2 py-1 text-gray-300 hover:bg-gray-600/50 rounded-r-lg transition-colors">+</button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); if (generatedImages.length > 0) setShowGenerationPanel(true); }}
                              disabled={generatedImages.length === 0}
                              className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg hover:scale-105 transition-all"
                              title={generatedImages.length > 0 ? '生成记录' : '暂无生成记录'}
                            >
                              <Clock className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleGenerate(); }}
                              disabled={generating || !prompt.trim() || images.length === 0 || (user?.credits || 0) < outputCount * 10}
                              className="w-10 h-10 bg-neon-blue rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg shadow-neon-blue/30 hover:scale-105 transition-all"
                              title="生成"
                            >
                              {generating ? (
                                <Loader className="w-5 h-5 animate-spin" />
                              ) : (
                                <ArrowUp className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </div>
                        {generating && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden">
                              <div className="bg-neon-blue h-full" style={{ width: `${generatingProgress}%`, transition: 'width 0.3s ease-in-out' }}></div>
                          </div>
                        )}
                    </div>
                </div>

                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsPanelCollapsed(!isPanelCollapsed);
                    }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-gray-700/80 text-white hover:bg-gray-600 flex items-center justify-center z-10"
                    title={isPanelCollapsed ? "展开" : "收起"}
                >
                    {isPanelCollapsed ? <ChevronsLeft /> : <ChevronsRight />}
                </button>
            </div>
        </div>
        
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
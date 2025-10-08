import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import { useCollage } from '../contexts/CollageContext'
import NavBar from '../components/NavBar'
import ImageUploader from '../components/ImageUploader'
import CanvasEditor from '../components/CanvasEditor'
import CollageCanvas from '../components/CollageCanvas'
import CaseBrowser from '../components/CaseBrowser'
import ImageEditModal from '../components/ImageEditModal'
import { urlsToFiles, createImageWithPreview } from '../utils/imageUtils'
import {
  Layers,
  Images,
  Wand2,
  Settings,
  Play,
  Lightbulb,
  Eye,
  Download,
  Loader,
  Plus,
  Edit3,
  Edit,
  Trash2,
  Palette
} from 'lucide-react'
import { TemplateCase } from '../types'

type EditorMode = 'multi' | 'puzzle'
type PuzzleMode = 'custom' | 'stitching' // 拼图模式的子模式
type UploadedImage = { id: string; file: File; url: string; name: string }

export default function EditorPage() {
  const { user, refreshUserInfo } = useAuth()
  const { api } = useApi()
  const { 
    canvasState, 
    drawingTools, 
    addImages, 
    setCanvasSize, 
    setBrushColor, 
    setBrushSize,
    arrangeAsGrid,
    resetCanvas 
  } = useCollage()
  
  // 编辑器状态
  const [mode, setMode] = useState<EditorMode>('multi')
  const [puzzleMode, setPuzzleMode] = useState<PuzzleMode>('custom') // 拼图子模式
  const [images, setImages] = useState<UploadedImage[]>([])
  const [prompt, setPrompt] = useState('')
  const [outputCount, setOutputCount] = useState(1)
  const [canvasData, setCanvasData] = useState('')
  
  // 图像拼接专用状态
  const [stitchingImages, setStitchingImages] = useState<UploadedImage[]>([])
  const [stitchingLayout, setStitchingLayout] = useState<string>('2h') // 2h=左右, 2v=上下, 3l=L型等
  const [outputSize, setOutputSize] = useState<number>(1024) // 输出尺寸
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff') // 背景色
  const [previewImage, setPreviewImage] = useState<string>('') // 实时预览图
  
  // UI状态
  const [activeTab, setActiveTab] = useState<'editor' | 'cases'>('editor')
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<string[]>([])
  const [showResults, setShowResults] = useState(false)
  const [generatingProgress, setGeneratingProgress] = useState(0)
  const [showCaseBrowser, setShowCaseBrowser] = useState(false)
  
  // 多图模式特有状态
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0)
  
  // 图片编辑模态框状态
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [currentEditIndex, setCurrentEditIndex] = useState<number | null>(null)
  const [currentEditImage, setCurrentEditImage] = useState<string>('')

  // UI控制状态 - 下拉菜单
  const [showRatioDropdown, setShowRatioDropdown] = useState(false)
  const [showGridDropdown, setShowGridDropdown] = useState(false)
  const [selectedRatio, setSelectedRatio] = useState<{w: number, h: number, label: string}>({w: 1024, h: 1024, label: '1:1'})
  const [isUpdatingCanvas, setIsUpdatingCanvas] = useState(false)

  // 处理模式切换
  const handleModeChange = (newMode: EditorMode) => {
    if (generating) return
    setMode(newMode)
    if (newMode === 'multi') {
      setImages([]) // 清空多图模式的图片
    } else if (newMode === 'puzzle') {
      setPuzzleMode('custom') // 默认进入自定义画布模式
    }
    // 拼图模式的状态由CollageContext维护，不需要清空
    setResults([]) // 清空结果
    setShowResults(false)
    setSelectedImageIndex(0)
  }

  // 处理拼图子模式切换
  const handlePuzzleModeChange = (newPuzzleMode: PuzzleMode) => {
    setPuzzleMode(newPuzzleMode)
    setResults([])
    setShowResults(false)
  }

  // 同步图像拼接输出尺寸到画布尺寸
  useEffect(() => {
    if (mode === 'puzzle' && puzzleMode === 'stitching') {
      setCanvasSize({ width: outputSize, height: outputSize });
    }
  }, [outputSize, mode, puzzleMode, setCanvasSize]);

  // 处理案例选择 - 完整版本
  const handleCaseSelect = async (caseItem: TemplateCase, selectMode: 'full' | 'prompt-only') => {
    if (selectMode === 'full') {
      try {
        setPrompt(caseItem.prompt_text)
        setMode(caseItem.mode_type as EditorMode)
        setOutputCount(1)
        
        // 加载案例图片
        if (caseItem.input_images && caseItem.input_images.length > 0) {
          console.log('开始加载模板图片:', caseItem.input_images)
          
          const templateFiles = await urlsToFiles(caseItem.input_images, `template_${caseItem.id}`)
          
          if (caseItem.mode_type === 'multi') {
            const imageObjects = templateFiles.map(file => createImageWithPreview(file))
            setImages(imageObjects)
          } else if (caseItem.mode_type === 'puzzle') {
            addImages(templateFiles)
          }
          
          console.log(`成功加载${templateFiles.length}张模板图片`)
        }
      } catch (error) {
        console.error('加载模板图片失败:', error)
        alert('加载模板图片失败，请稍后重试')
        setPrompt(caseItem.prompt_text)
        setMode(caseItem.mode_type as EditorMode)
      }
    } else {
      setPrompt(caseItem.prompt_text)
    }
    setShowCaseBrowser(false)
    setActiveTab('editor') // 自动切换回编辑器界面
  }

  // 图像拼接工具函数
  const generateStitchedImage = (images: UploadedImage[], layout: string, size: number, bgColor: string): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      canvas.width = size;
      canvas.height = size;
      
      // 设置背景色
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, size, size);
      
      const loadImagePromises = images.map(img => {
        return new Promise<HTMLImageElement>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = img.url;
        });
      });
      
      Promise.all(loadImagePromises).then((loadedImages) => {
        // 根据布局类型计算位置和尺寸
        const padding = size * 0.02; // 2%的间距
        
        if (layout === '2h' && loadedImages.length >= 2) {
          // 左右排列
          const imgWidth = (size - padding * 3) / 2;
          const imgHeight = size - padding * 2;
          drawScaledImage(ctx, loadedImages[0], padding, padding, imgWidth, imgHeight);
          drawScaledImage(ctx, loadedImages[1], padding * 2 + imgWidth, padding, imgWidth, imgHeight);
        } else if (layout === '2v' && loadedImages.length >= 2) {
          // 上下排列
          const imgWidth = size - padding * 2;
          const imgHeight = (size - padding * 3) / 2;
          drawScaledImage(ctx, loadedImages[0], padding, padding, imgWidth, imgHeight);
          drawScaledImage(ctx, loadedImages[1], padding, padding * 2 + imgHeight, imgWidth, imgHeight);
        } else if (layout === '3l' && loadedImages.length >= 3) {
          // L型布局 - 左侧一大图，右侧两小图
          const leftWidth = (size - padding * 3) * 0.6;
          const rightWidth = (size - padding * 3) * 0.4;
          const halfHeight = (size - padding * 3) / 2;
          
          drawScaledImage(ctx, loadedImages[0], padding, padding, leftWidth, size - padding * 2);
          drawScaledImage(ctx, loadedImages[1], padding * 2 + leftWidth, padding, rightWidth, halfHeight);
          drawScaledImage(ctx, loadedImages[2], padding * 2 + leftWidth, padding * 2 + halfHeight, rightWidth, halfHeight);
        } else if (layout === '3r' && loadedImages.length >= 3) {
          // L型布局 - 右侧一大图，左侧两小图
          const leftWidth = (size - padding * 3) * 0.4;
          const rightWidth = (size - padding * 3) * 0.6;
          const halfHeight = (size - padding * 3) / 2;
          
          drawScaledImage(ctx, loadedImages[0], padding, padding, leftWidth, halfHeight);
          drawScaledImage(ctx, loadedImages[1], padding, padding * 2 + halfHeight, leftWidth, halfHeight);
          drawScaledImage(ctx, loadedImages[2], padding * 2 + leftWidth, padding, rightWidth, size - padding * 2);
        }
        
        resolve(canvas.toDataURL('image/png'));
      });
    });
  };
  
  const drawScaledImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
    const imgAspect = img.width / img.height;
    const targetAspect = w / h;
    
    let drawWidth, drawHeight, drawX, drawY;
    
    // 保持原始比例，避免变形
    if (imgAspect > targetAspect) {
      // 图片较宽，以宽度为准适应容器
      drawWidth = w;
      drawHeight = w / imgAspect;
      drawX = x;
      drawY = y + (h - drawHeight) / 2;
    } else {
      // 图片较高或方形，以高度为准适应容器
      drawHeight = h;
      drawWidth = h * imgAspect;
      drawX = x + (w - drawWidth) / 2;
      drawY = y;
    }
    
    // 使用裁剪区域确保图片不超出边界
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    
    // 保持原始比例绘制图片
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  };

  // 实时预览生成 - 修改为生成完整尺寸的图片
  useEffect(() => {
    if (stitchingImages.length >= 2) {
      generateStitchedImage(stitchingImages, stitchingLayout, outputSize, backgroundColor)
        .then(previewUrl => {
          setPreviewImage(previewUrl);
        })
        .catch(() => {
          setPreviewImage('');
        });
    } else {
      setPreviewImage('');
    }
  }, [stitchingImages, stitchingLayout, outputSize, backgroundColor]);

  // 关闭下拉菜单的点击事件监听
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowRatioDropdown(false);
        setShowGridDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // 下载所有结果
  const downloadAllResults = () => {
    results.forEach((url, index) => {
      setTimeout(() => downloadResult(url, index), index * 500)
    })
  }

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
    
    if (images.length === 0 && canvasState.images.length === 0) {
      alert('请先上传图片')
      return
    }
    
    // 检查积分
    const creditsNeeded = outputCount * 10
    if (user.credits < creditsNeeded) {
      alert(`积分不足，需要 ${creditsNeeded} 积分，当前余额 ${user.credits} 积分`)
      return
    }
    
    setGenerating(true)
    setGeneratingProgress(0)
    setResults([])
    setShowResults(false)
    
    try {
      // 选择要上传的图片
      const filesToUpload = mode === 'multi' 
        ? images.map(img => img.file)
        : canvasState.images.map(img => img.file)
      
      setGeneratingProgress(20)
      const uploadResult = await api.uploadImages(filesToUpload, user.code)
      
      if (!uploadResult.success) {
        throw new Error('图片上传失败')
      }
      
      setGeneratingProgress(50)
      const generateResult = await api.generateImages({
        auth_code: user.code,
        mode_type: mode,
        prompt_text: prompt,
        output_count: outputCount,
        image_paths: uploadResult.files.map(f => f.saved_path)
      })
      
      setGeneratingProgress(80)
      
      if (generateResult.success && generateResult.output_images) {
        setResults(generateResult.output_images)
        setShowResults(true)
        await refreshUserInfo()
        setGeneratingProgress(100)
      } else {
        throw new Error(generateResult.message || '生成失败')
      }
      
    } catch (error) {
      console.error('Generation failed:', error)
      alert(error instanceof Error ? error.message : '生成失败，请稍后重试')
    } finally {
      setGenerating(false)
      setGeneratingProgress(0)
    }
  }

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
                <button
                  onClick={() => handleModeChange('multi')}
                  disabled={generating}
                  className={`flex items-center px-4 py-2 rounded-lg transition-all ${
                    mode === 'multi'
                      ? 'bg-neon-blue text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Images className="w-4 h-4 mr-2" />
                  多图模式
                </button>
                <button
                  onClick={() => handleModeChange('puzzle')}
                  disabled={generating}
                  className={`flex items-center px-4 py-2 rounded-lg transition-all ${
                    mode === 'puzzle'
                      ? 'bg-neon-purple text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-4 h-4 mr-2" />
                  拼图模式
                </button>
              </div>
            </div>
          </div>
          
          {/* Mode Description */}
          <div className="mt-4 p-4 bg-cyber-gray/50 rounded-lg">
            <p className="text-sm text-gray-300">
              {mode === 'multi' ? (
                <>
                  <strong className="text-neon-blue">多图模式：</strong>
                  顺序上传最多5张图片，每张图片可以单独进行编辑和处理。支持调整图片尺寸、旋转和涂抹区域。
                </>
              ) : (
                <>
                  <strong className="text-neon-purple">拼图模式：</strong>
                  在画布上自由拼接多张图片。支持调整图片位置、大小、角度，以及使用多色画笔进行精准涂抹。
                </>
              )}
            </p>
          </div>
        </div>

        <div className="pb-20">
          {/* Main Editor Area */}
          <div>
            <div className="cyber-card">
              {/* Tabs */}
              <div className="border-b border-gray-700">
                <div className="flex">
                  <button
                    onClick={() => setActiveTab('editor')}
                    className={`px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'editor'
                        ? 'text-neon-blue border-b-2 border-neon-blue'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    编辑器
                  </button>
                  <button
                    onClick={() => setActiveTab('cases')}
                    className={`px-6 py-3 text-sm font-medium transition-colors ${
                      activeTab === 'cases'
                        ? 'text-neon-blue border-b-2 border-neon-blue'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    案例库
                  </button>
                </div>
              </div>
              
              {/* Tab Content */}
              <div className="p-6">
                {activeTab === 'editor' ? (
                  mode === 'multi' ? (
                    // 多图模式 - 左右布局
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* 左侧内容区 */}
                      <div className="lg:col-span-2">
                        {/* 需求描述 */}
                        <div className="mb-6">
                          <h3 className="text-lg font-semibold mb-4 flex items-center">
                            <Lightbulb className="w-5 h-5 text-neon-orange mr-2" />
                            需求描述
                          </h3>
                          
                          <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="请描述您希望生成的效果..."
                            rows={4}
                            className="cyber-input w-full resize-none"
                            disabled={generating}
                          />
                        </div>

                        {/* 选择要编辑的图片列表 */}
                        {images.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-4 flex items-center">
                              <Edit3 className="w-5 h-5 text-neon-green mr-2" />
                              选择要编辑的图片
                            </h4>
                            
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                                    
                                    {/* 选中状态指示器 */}
                                    {selectedImageIndex === index && (
                                      <div className="absolute inset-0 bg-neon-blue/20 flex items-center justify-center">
                                        <div className="w-8 h-8 bg-neon-blue rounded-full flex items-center justify-center">
                                          <Edit className="w-4 h-4 text-white" />
                                        </div>
                                      </div>
                                    )}
                                  </button>
                                  
                                  {/* 图片信息 */}
                                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-xs truncate">图片 {index + 1}</p>
                                    <p className="text-xs text-gray-300 truncate">{image.name}</p>
                                  </div>
                                  
                                  {/* 编辑和删除按钮 */}
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
                      
                      {/* 右侧面板 */}
                      <div className="lg:col-span-1">
                        <div className="space-y-6 sticky top-6">
                          {/* Upload Images */}
                          <div className="bg-cyber-gray/30 rounded-lg p-4">
                            <h4 className="text-sm font-semibold mb-3 flex items-center">
                              <Images className="w-4 h-4 text-neon-blue mr-2" />
                              上传图片 ({images.length}/5)
                            </h4>
                            
                            <ImageUploader
                              maxFiles={5}
                              onImagesChange={setImages}
                              multiple={true}
                              images={images}
                            />
                          </div>
                          
                          {/* Generation Settings */}
                          <div className="bg-cyber-gray/30 rounded-lg p-4">
                            <h4 className="text-sm font-semibold mb-3 flex items-center">
                              <Settings className="w-4 h-4 text-neon-blue mr-2" />
                              生成设置
                            </h4>
                            
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-300 mb-2">
                                  输出数量
                                </label>
                                <div className="grid grid-cols-2 gap-1">
                                  {[1, 2, 3, 4].map(count => (
                                    <button
                                      key={count}
                                      onClick={() => setOutputCount(count)}
                                      disabled={generating}
                                      className={`py-1 text-xs rounded transition-colors ${
                                        outputCount === count
                                          ? 'bg-neon-blue text-white'
                                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                      }`}
                                    >
                                      {count}张
                                    </button>
                                  ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  每张图片消耗10积分
                                </p>
                              </div>
                              
                              <div className="pt-3 border-t border-gray-700">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-400">需要积分:</span>
                                  <span className="font-medium text-neon-green">
                                    {outputCount * 10} 积分
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs mt-1">
                                  <span className="text-gray-400">剩余积分:</span>
                                  <span className={`font-medium ${
                                    (user?.credits || 0) >= outputCount * 10
                                      ? 'text-neon-green'
                                      : 'text-red-400'
                                  }`}>
                                    {user?.credits || 0} 积分
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Results */}
                          {showResults && results.length > 0 && (
                            <div className="bg-cyber-gray/30 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold flex items-center">
                                  <Eye className="w-4 h-4 text-neon-green mr-2" />
                                  生成结果
                                </h4>
                                <button
                                  onClick={downloadAllResults}
                                  className="neon-button-green px-2 py-1 text-xs"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  全部下载
                                </button>
                              </div>
                              
                              <div className="grid gap-2">
                                {results.map((imageUrl, index) => (
                                  <div key={index} className="relative group">
                                    <div className="aspect-square bg-gray-800 rounded-lg overflow-hidden">
                                      <img
                                        src={imageUrl}
                                        alt={`结果 ${index + 1}`}
                                        className="w-full h-full object-contain"
                                      />
                                    </div>
                                    
                                    <button
                                      onClick={() => downloadResult(imageUrl, index)}
                                      className="absolute top-1 right-1 w-6 h-6 bg-black/70 hover:bg-black/90 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                    >
                                      <Download className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // 拼图模式 - 重构为双模式结构
                    <div>
                      {/* 拼图子模式标签页 */}
                      <div className="border-b border-gray-700 mb-6">
                        <div className="flex">
                          <button
                            onClick={() => handlePuzzleModeChange('custom')}
                            className={`px-6 py-3 text-sm font-medium transition-colors ${
                              puzzleMode === 'custom'
                                ? 'text-neon-purple border-b-2 border-neon-purple'
                                : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            自定义画布
                          </button>
                          <button
                            onClick={() => handlePuzzleModeChange('stitching')}
                            className={`px-6 py-3 text-sm font-medium transition-colors ${
                              puzzleMode === 'stitching'
                                ? 'text-neon-purple border-b-2 border-neon-purple'
                                : 'text-gray-400 hover:text-white'
                            }`}
                          >
                            图像拼接
                          </button>
                        </div>
                      </div>

                      {/* 模式内容 */}
                      {puzzleMode === 'custom' ? (
                        // 自定义画布模式（原有功能）
                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                          <div className="xl:col-span-3">
                            <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
                              <div className="flex items-center gap-4">
                                <h4 className="font-medium flex items-center">
                                  <Layers className="w-5 h-5 text-neon-purple mr-2" />
                                  自定义画布 ({canvasState.canvasSize.width}x{canvasState.canvasSize.height})
                                </h4>
                              </div>
                              
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* 比例选择下拉菜单 */}
                                <div className="relative dropdown-container">
                                  <button
                                    onClick={() => {
                                      setShowRatioDropdown(!showRatioDropdown);
                                      setShowGridDropdown(false);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
                                  >
                                    <span>比例: {selectedRatio.label}</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                  
                                  {showRatioDropdown && (
                                    <div className="absolute top-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10 min-w-full">
                                      {[
                                        {w: 1024, h: 1024, label: '1:1'},
                                        {w: 1368, h: 1024, label: '4:3'},
                                        {w: 1024, h: 1368, label: '3:4'},
                                        {w: 1824, h: 1024, label: '16:9'},
                                        {w: 1024, h: 1824, label: '9:16'},
                                        {w: 1536, h: 1024, label: '3:2'},
                                        {w: 1024, h: 1536, label: '2:3'}
                                      ].map(size => (
                                        <button
                                          key={size.label}
                                          onClick={() => {
                                            if (!isUpdatingCanvas) {
                                              setIsUpdatingCanvas(true);
                                              // 使用setTimeout防止状态更新冲突
                                              setTimeout(() => {
                                                setCanvasSize({width: size.w, height: size.h});
                                                setSelectedRatio(size);
                                                setShowRatioDropdown(false);
                                                setIsUpdatingCanvas(false);
                                              }, 10);
                                            }
                                          }}
                                          disabled={isUpdatingCanvas}
                                          className={`w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors text-sm ${
                                            canvasState.canvasSize.width === size.w && canvasState.canvasSize.height === size.h
                                              ? 'text-neon-purple bg-gray-700'
                                              : 'text-gray-300'
                                          }`}
                                        >
                                          {size.label} ({size.w}x{size.h})
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* 重置按钮 */}
                                {canvasState.images.length > 0 && (
                                  <button
                                    onClick={() => {
                                      if (window.confirm('确定要清空画布吗？此操作不可恢复！')) {
                                        resetCanvas();
                                      }
                                    }}
                                    className="px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"
                                  >
                                    重置画布
                                  </button>
                                )}

                                {/* 上传图片按钮 */}
                                <div className="relative">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files || [])
                                      addImages(files)
                                      setShowRatioDropdown(false)
                                      setShowGridDropdown(false)
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <button className="flex items-center gap-2 px-3 py-2 bg-neon-purple/20 hover:bg-neon-purple/30 text-neon-purple rounded-lg text-sm transition-colors">
                                    <Plus className="w-4 h-4" />
                                    添加图片 ({canvasState.images.length})
                                  </button>
                                </div>
                                
                                {/* 背景色选择器 */}
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-gray-400">背景色:</label>
                                  <input
                                    type="color"
                                    value={backgroundColor}
                                    onChange={(e) => setBackgroundColor(e.target.value)}
                                    className="w-8 h-8 rounded cursor-pointer border border-gray-600"
                                    title="选择背景色"
                                  />
                                </div>
                              </div>
                            </div>
                            
                            <div className="min-h-[500px] max-w-full overflow-hidden bg-gray-800 rounded-lg">
                              <CollageCanvas />
                            </div>
                          </div>
                          
                          <div className="xl:col-span-1">
                            <div className="space-y-4 sticky top-6">
                              <div className="bg-gray-800 rounded-lg p-4">
                                <h5 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
                                  <Palette className="w-4 h-4 text-neon-purple mr-2" />
                                  绘制工具
                                </h5>
                                
                                <div className="mb-4">
                                  <label className="block text-xs font-medium text-gray-400 mb-2">
                                    画笔大小: {drawingTools.brushSize}px
                                  </label>
                                  <input
                                    type="range"
                                    min="1"
                                    max="50"
                                    value={drawingTools.brushSize}
                                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                  />
                                </div>
                                
                                <div>
                                  <label className="block text-xs font-medium text-gray-400 mb-2">
                                    画笔颜色
                                  </label>
                                  <div className="grid grid-cols-4 gap-2 mb-3">
                                    {['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'].map(color => (
                                      <button
                                        key={color}
                                        onClick={() => setBrushColor(color)}
                                        className={`w-6 h-6 rounded border-2 ${
                                          drawingTools.brushColor === color ? 'border-cyan-400' : 'border-gray-600'
                                        }`}
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                  <input
                                    type="color"
                                    value={drawingTools.brushColor}
                                    onChange={(e) => setBrushColor(e.target.value)}
                                    className="w-full h-8 rounded cursor-pointer"
                                  />
                                </div>
                              </div>
                              
                              {canvasState.images.length > 0 && (
                                <div className="bg-gray-800 rounded-lg p-4">
                                  <h5 className="text-xs font-medium text-gray-400 mb-2">
                                    画布图片 ({canvasState.images.length})
                                  </h5>
                                  <div className="space-y-2 max-h-40 overflow-y-auto">
                                    {canvasState.images.map((image, index) => (
                                      <div
                                        key={image.id}
                                        className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                                          image.selected ? 'bg-neon-purple/20 border border-neon-purple/50' : 'hover:bg-gray-700'
                                        }`}
                                      >
                                        <img
                                          src={image.url}
                                          alt={image.name}
                                          className="w-8 h-8 object-cover rounded"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs text-white truncate">图片 {index + 1}</div>
                                          <div className="text-xs text-gray-400 truncate">{image.name}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        // 图像拼接模式
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div className="lg:col-span-1">
                            {/* 精简的上传区域 */}
                            <div className="space-y-4">
                              <h4 className="font-medium flex items-center">
                                <Images className="w-5 h-5 text-neon-purple mr-2" />
                                图像拼接
                              </h4>
                              
                              {/* 精简上传区域 */}
                              <div className="bg-gray-800 rounded-lg p-4 text-center">
                                <div className="relative inline-block">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files || [])
                                      const imageObjects = files.map(file => ({
                                        id: Date.now().toString() + Math.random().toString(),
                                        file,
                                        url: URL.createObjectURL(file),
                                        name: file.name
                                      }));
                                      setStitchingImages(prev => [...prev, ...imageObjects]);
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <div className="py-4">
                                    <Plus className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                                    <p className="text-sm text-gray-400">上传图片</p>
                                  </div>
                                </div>
                              </div>
                              
                              {/* 已上传图片列表 */}
                              {stitchingImages.length > 0 && (
                                <div className="space-y-2">
                                  <h5 className="text-xs font-medium text-gray-400">已上传 ({stitchingImages.length})</h5>
                                  {stitchingImages.map((image, index) => (
                                    <div key={image.id} className="relative group flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
                                      <img
                                        src={image.url}
                                        alt={image.name}
                                        className="w-10 h-10 object-cover rounded"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-xs text-white truncate">{image.name}</div>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setStitchingImages(prev => prev.filter(img => img.id !== image.id));
                                        }}
                                        className="w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        <Trash2 className="w-2 h-2" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* 设置选项 */}
                              {stitchingImages.length >= 2 && (
                                <div className="space-y-3">
                                  <div>
                                    <label className="text-xs font-medium text-gray-400 mb-2 block">输出尺寸</label>
                                    <select
                                      value={outputSize}
                                      onChange={(e) => setOutputSize(parseInt(e.target.value))}
                                      className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white"
                                    >
                                      <option value={1024}>1024 x 1024</option>
                                      <option value={1536}>1536 x 1536</option>
                                      <option value={2048}>2048 x 2048</option>
                                    </select>
                                  </div>
                                  
                                  <div>
                                    <label className="text-xs font-medium text-gray-400 mb-2 block">背景色</label>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="color"
                                        value={backgroundColor}
                                        onChange={(e) => setBackgroundColor(e.target.value)}
                                        className="w-8 h-8 rounded cursor-pointer border border-gray-600"
                                      />
                                      <span className="text-xs text-gray-500">{backgroundColor}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="lg:col-span-2">
                            {/* 修复的预览区域 - 修复尺寸约束问题 */}
                            <div className="h-full max-w-full">
                              {stitchingImages.length >= 2 ? (
                                <div className="space-y-4">
                                  {/* 布局选择 */}
                                  <div>
                                    <h5 className="text-sm font-medium text-gray-400 mb-3">选择布局样式</h5>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                      {stitchingImages.length >= 2 && (
                                        <>
                                          <button
                                            onClick={() => setStitchingLayout('2h')}
                                            className={`p-3 rounded-lg border-2 transition-colors ${
                                              stitchingLayout === '2h' 
                                                ? 'border-neon-purple bg-neon-purple/10' 
                                                : 'border-gray-600 hover:border-gray-500'
                                            }`}
                                          >
                                            <div className="flex gap-1 mb-2">
                                              <div className="w-6 h-4 bg-gray-500 rounded"></div>
                                              <div className="w-6 h-4 bg-gray-500 rounded"></div>
                                            </div>
                                            <div className="text-xs text-gray-400">左右排列</div>
                                          </button>
                                          <button
                                            onClick={() => setStitchingLayout('2v')}
                                            className={`p-3 rounded-lg border-2 transition-colors ${
                                              stitchingLayout === '2v' 
                                                ? 'border-neon-purple bg-neon-purple/10' 
                                                : 'border-gray-600 hover:border-gray-500'
                                            }`}
                                          >
                                            <div className="mb-2">
                                              <div className="w-12 h-2 bg-gray-500 rounded mb-1"></div>
                                              <div className="w-12 h-2 bg-gray-500 rounded"></div>
                                            </div>
                                            <div className="text-xs text-gray-400">上下排列</div>
                                          </button>
                                        </>
                                      )}
                                      {stitchingImages.length >= 3 && (
                                        <>
                                          <button
                                            onClick={() => setStitchingLayout('3l')}
                                            className={`p-3 rounded-lg border-2 transition-colors ${
                                              stitchingLayout === '3l' 
                                                ? 'border-neon-purple bg-neon-purple/10' 
                                                : 'border-gray-600 hover:border-gray-500'
                                            }`}
                                          >
                                            <div className="flex gap-1 mb-2">
                                              <div className="w-6 h-4 bg-gray-500 rounded"></div>
                                              <div className="flex flex-col gap-1">
                                                <div className="w-4 h-1 bg-gray-500 rounded"></div>
                                                <div className="w-4 h-1 bg-gray-500 rounded"></div>
                                              </div>
                                            </div>
                                            <div className="text-xs text-gray-400">L型(左大)</div>
                                          </button>
                                          <button
                                            onClick={() => setStitchingLayout('3r')}
                                            className={`p-3 rounded-lg border-2 transition-colors ${
                                              stitchingLayout === '3r' 
                                                ? 'border-neon-purple bg-neon-purple/10' 
                                                : 'border-gray-600 hover:border-gray-500'
                                            }`}
                                          >
                                            <div className="flex gap-1 mb-2">
                                              <div className="flex flex-col gap-1">
                                                <div className="w-4 h-1 bg-gray-500 rounded"></div>
                                                <div className="w-4 h-1 bg-gray-500 rounded"></div>
                                              </div>
                                              <div className="w-6 h-4 bg-gray-500 rounded"></div>
                                            </div>
                                            <div className="text-xs text-gray-400">L型(右大)</div>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* 修复的预览区域 - 增加尺寸约束 */}
                                  <div className="flex-1">
                                    <div className="bg-gray-800 rounded-lg p-4 max-w-full overflow-hidden">
                                      <div className="flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                                        {previewImage ? (
                                          <div className="relative max-w-full max-h-full">
                                            <img 
                                              src={previewImage} 
                                              alt="拼接预览" 
                                              className="object-contain border border-gray-600 rounded max-w-full max-h-full"
                                              style={{
                                                maxWidth: 'min(500px, 100%)',
                                                maxHeight: 'min(500px, 60vh)'
                                              }}
                                            />
                                            {/* 尺寸信息显示 */}
                                            <div className="absolute top-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs">
                                              {outputSize}x{outputSize}px
                                            </div>
                                            {/* 右键保存提示 */}
                                            <div className="absolute bottom-2 left-2 bg-black/80 text-white px-2 py-1 rounded text-xs">
                                              右键保存图片
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="text-center text-gray-500">
                                            <div className="w-full h-64 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center max-w-md">
                                              <div className="text-center">
                                                <Images className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                                <p className="text-sm">
                                                  {stitchingImages.length < 2 ? "上传至少2张图片开始拼接" : "生成预览中..."}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="h-full bg-gray-800/50 rounded-lg flex items-center justify-center">
                                  <div className="text-center text-gray-400">
                                    <Images className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                    <p className="text-lg mb-2">图像拼接模式</p>
                                    <p className="text-sm">请上传至少2张图片开始拼接</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )

                ) : (
                  <CaseBrowser
                    onCaseSelect={handleCaseSelect}
                    currentPrompt={prompt}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Floating Generate Button */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim() || (images.length === 0 && canvasState.images.length === 0) || (user?.credits || 0) < outputCount * 10}
            className="neon-button px-8 py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl hover:scale-105 transition-transform"
          >
            {generating ? (
              <div className="flex items-center justify-center">
                <Loader className="w-5 h-5 mr-2 animate-spin" />
                生成中... {generatingProgress}%
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Play className="w-5 h-5 mr-2" />
                立即生成
              </div>
            )}
          </button>
          
          {generating && (
            <div className="progress-bar mt-2">
              <div 
                className="progress-fill" 
                style={{ width: `${generatingProgress}%` }}
              ></div>
            </div>
          )}
        </div>
        
        {/* 图片编辑模态窗口 */}
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
      </div>
    </div>
  )
}
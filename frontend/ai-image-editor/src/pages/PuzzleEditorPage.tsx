import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import { useCollage } from '../contexts/CollageContext'
import NavBar from '../components/NavBar'
import CollageCanvas from '../components/CollageCanvas'
import GenerationResultPanel from '../components/GenerationResultPanel'
import FloatingImageUploader from '../components/FloatingImageUploader'
import { urlsToFiles } from '../utils/imageUtils'
import {
  Layers,
  Images,
  Wand2,
  Plus,
  Trash2,
  Palette,
  ArrowUp,
  Clock,
  Loader,
  ChevronDown,
  Brush,
  Eraser
} from 'lucide-react'
import { Link } from 'react-router-dom'

type PuzzleMode = 'custom' | 'stitching' // 拼图模式的子模式
type UploadedImage = { id: string; file: File; url: string; name: string }

export default function PuzzleEditorPage() {
  const { user, refreshUserInfo } = useAuth()
  const { api } = useApi()
  const { 
    canvasState, 
    drawingTools, 
    addImages, 
    setCanvasSize, 
    setBrushColor, 
    setBrushSize,
    resetCanvas,
    setDrawingMode,
    clearDrawings,
    selectImage
  } = useCollage()
  
  // 编辑器状态
  const [puzzleMode, setPuzzleMode] = useState<PuzzleMode>('custom') // 拼图子模式
  const [prompt, setPrompt] = useState('')
  const [outputCount, setOutputCount] = useState(1)
  
  // 图像拼接专用状态
  const [stitchingImages, setStitchingImages] = useState<UploadedImage[]>([])
  const [stitchingLayout, setStitchingLayout] = useState<string>('2h') // 2h=左右, 2v=上下, 3l=L型等
  const [outputSize, setOutputSize] = useState<number>(1024) // 输出尺寸
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff') // 背景色
  const [previewImage, setPreviewImage] = useState<string>('') // 实时预览图
  
  // UI状态
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<string[]>([]) // 保留，用于右侧面板临时展示
  const [showResults, setShowResults] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<string[]>([]) // 新增：用于存储生成记录
  const [showGenerationPanel, setShowGenerationPanel] = useState(false) // 新增：控制生成记录面板的显示
  const [generatingProgress, setGeneratingProgress] = useState(0)
  
  // UI控制状态 - 下拉菜单
  const [showRatioDropdown, setShowRatioDropdown] = useState(false)
  const [selectedRatio, setSelectedRatio] = useState<{w: number, h: number, label: string}>({w: 1024, h: 1024, label: '1:1'})
  const [isUpdatingCanvas, setIsUpdatingCanvas] = useState(false)

  // 新增：底部悬浮生成栏的状态
  const [aspectRatio, setAspectRatio] = useState('智能')
  const [showAspectRatioDropdown, setShowAspectRatioDropdown] = useState(false)

  // 处理拼图子模式切换
  const handlePuzzleModeChange = (newPuzzleMode: PuzzleMode) => {
    setPuzzleMode(newPuzzleMode)
    setResults([])
    setShowResults(false)
    setGeneratedImages([]) // 清空生成记录
    setShowGenerationPanel(false) // 隐藏面板
  }

  // 同步图像拼接输出尺寸到画布尺寸
  useEffect(() => {
    if (puzzleMode === 'stitching') {
      setCanvasSize({ width: outputSize, height: outputSize });
    }
  }, [outputSize, puzzleMode, setCanvasSize]);

  // 图像拼接工具函数
  const generateStitchedImage = (images: UploadedImage[], layout: string, size: number, bgColor: string): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      canvas.width = size;
      canvas.height = size;
      
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
        const padding = size * 0.02;
        
        if (layout === '2h' && loadedImages.length >= 2) {
          const imgWidth = (size - padding * 3) / 2;
          const imgHeight = size - padding * 2;
          drawScaledImage(ctx, loadedImages[0], padding, padding, imgWidth, imgHeight);
          drawScaledImage(ctx, loadedImages[1], padding * 2 + imgWidth, padding, imgWidth, imgHeight);
        } else if (layout === '2v' && loadedImages.length >= 2) {
          const imgWidth = size - padding * 2;
          const imgHeight = (size - padding * 3) / 2;
          drawScaledImage(ctx, loadedImages[0], padding, padding, imgWidth, imgHeight);
          drawScaledImage(ctx, loadedImages[1], padding, padding * 2 + imgHeight, imgWidth, imgHeight);
        } else if (layout === '3l' && loadedImages.length >= 3) {
          const leftWidth = (size - padding * 3) * 0.6;
          const rightWidth = (size - padding * 3) * 0.4;
          const halfHeight = (size - padding * 3) / 2;
          
          drawScaledImage(ctx, loadedImages[0], padding, padding, leftWidth, size - padding * 2);
          drawScaledImage(ctx, loadedImages[1], padding * 2 + leftWidth, padding, rightWidth, halfHeight);
          drawScaledImage(ctx, loadedImages[2], padding * 2 + leftWidth, padding * 2 + halfHeight, rightWidth, halfHeight);
        } else if (layout === '3r' && loadedImages.length >= 3) {
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
    
    if (imgAspect > targetAspect) {
      drawWidth = w;
      drawHeight = w / imgAspect;
      drawX = x;
      drawY = y + (h - drawHeight) / 2;
    } else {
      drawHeight = h;
      drawWidth = h * imgAspect;
      drawX = x + (w - drawWidth) / 2;
      drawY = y;
    }
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  };

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowRatioDropdown(false);
        setShowAspectRatioDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const handleGenerate = async () => {
    if (!user) return
    
    if (!prompt.trim()) {
      alert('请输入提示词')
      return
    }
    
    if (canvasState.images.length === 0 && stitchingImages.length === 0) {
      alert('请先上传图片')
      return
    }
    
    const creditsNeeded = outputCount * 10;
    if (user.credits < creditsNeeded) {
      alert(`积分不足，需要 ${creditsNeeded} 积分，当前余额 ${user.credits} 积分`);
      return;
    }

    setGenerating(true);
    setGeneratingProgress(0);
    setResults([]);
    setShowResults(false);
    setShowGenerationPanel(false);

    setTimeout(() => {
      const sourceImages = (puzzleMode === 'custom' 
            ? canvasState.images.map(i => i.url) 
            : stitchingImages.map(i => i.url));

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
    if (puzzleMode === 'custom') {
      addImages(files);
    } else { // stitching mode
      const imageObjects = files.map(file => ({
        id: Date.now().toString() + Math.random().toString(),
        file,
        url: URL.createObjectURL(file),
        name: file.name
      }));
      setStitchingImages(prev => [...prev, ...imageObjects].slice(0, 4)); // Limit to 4
    }
  };

  const imageCount = puzzleMode === 'custom' ? canvasState.images.length : stitchingImages.length;
  const maxFiles = puzzleMode === 'custom' ? 10 : 4;

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
      
      if (puzzleMode === 'custom') {
        resetCanvas();
        setTimeout(() => addImages([file]), 50);
      } else if (puzzleMode === 'stitching') {
        setStitchingImages([newImage]);
      }

      setShowGenerationPanel(false);
    } catch (error) {
      console.error("Error converting URL to file or updating state:", error);
      alert("无法使用这张图片，请稍后再试。");
    }
  };

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
            
            <div className="mt-4 lg:mt-0">
              <div className="flex bg-cyber-gray rounded-lg p-1">
                <Link
                  to="/editor/multi"
                  className={`flex items-center px-4 py-2 rounded-lg transition-all text-gray-400 hover:text-white`}
                >
                  <Images className="w-4 h-4 mr-2" />
                  多图模式
                </Link>
                <Link
                  to="/editor/puzzle"
                  className={`flex items-center px-4 py-2 rounded-lg transition-all bg-neon-purple text-white`}
                >
                  <Layers className="w-4 h-4 mr-2" />
                  拼图模式
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="pb-20">
          <div>
            <div className="cyber-card">
              <div className="p-6">
                <div>
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

                  {puzzleMode === 'custom' ? (
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
                            <div className="relative dropdown-container">
                              <button
                                onClick={() => {
                                  setShowRatioDropdown(!showRatioDropdown);
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
                                工具
                              </label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setDrawingMode('brush')}
                                  className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                                    drawingTools.mode === 'brush' 
                                      ? 'bg-neon-purple text-white' 
                                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                  }`}
                                  title="画笔"
                                >
                                  <Brush className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDrawingMode('eraser')}
                                  className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                                    drawingTools.mode === 'eraser' 
                                      ? 'bg-neon-purple text-white' 
                                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                  }`}
                                  title="橡皮擦"
                                >
                                  <Eraser className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm('确定要清空所有涂鸦吗？')) {
                                      clearDrawings();
                                    }
                                  }}
                                  className="flex-1 flex items-center justify-center py-2 rounded-lg bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-400 transition-colors"
                                  title="清空涂鸦"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

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
                            
                            {drawingTools.mode === 'brush' && (
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
                            )}
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
                                    onClick={() => selectImage(image.id)}
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
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-1">
                        <div className="space-y-4">
                          <h4 className="font-medium flex items-center">
                            <Images className="w-5 h-5 text-neon-purple mr-2" />
                            图像拼接
                          </h4>
                          
                          <p className="text-sm text-gray-400">在下方的悬浮窗口上传图片开始拼接。</p>
                          
                          {stitchingImages.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-xs font-medium text-gray-400">已上传 ({stitchingImages.length})</h5>
                              {stitchingImages.map((image) => (
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
                        <div className="h-full max-w-full">
                          {stitchingImages.length >= 2 ? (
                            <div className="space-y-4">
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
                                        <div className="absolute top-2 right-2 bg-black/80 text-white px-2 py-1 rounded text-xs">
                                          {outputSize}x{outputSize}px
                                        </div>
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
              </div>
            </div>
          </div>
        </div>
        
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 w-[900px] max-w-[90vw]">
          <div className="cyber-card bg-gray-800/80 backdrop-blur-md p-4 rounded-xl shadow-2xl shadow-black/50 relative">
            <div className="flex items-start gap-4">
              <FloatingImageUploader
                onAddFiles={handleAddFiles}
                imageCount={imageCount}
                maxFiles={maxFiles}
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
                    onClick={() => setShowAspectRatioDropdown(!showAspectRatioDropdown)}
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
                          onClick={() => { setAspectRatio(ratio); setShowAspectRatioDropdown(false); }}
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
                    <button onClick={() => setOutputCount(Math.max(1, outputCount - 1))} className="px-2 py-1 text-gray-300 hover:bg-gray-600/50 rounded-l-lg transition-colors">-</button>
                    <span className="px-3 text-sm text-white font-medium">{outputCount}</span>
                    <button onClick={() => setOutputCount(Math.min(4, outputCount + 1))} className="px-2 py-1 text-gray-300 hover:bg-gray-600/50 rounded-r-lg transition-colors">+</button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => { if (generatedImages.length > 0) setShowGenerationPanel(true); }}
                  disabled={generatedImages.length === 0}
                  className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg hover:scale-105 transition-all"
                  title={generatedImages.length > 0 ? '生成记录' : '暂无生成记录'}
                >
                  <Clock className="w-5 h-5" />
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating || !prompt.trim() || (canvasState.images.length === 0 && stitchingImages.length === 0) || (user?.credits || 0) < outputCount * 10}
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
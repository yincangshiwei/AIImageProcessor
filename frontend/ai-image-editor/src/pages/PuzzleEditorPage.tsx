import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import { useCollage } from '../contexts/CollageContext'
import NavBar from '../components/NavBar'
import CollageCanvas from '../components/CollageCanvas'
import GenerationResultPanel from '../components/GenerationResultPanel'
import FloatingImageUploader from '../components/FloatingImageUploader'
import BottomGeneratePanel from '../components/BottomGeneratePanel'
import ModeNavigationPanel from '../components/ModeNavigationPanel'
import { MODE_NAVIGATION_TABS } from '../constants/modeTabs'
import { urlsToFiles } from '../utils/imageUtils'
import {
  Layers,
  Images,
  Wand2,
  Plus,
  Trash2,
  Palette,
  Brush,
  Eraser,
  Undo2,
  Redo2,
  Crop,
  ArrowUp,
  ArrowDown,
  Square,
  Circle,
  Minus
} from 'lucide-react'
import ImageCropModal from '../components/ImageCropModal'
import ImageEditModal from '../components/ImageEditModal'

type PuzzleMode = 'custom' | 'stitching' // 拼图模式的子模式
type UploadedImage = { id: string; file: File; url: string; name: string }

const MAX_PUZZLE_CUSTOM_FILES = 10;
const MAX_STITCHING_FILES = 4;

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

export default function PuzzleEditorPage() {
  const { user, refreshUserInfo } = useAuth()
  const { api } = useApi()
  const { 
    canvasState, 
    addImages, 
    setCanvasSize, 
    resetCanvas,
    updateImage,
    drawingActions,
    drawingTools,
    setBrushColor,
    setBrushSize,
    setBrushShape,
    setDrawingMode,
    clearDrawings,
    selectImage
  } = useCollage()
  const [bottomAspectRatio, setBottomAspectRatio] = useState('1:1')
  const bottomDimensionsRef = useRef<{ width: number; height: number }>({
    width: canvasState.canvasSize.width,
    height: canvasState.canvasSize.height
  })
  
  // 编辑器状态
  const [puzzleMode, setPuzzleMode] = useState<PuzzleMode>('custom') // 拼图子模式
  const [prompt, setPrompt] = useState('')
  const [outputCount, setOutputCount] = useState(1)
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-pro')
  
  // 图像拼接专用状态
  const [stitchingImages, setStitchingImages] = useState<UploadedImage[]>([])
  const [stitchingLayout, setStitchingLayout] = useState<string>('2h') // 2h=左右, 2v=上下, 3l=L型等
  const [outputSize, setOutputSize] = useState<number>(1024) // 输出尺寸
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff') // 背景色
  const [previewImage, setPreviewImage] = useState<string>('') // 实时预览图
  const [selectedStitchingImageId, setSelectedStitchingImageId] = useState<string | null>(null)
  
  // UI状态
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<string[]>([]) // 保留，用于右侧面板临时展示
  const [showResults, setShowResults] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<string[]>([]) // 新增：用于存储生成记录
  const [showGenerationPanel, setShowGenerationPanel] = useState(false) // 新增：控制生成记录面板的显示
  const [generatingProgress, setGeneratingProgress] = useState(0)
  
  // UI控制状态 - 下拉菜单
  const [croppingImage, setCroppingImage] = useState<{id: string, url: string} | null>(null)

  // 图片编辑模态框状态
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [currentEditImageInfo, setCurrentEditImageInfo] = useState<{ id: string; url: string } | null>(null)
  const [isEditingPreview, setIsEditingPreview] = useState(false)

  const appendCustomImages = (incomingFiles: File[]) => {
    if (!incomingFiles.length) return;

    const remainingSlots = MAX_PUZZLE_CUSTOM_FILES - canvasState.images.length;
    if (remainingSlots <= 0) {
      alert(`自定义画布最多只能上传 ${MAX_PUZZLE_CUSTOM_FILES} 张图片`);
      return;
    }

    const filesToUse = incomingFiles.slice(0, remainingSlots);
    if (incomingFiles.length > remainingSlots) {
      alert(`自定义画布最多只能上传 ${MAX_PUZZLE_CUSTOM_FILES} 张图片`);
    }

    addImages(filesToUse);
  };

  const appendStitchingImages = (incomingFiles: File[]) => {
    if (!incomingFiles.length) return;

    setStitchingImages(prev => {
      const remainingSlots = MAX_STITCHING_FILES - prev.length;
      if (remainingSlots <= 0) {
        alert(`图像拼接最多只能上传 ${MAX_STITCHING_FILES} 张图片`);
        return prev;
      }

      const filesToUse = incomingFiles.slice(0, remainingSlots);
      if (incomingFiles.length > remainingSlots) {
        alert(`图像拼接最多只能上传 ${MAX_STITCHING_FILES} 张图片`);
      }

      const mapped = filesToUse.map(file => ({
        id: Date.now().toString() + Math.random().toString(),
        file,
        url: URL.createObjectURL(file),
        name: file.name
      }));

      return [...prev, ...mapped];
    });
  };

  const hasPromptInput = prompt.trim().length > 0;
  const hasCustomUploads = canvasState.images.length > 0;
  const hasStitchingUploads = stitchingImages.length > 0;
  const hasModeUploads = puzzleMode === 'custom' ? hasCustomUploads : hasStitchingUploads;
  const creditsRequired = outputCount * 10;
  const hasEnoughCredits = (user?.credits || 0) >= creditsRequired;
  const canTriggerGeneration = Boolean(user) && !generating && hasEnoughCredits && (hasPromptInput || hasModeUploads);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (puzzleMode !== 'custom') return; // 仅在自定义画布模式下生效
      if (e.ctrlKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          drawingActions.undo?.();
        } else if (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
          e.preventDefault();
          drawingActions.redo?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [drawingActions, puzzleMode]);

  const handleBottomDimensionsChange = useCallback((size: { width: number; height: number }) => {
    bottomDimensionsRef.current = size
    if (puzzleMode === 'custom') {
      setCanvasSize(size)
    }
  }, [puzzleMode, setCanvasSize])







  // 处理拼图子模式切换
  const handlePuzzleModeChange = (newPuzzleMode: PuzzleMode) => {
    setPuzzleMode(newPuzzleMode)
    setResults([])
    setShowResults(false)
    setGeneratedImages([]) // 清空生成记录
    setShowGenerationPanel(false) // 隐藏面板
    if (newPuzzleMode === 'custom') {
      setCanvasSize(bottomDimensionsRef.current)
    } else {
      setCanvasSize({ width: outputSize, height: outputSize })
    }
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
        } else if (layout === '4g' && loadedImages.length >= 4) {
          const imgSize = (size - padding * 3) / 2;
          drawScaledImage(ctx, loadedImages[0], padding, padding, imgSize, imgSize);
          drawScaledImage(ctx, loadedImages[1], padding * 2 + imgSize, padding, imgSize, imgSize);
          drawScaledImage(ctx, loadedImages[2], padding, padding * 2 + imgSize, imgSize, imgSize);
          drawScaledImage(ctx, loadedImages[3], padding * 2 + imgSize, padding * 2 + imgSize, imgSize, imgSize);
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


  const handleGenerate = async () => {
    if (!user) return;

    if (!hasPromptInput && !hasModeUploads) {
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
      const sourceImages = (puzzleMode === 'custom'
        ? canvasState.images.map(i => i.url)
        : stitchingImages.map(i => i.url));
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

      setGeneratedImages(prev => [...mockResults, ...prev].slice(0, 30));
      setShowGenerationPanel(true);
      setGenerating(false);
      setGeneratingProgress(100);
    }, 1000);
  };

  const handleAddFiles = (files: File[]) => {
    if (puzzleMode === 'custom') {
      appendCustomImages(files);
    } else {
      appendStitchingImages(files);
    }
  };

  const imageCount = puzzleMode === 'custom' ? canvasState.images.length : stitchingImages.length;
  const maxFiles = puzzleMode === 'custom' ? MAX_PUZZLE_CUSTOM_FILES : MAX_STITCHING_FILES;

  const handleUseGeneratedImage = async (imageUrl: string) => {
    try {
      const files = await urlsToFiles([imageUrl]);
      if (files.length === 0) {
        throw new Error("Image conversion failed.");
      }

      if (puzzleMode === 'custom') {
        appendCustomImages(files);
      } else {
        appendStitchingImages(files);
      }
    } catch (error) {
      console.error("Error converting URL to file or updating state:", error);
      alert("无法使用这张图片，请稍后再试。");
    }
  };

  // 打开编辑模态框
  const handleEditStitchingImage = (image: UploadedImage) => {
    setCurrentEditImageInfo({ id: image.id, url: image.url });
    setEditModalOpen(true);
  };

  // 保存编辑后的图片
  const handleSaveEditedImage = (editedImageData: string) => {
    if (!currentEditImageInfo) return;

    if (isEditingPreview) {
      setPreviewImage(editedImageData);
    } else {
      fetch(editedImageData)
        .then(res => res.blob())
        .then(blob => {
          setStitchingImages(prev =>
            prev.map(img => {
              if (img.id === currentEditImageInfo.id) {
                const file = new File([blob], img.name, { type: blob.type || 'image/png' });
                return { ...img, file, url: editedImageData };
              }
              return img;
            })
          );
        });
    }

    setEditModalOpen(false);
    setCurrentEditImageInfo(null);
    setIsEditingPreview(false);
  };

  const handleCropSave = async (croppedDataUrl: string) => {
    if (!croppingImage) return;

    try {
      const files = await urlsToFiles([croppedDataUrl]);
      if (files.length > 0) {
        const newFile = files[0];
        if (puzzleMode === 'custom') {
          // 使用 updateImage 更新图片 url 和 file
          updateImage(croppingImage.id, { url: croppedDataUrl, file: newFile });
        }
      }
    } catch (error) {
      console.error("裁剪后更新图片失败:", error);
      alert("裁剪失败，请重试。");
    } finally {
      setCroppingImage(null);
    }
  };

  const handleMoveStitchingImage = (id: string, direction: 'up' | 'down') => {
    setStitchingImages(prev => {
      const index = prev.findIndex(img => img.id === id);
      if (index === -1) return prev;

      const newImages = [...prev];
      const [movedImage] = newImages.splice(index, 1);
      
      let newIndex;
      if (direction === 'up') {
        newIndex = (index - 1 + prev.length) % prev.length;
      } else {
        newIndex = (index + 1) % prev.length;
      }
      
      newImages.splice(newIndex, 0, movedImage);
      return newImages;
    });
  };

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
                            <div className="px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-sm border border-gray-700">
                              <span>比例: {bottomAspectRatio}</span>
                              <span className="ml-3 text-gray-500">
                                {canvasState.canvasSize.width}x{canvasState.canvasSize.height}px
                              </span>
                              <span className="ml-3 text-xs text-gray-500">（请在底部面板调整）</span>
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
                          <CollageCanvas startCropping={(image) => setCroppingImage({ id: image.id, url: image.url })} />
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
                                  onClick={() => drawingActions.undo?.()}
                                  disabled={!drawingActions.canUndo}
                                  className="flex-1 flex items-center justify-center py-2 rounded-lg transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="撤销 (Ctrl+Z)"
                                >
                                  <Undo2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => drawingActions.redo?.()}
                                  disabled={!drawingActions.canRedo}
                                  className="flex-1 flex items-center justify-center py-2 rounded-lg transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="重做 (Ctrl+Y)"
                                >
                                  <Redo2 className="w-4 h-4" />
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
                              <div className="mb-4">
                                <label className="block text-xs font-medium text-gray-400 mb-2">
                                  涂抹方式
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    onClick={() => setBrushShape('point')}
                                    className={`flex items-center justify-center py-2 rounded-lg border transition-colors ${
                                      drawingTools.brushShape === 'point'
                                        ? 'border-neon-purple bg-neon-purple/20 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
                                    }`}
                                    title="点状"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setBrushShape('square')}
                                    className={`flex items-center justify-center py-2 rounded-lg border transition-colors ${
                                      drawingTools.brushShape === 'square'
                                        ? 'border-neon-purple bg-neon-purple/20 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
                                    }`}
                                    title="方形"
                                  >
                                    <Square className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setBrushShape('circle')}
                                    className={`flex items-center justify-center py-2 rounded-lg border transition-colors ${
                                      drawingTools.brushShape === 'circle'
                                        ? 'border-neon-purple bg-neon-purple/20 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'
                                    }`}
                                    title="圆形"
                                  >
                                    <Circle className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                            
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
                              {stitchingImages.map((image, index) => (
                                <div 
                                  key={image.id} 
                                  onClick={() => setSelectedStitchingImageId(image.id)}
                                  className={`relative group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                    selectedStitchingImageId === image.id 
                                      ? 'bg-neon-purple/20 border border-neon-purple/50' 
                                      : 'bg-gray-800 hover:bg-gray-700'
                                  }`}
                                >
                                  <img
                                    src={image.url}
                                    alt={image.name}
                                    className="w-10 h-10 object-cover rounded"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-white truncate">{image.name}</div>
                                  </div>
                                  <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-gray-900/80 p-1 rounded-md transition-opacity ${
                                    selectedStitchingImageId === image.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                  }`}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleEditStitchingImage(image); }}
                                      className="w-5 h-5 bg-cyan-600 hover:bg-cyan-700 text-white rounded flex items-center justify-center"
                                      title="绘图"
                                    >
                                      <Palette className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleMoveStitchingImage(image.id, 'up'); }}
                                      className="w-5 h-5 bg-gray-600 hover:bg-gray-500 text-white rounded flex items-center justify-center"
                                      title="上移"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleMoveStitchingImage(image.id, 'down'); }}
                                      className="w-5 h-5 bg-gray-600 hover:bg-gray-500 text-white rounded flex items-center justify-center"
                                      title="下移"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setStitchingImages(prev => prev.filter(img => img.id !== image.id));
                                        if (selectedStitchingImageId === image.id) {
                                          setSelectedStitchingImageId(null);
                                        }
                                      }}
                                      className="w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded flex items-center justify-center"
                                      title="删除"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
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
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                  {stitchingImages.length >= 2 && (
                                    <>
                                      <button
                                        onClick={() => setStitchingLayout('2h')}
                                        className={`aspect-square flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-colors ${
                                          stitchingLayout === '2h' 
                                            ? 'border-neon-purple bg-neon-purple/10' 
                                            : 'border-gray-600 hover:border-gray-500'
                                        }`}
                                      >
                                        <div className="flex gap-1 mb-1">
                                          <div className="w-4 h-6 bg-gray-500 rounded-sm"></div>
                                          <div className="w-4 h-6 bg-gray-500 rounded-sm"></div>
                                        </div>
                                        <div className="text-xs text-gray-400">左右排列</div>
                                      </button>
                                      <button
                                        onClick={() => setStitchingLayout('2v')}
                                        className={`aspect-square flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-colors ${
                                          stitchingLayout === '2v' 
                                            ? 'border-neon-purple bg-neon-purple/10' 
                                            : 'border-gray-600 hover:border-gray-500'
                                        }`}
                                      >
                                        <div className="flex flex-col gap-1 mb-1">
                                          <div className="w-8 h-3 bg-gray-500 rounded-sm"></div>
                                          <div className="w-8 h-3 bg-gray-500 rounded-sm"></div>
                                        </div>
                                        <div className="text-xs text-gray-400">上下排列</div>
                                      </button>
                                    </>
                                  )}
                                  {stitchingImages.length >= 3 && (
                                    <>
                                      <button
                                        onClick={() => setStitchingLayout('3l')}
                                        className={`aspect-square flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-colors ${
                                          stitchingLayout === '3l' 
                                            ? 'border-neon-purple bg-neon-purple/10' 
                                            : 'border-gray-600 hover:border-gray-500'
                                        }`}
                                      >
                                        <div className="flex gap-1 mb-1 h-7 items-end">
                                          <div className="w-5 h-7 bg-gray-500 rounded-sm"></div>
                                          <div className="flex flex-col gap-1">
                                            <div className="w-3 h-3 bg-gray-500 rounded-sm"></div>
                                            <div className="w-3 h-3 bg-gray-500 rounded-sm"></div>
                                          </div>
                                        </div>
                                        <div className="text-xs text-gray-400">L型(左大)</div>
                                      </button>
                                      <button
                                        onClick={() => setStitchingLayout('3r')}
                                        className={`aspect-square flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-colors ${
                                          stitchingLayout === '3r' 
                                            ? 'border-neon-purple bg-neon-purple/10' 
                                            : 'border-gray-600 hover:border-gray-500'
                                        }`}
                                      >
                                        <div className="flex gap-1 mb-1 h-7 items-end">
                                          <div className="flex flex-col gap-1">
                                            <div className="w-3 h-3 bg-gray-500 rounded-sm"></div>
                                            <div className="w-3 h-3 bg-gray-500 rounded-sm"></div>
                                          </div>
                                          <div className="w-5 h-7 bg-gray-500 rounded-sm"></div>
                                        </div>
                                        <div className="text-xs text-gray-400">L型(右大)</div>
                                      </button>
                                    </>
                                  )}
                                  {stitchingImages.length >= 4 && (
                                    <button
                                      onClick={() => setStitchingLayout('4g')}
                                      className={`aspect-square flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-colors ${
                                        stitchingLayout === '4g' 
                                          ? 'border-neon-purple bg-neon-purple/10' 
                                          : 'border-gray-600 hover:border-gray-500'
                                      }`}
                                    >
                                      <div className="grid grid-cols-2 gap-1 mb-1">
                                        <div className="w-4 h-4 bg-gray-500 rounded-sm"></div>
                                        <div className="w-4 h-4 bg-gray-500 rounded-sm"></div>
                                        <div className="w-4 h-4 bg-gray-500 rounded-sm"></div>
                                        <div className="w-4 h-4 bg-gray-500 rounded-sm"></div>
                                      </div>
                                      <div className="text-xs text-gray-400">四宫格</div>
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex-1">
                                <div className="bg-gray-800 rounded-lg p-4 max-w-full overflow-hidden">
                                  <div className="flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                                    {previewImage ? (
                                      <div className="relative max-w-full max-h-full group">
                                        <img
                                          src={previewImage}
                                          alt="拼接预览"
                                          className="object-contain border border-gray-600 rounded max-w-full max-h-full"
                                          style={{
                                            maxWidth: 'min(500px, 100%)',
                                            maxHeight: 'min(500px, 60vh)'
                                          }}
                                        />
                                        <button
                                          onClick={() => {
                                            setCurrentEditImageInfo({ id: 'preview', url: previewImage });
                                            setIsEditingPreview(true);
                                            setEditModalOpen(true);
                                          }}
                                          className="absolute top-2 right-2 w-8 h-8 bg-cyan-600 hover:bg-cyan-700 text-white rounded-full flex items-center justify-center"
                                          title="编辑效果图"
                                        >
                                          <Palette className="w-4 h-4" />
                                        </button>
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
        
        <BottomGeneratePanel
          prompt={prompt}
          onPromptChange={setPrompt}
          generating={generating}
          generatingProgress={generatingProgress}
          outputCount={outputCount}
          onChangeOutputCount={setOutputCount}
          onAddFiles={handleAddFiles}
          imageCount={imageCount}
          maxFiles={maxFiles}
          initialModel={selectedModel}
          onModelChange={setSelectedModel}
          initialAspectRatio="1:1"
          onAspectRatioChange={setBottomAspectRatio}
          onDimensionsChange={handleBottomDimensionsChange}
          onGenerate={handleGenerate}
          canGenerate={canTriggerGeneration}
          canOpenHistory={generatedImages.length > 0}
          onOpenHistory={() => setShowGenerationPanel(true)}
        />
        
        <GenerationResultPanel
          isOpen={showGenerationPanel}
          onClose={() => setShowGenerationPanel(false)}
          generatedImages={generatedImages}
          onUseImage={handleUseGeneratedImage}
          onDownloadImage={downloadResult}
          onRegenerate={handleGenerate}
        />

        {croppingImage && (
          <ImageCropModal
            isOpen={!!croppingImage}
            onClose={() => setCroppingImage(null)}
            imageSrc={croppingImage.url}
            onSave={handleCropSave}
          />
        )}

        <ImageEditModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setCurrentEditImageInfo(null);
            setIsEditingPreview(false);
          }}
          imageSrc={currentEditImageInfo?.url || ''}
          imageId={currentEditImageInfo?.id}
          onSave={handleSaveEditedImage}
        />
      </div>
      </main>
    </div>
  )
}
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useApi } from '../contexts/ApiContext'
import { useCollage } from '../contexts/CollageContext'
import NavBar from '../components/NavBar'
import CollageCanvas, { CollageCanvasHandle } from '../components/CollageCanvas'
import GenerationResultPanel from '../components/GenerationResultPanel'
import FloatingImageUploader from '../components/FloatingImageUploader'
import BottomGeneratePanel from '../components/BottomGeneratePanel'
import ModeNavigationPanel from '../components/ModeNavigationPanel'
import { MODE_NAVIGATION_TABS } from '../constants/modeTabs'
import { urlsToFiles } from '../utils/imageUtils'
import { ResolutionId, RESOLUTION_TO_IMAGE_SIZE } from '../services/modelCapabilities'
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
import { DragDropContext, Droppable, Draggable, type DropResult, type DraggableProvided, type DraggableStateSnapshot } from '@hello-pangea/dnd'
import ImageCropModal from '../components/ImageCropModal'
import ImageEditModal from '../components/ImageEditModal'

type PuzzleMode = 'custom' | 'stitching' // 拼图模式的子模式
type UploadedImage = { id: string; file: File; url: string; name: string }

const STITCHING_DEFAULT_CANVAS = { width: 1536, height: 1536 } as const

const dataUrlToFile = async (dataUrl: string, filename: string): Promise<File> => {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const inferredType = blob.type || 'image/png'
  return new File([blob], filename, { type: inferredType })
}


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
  const collageCanvasRef = useRef<CollageCanvasHandle | null>(null)
  
  // 编辑器状态
  const [puzzleMode, setPuzzleMode] = useState<PuzzleMode>('custom') // 拼图子模式
  const [prompt, setPrompt] = useState('')
  const [outputCount, setOutputCount] = useState(1)
  const [selectedModel, setSelectedModel] = useState('gemini-1.5-pro')
  const [puzzleResolutionId, setPuzzleResolutionId] = useState<ResolutionId>('standard')
  
  // 图像拼接专用状态

  const [stitchingImages, setStitchingImages] = useState<UploadedImage[]>([])
  const [stitchingLayout, setStitchingLayout] = useState<string>('2h') // 2h=左右, 2v=上下, 3l=L型等
  const [backgroundColor, setBackgroundColor] = useState<string>('#ffffff') // 背景色
  const [useCanvasBackground, setUseCanvasBackground] = useState(false)
  const [stitchingCanvasSizing, setStitchingCanvasSizing] = useState<'default' | 'bottom'>('default')
  const [previewImage, setPreviewImage] = useState<string>('') // 实时预览图
  const [previewImageRevision, setPreviewImageRevision] = useState(0)
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

  const updatePreviewImage = useCallback((value: string, bumpRevision: boolean = true) => {
    setPreviewImage(value)
    if (bumpRevision) {
      setPreviewImageRevision(prev => prev + 1)
    }
  }, [])

  const appendCustomImages = (incomingFiles: File[]) => {
    if (!incomingFiles.length) return;

    addImages(incomingFiles);
  };

  const appendStitchingImages = (incomingFiles: File[]) => {
    if (!incomingFiles.length) return;

    const mapped = incomingFiles.map(file => ({
      id: Date.now().toString() + Math.random().toString(),
      file,
      url: URL.createObjectURL(file),
      name: file.name
    }));

    setStitchingImages(prev => [...prev, ...mapped]);
  };

  const hasPromptInput = prompt.trim().length > 0;
  const hasCustomUploads = canvasState.images.length > 0;
  const hasStitchingUploads = stitchingImages.length > 0;
  const hasModeUploads = puzzleMode === 'custom' ? hasCustomUploads : hasStitchingUploads;
  const creditsRequired = outputCount * 10;
  const totalAvailableCredits = user ? user.availableCredits ?? (user.teamCredits ?? 0) + (user.credits ?? 0) : 0;
  const hasEnoughCredits = totalAvailableCredits >= creditsRequired;
  const canTriggerGeneration = Boolean(user) && !generating && hasEnoughCredits && (hasPromptInput || hasModeUploads);
  const exportBackgroundColor = useCanvasBackground ? backgroundColor : 'transparent'
  const displayBackgroundColor = useCanvasBackground ? backgroundColor : '#040913'

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
    const nextSize = { width: size.width, height: size.height }
    bottomDimensionsRef.current = nextSize
    if (puzzleMode === 'custom' || (puzzleMode === 'stitching' && stitchingCanvasSizing === 'bottom')) {
      setCanvasSize(nextSize)
    }
  }, [bottomDimensionsRef, puzzleMode, setCanvasSize, stitchingCanvasSizing])







  // 处理拼图子模式切换
  const handlePuzzleModeChange = (newPuzzleMode: PuzzleMode) => {
    setPuzzleMode(newPuzzleMode)
    setResults([])
    setShowResults(false)
    setGeneratedImages([]) // 清空生成记录
    setShowGenerationPanel(false) // 隐藏面板
    if (newPuzzleMode === 'stitching') {
      const nextSize = stitchingCanvasSizing === 'default'
        ? { ...STITCHING_DEFAULT_CANVAS }
        : { ...bottomDimensionsRef.current }
      setCanvasSize(nextSize)
    } else {
      setCanvasSize({ ...bottomDimensionsRef.current })
    }
  }

  const puzzleModeTabs = [
    { key: 'custom' as PuzzleMode, label: '自定义画布', description: '自由布局与绘制', icon: Brush },
    { key: 'stitching' as PuzzleMode, label: '图像拼接', description: '智能排列合成', icon: Layers }
  ]

  const handleStitchingCanvasSizingChange = useCallback((mode: 'default' | 'bottom') => {
    setStitchingCanvasSizing(mode)
    if (puzzleMode === 'stitching') {
      const nextSize = mode === 'default'
        ? { ...STITCHING_DEFAULT_CANVAS }
        : { ...bottomDimensionsRef.current }
      setCanvasSize(nextSize)
    }
  }, [bottomDimensionsRef, puzzleMode, setCanvasSize])

  // 图像拼接工具函数
  const generateStitchedImage = (
    images: UploadedImage[],
    layout: string,
    size: { width: number; height: number },
    bgColor?: string | null
  ): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const canvasWidth = Math.max(1, size.width);
      const canvasHeight = Math.max(1, size.height);
      
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      
      if (bgColor && bgColor !== 'transparent') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      } else {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      }
      
      const loadImagePromises = images.map(img => {
        return new Promise<HTMLImageElement>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = img.url;
        });
      });
      
      Promise.all(loadImagePromises).then((loadedImages) => {
        const padding = Math.min(canvasWidth, canvasHeight) * 0.02;
        
        if (layout === '2h' && loadedImages.length >= 2) {
          const imgWidth = (canvasWidth - padding * 3) / 2;
          const imgHeight = canvasHeight - padding * 2;
          drawScaledImage(ctx, loadedImages[0], padding, padding, imgWidth, imgHeight);
          drawScaledImage(ctx, loadedImages[1], padding * 2 + imgWidth, padding, imgWidth, imgHeight);
        } else if (layout === '2v' && loadedImages.length >= 2) {
          const imgWidth = canvasWidth - padding * 2;
          const imgHeight = (canvasHeight - padding * 3) / 2;
          drawScaledImage(ctx, loadedImages[0], padding, padding, imgWidth, imgHeight);
          drawScaledImage(ctx, loadedImages[1], padding, padding * 2 + imgHeight, imgWidth, imgHeight);
        } else if (layout === '3l' && loadedImages.length >= 3) {
          const leftWidth = (canvasWidth - padding * 3) * 0.6;
          const rightWidth = (canvasWidth - padding * 3) * 0.4;
          const halfHeight = (canvasHeight - padding * 3) / 2;
          
          drawScaledImage(ctx, loadedImages[0], padding, padding, leftWidth, canvasHeight - padding * 2);
          drawScaledImage(ctx, loadedImages[1], padding * 2 + leftWidth, padding, rightWidth, halfHeight);
          drawScaledImage(ctx, loadedImages[2], padding * 2 + leftWidth, padding * 2 + halfHeight, rightWidth, halfHeight);
        } else if (layout === '3r' && loadedImages.length >= 3) {
          const leftWidth = (canvasWidth - padding * 3) * 0.4;
          const rightWidth = (canvasWidth - padding * 3) * 0.6;
          const halfHeight = (canvasHeight - padding * 3) / 2;
          
          drawScaledImage(ctx, loadedImages[0], padding, padding, leftWidth, halfHeight);
          drawScaledImage(ctx, loadedImages[1], padding, padding * 2 + halfHeight, leftWidth, halfHeight);
          drawScaledImage(ctx, loadedImages[2], padding * 2 + leftWidth, padding, rightWidth, canvasHeight - padding * 2);
        } else if (layout === '4g' && loadedImages.length >= 4) {
          const cellWidth = (canvasWidth - padding * 3) / 2;
          const cellHeight = (canvasHeight - padding * 3) / 2;
          drawScaledImage(ctx, loadedImages[0], padding, padding, cellWidth, cellHeight);
          drawScaledImage(ctx, loadedImages[1], padding * 2 + cellWidth, padding, cellWidth, cellHeight);
          drawScaledImage(ctx, loadedImages[2], padding, padding * 2 + cellHeight, cellWidth, cellHeight);
          drawScaledImage(ctx, loadedImages[3], padding * 2 + cellWidth, padding * 2 + cellHeight, cellWidth, cellHeight);
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
      generateStitchedImage(stitchingImages, stitchingLayout, canvasState.canvasSize, exportBackgroundColor)
        .then(previewUrl => {
          updatePreviewImage(previewUrl);
        })
        .catch(() => {
          updatePreviewImage('');
        });
    } else {
      updatePreviewImage('');
    }
  }, [
    stitchingImages,
    stitchingLayout,
    canvasState.canvasSize.width,
    canvasState.canvasSize.height,
    exportBackgroundColor,
    updatePreviewImage
  ]);


  const handleGenerate = async () => {
    if (!user) return;

    if (!hasPromptInput && !hasModeUploads) {
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
      const referenceFiles: File[] = [];

      if (puzzleMode === 'custom') {
        const snapshot = collageCanvasRef.current?.captureCompositeImage({ backgroundColor: exportBackgroundColor });
        if (snapshot) {
          referenceFiles.push(await dataUrlToFile(snapshot, `puzzle-custom-${Date.now()}.png`));
        }
      } else {
        let stitchedSnapshot = previewImage;
        if (!stitchedSnapshot && stitchingImages.length >= 2) {
          stitchedSnapshot = await generateStitchedImage(
            stitchingImages,
            stitchingLayout,
            canvasState.canvasSize,
            exportBackgroundColor
          );
        }
        if (stitchedSnapshot) {
          referenceFiles.push(await dataUrlToFile(stitchedSnapshot, `puzzle-stitch-${Date.now()}.png`));
        } else if (stitchingImages.length) {
          referenceFiles.push(stitchingImages[0].file);
        }
      }

      if (!referenceFiles.length) {
        throw new Error('请先生成或上传至少一张拼图素材');
      }

      setGeneratingProgress(25);
      const uploadResponse = await api.uploadImages(referenceFiles, user.code);
      if (!uploadResponse.success || !uploadResponse.files.length) {
        throw new Error(uploadResponse.message || '图片上传失败');
      }

      setGeneratingProgress(45);

      const moduleName = puzzleMode === 'custom'
        ? 'AI图像:拼图模式-自定义画布'
        : 'AI图像:拼图模式-图像拼接';

      const request: GenerateRequest = {
        auth_code: user.code,
        module_name: moduleName,
        media_type: 'image',
        prompt_text: prompt.trim(),
        output_count: outputCount,
        image_paths: uploadResponse.files.map(file => file.storage_key),
        model_name: selectedModel,
        aspect_ratio: bottomAspectRatio,
        image_size: RESOLUTION_TO_IMAGE_SIZE[puzzleResolutionId] ?? '1K',
        mode_type: puzzleMode === 'custom' ? 'puzzle_custom_canvas' : 'puzzle_image_merge'
      };

      const response = await api.generateImages(request);
      if (!response.success || !response.output_images?.length) {
        throw new Error(response.message || '生成失败，请稍后重试');
      }

      const generated = response.output_images ?? [];
      setGeneratingProgress(90);
      setGeneratedImages(prev => [...generated, ...prev].slice(0, 30));
      setShowGenerationPanel(true);
      setGeneratingProgress(100);
      await refreshUserInfo();
    } catch (error) {
      console.error('生成处理失败:', error);
      alert(error instanceof Error ? error.message : '生成失败，请稍后重试');
    } finally {
      setGenerating(false);
      setGeneratingProgress(0);
    }
  };


  const handleAddFiles = (files: File[]) => {
    if (puzzleMode === 'custom') {
      appendCustomImages(files);
    } else {
      appendStitchingImages(files);
    }
  };

  const imageCount = puzzleMode === 'custom' ? canvasState.images.length : stitchingImages.length;
  const maxFiles: number | null = null;

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

  const waitForNextFrame = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

  const handleOpenPreviewEditor = async () => {
    await waitForNextFrame();
    const snapshot = collageCanvasRef.current?.captureCompositeImage({ backgroundColor: exportBackgroundColor });
    const source = snapshot || previewImage;
    if (!source) {
      alert('请先生成或上传图片再进行编辑');
      return;
    }

    if (snapshot) {
      updatePreviewImage(snapshot, true);
    }

    setCurrentEditImageInfo({ id: `preview-${Date.now()}`, url: source });
    setIsEditingPreview(true);
    setEditModalOpen(true);
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
      updatePreviewImage(editedImageData, false);
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

  const handleStitchingDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) {
      return;
    }
    setStitchingImages(prev => {
      const reordered = [...prev];
      const [removed] = reordered.splice(result.source.index, 1);
      reordered.splice(result.destination.index, 0, removed);
      return reordered;
    });
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

  const renderStitchingUploadItem = (
    image: UploadedImage,
    index: number,
    dragProvided: DraggableProvided,
    dragSnapshot: DraggableStateSnapshot,
    options?: { isClone?: boolean }
  ) => {
    const isSelected = selectedStitchingImageId === image.id;
    return (
      <div
        ref={dragProvided.innerRef}
        {...dragProvided.draggableProps}
        {...dragProvided.dragHandleProps}
        onClick={() => {
          if (!options?.isClone) {
            setSelectedStitchingImageId(image.id);
          }
        }}
        className={`relative group flex items-center gap-3 rounded-2xl border px-3 py-2 transition-all duration-300 cursor-grab active:cursor-grabbing ${
          isSelected
            ? 'border-cyan-400/60 bg-cyan-500/10 text-white shadow-[0_10px_40px_rgba(6,182,212,0.35)]'
            : 'border-white/10 bg-white/5 hover:border-cyan-400/30 hover:bg-white/10'
        } ${
          dragSnapshot.isDragging
            ? 'border-cyan-300/70 bg-cyan-500/20 shadow-[0_15px_50px_rgba(6,182,212,0.45)]'
            : ''
        }`}
        style={{
          ...dragProvided.draggableProps.style,
          touchAction: 'none',
          pointerEvents: options?.isClone ? 'none' : undefined,
          zIndex: dragSnapshot.isDragging ? 20 : undefined
        }}
      >
        <img
          src={image.url}
          alt={image.name}
          className="h-10 w-10 rounded-xl border border-white/15 object-cover shadow-inner shadow-black/30"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-white truncate">{image.name}</div>
        </div>
        <div className={`absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#03070f]/90 px-1.5 py-1 shadow-[0_5px_25px_rgba(0,0,0,0.65)] transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}>
          <button
            onClick={(e) => { e.stopPropagation(); handleEditStitchingImage(image); }}
            className="flex h-6 w-6 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/40 transition-all duration-300 hover:scale-105"
            title="绘图"
          >
            <Palette className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleMoveStitchingImage(image.id, 'up'); }}
            className="flex h-6 w-6 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition-all duration-300 hover:border-cyan-300/40 hover:scale-105"
            title="上移"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleMoveStitchingImage(image.id, 'down'); }}
            className="flex h-6 w-6 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition-all duration-300 hover:border-cyan-300/40 hover:scale-105"
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
            className="flex h-6 w-6 items-center justify-center rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/40 transition-all duration-300 hover:scale-105"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
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
                    <div className="mb-6 rounded-[28px] border border-white/10 bg-[#050913]/70 px-4 py-3 shadow-[0_18px_70px_rgba(3,7,18,0.7)] backdrop-blur-2xl">
                      <div className="flex items-center gap-3">
                        {puzzleModeTabs.map((tab) => {
                          const Icon = tab.icon
                          const isActive = puzzleMode === tab.key
                          return (
                            <button
                              key={tab.key}
                              onClick={() => handlePuzzleModeChange(tab.key)}
                              className={`group relative flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-medium transition-all duration-200 ${
                                isActive
                                  ? 'bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-white shadow-[0_10px_30px_rgba(6,182,212,0.45)]'
                                  : 'text-gray-300 hover:text-white'
                              }`}
                            >
                              <span
                                className={`flex h-9 w-9 items-center justify-center rounded-xl border text-xs transition-all duration-200 ${
                                  isActive
                                    ? 'border-transparent bg-gradient-to-br from-cyan-400 to-indigo-500 text-white'
                                    : 'border-white/15 bg-white/5 text-cyan-200/70 group-hover:border-cyan-300/40'
                                }`}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="text-left">
                                <div className="text-sm font-semibold tracking-wide">{tab.label}</div>
                                <div className="text-[11px] text-gray-400 group-hover:text-gray-200">
                                  {tab.description}
                                </div>
                              </div>
                              {isActive && (
                                <span className="absolute inset-0 rounded-2xl border border-cyan-400/50 opacity-60"></span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                  {puzzleMode === 'custom' ? (
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-4 xl:gap-6">
                      <div className="xl:col-span-3">
                        <div className="min-h-[500px] max-w-full overflow-hidden rounded-[32px] border border-cyan-400/30 bg-[#03060c]/90 p-4 shadow-[0_25px_90px_rgba(3,7,18,0.85)]">
                          <CollageCanvas
                            ref={collageCanvasRef}
                            backgroundColor={displayBackgroundColor}
                            startCropping={(image) => setCroppingImage({ id: image.id, url: image.url })}
                          />
                        </div>
                      </div>
                      
                      <div className="xl:col-span-1">
                        <div className="sticky top-6 space-y-4">
                          <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/15 via-[#050b17]/80 to-[#03070f]/95 p-5 backdrop-blur-2xl shadow-[0_20px_70px_rgba(3,7,18,0.7)]">
                            <h5 className="mb-4 flex items-center justify-between text-sm font-medium text-gray-100">
                              <span className="flex items-center gap-2">
                                <Layers className="h-4 w-4 text-cyan-300" />
                                画布信息
                              </span>
                              {canvasState.images.length > 0 && (
                                <button
                                  onClick={() => {
                                    if (window.confirm('确定要清空画布吗？此操作不可恢复！')) {
                                      resetCanvas();
                                    }
                                  }}
                                  className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-200 transition-all duration-300 hover:-translate-y-0.5 hover:bg-rose-500/20"
                                >
                                  重置画布
                                </button>
                              )}
                            </h5>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between rounded-2xl border border-cyan-400/30 bg-[#040913]/80 px-4 py-3 text-sm text-cyan-50/80 shadow-inner shadow-cyan-500/20">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.4em] text-cyan-200/70">当前比例</div>
                                  <div className="mt-1 text-base font-semibold text-white">{bottomAspectRatio}</div>
                                </div>
                                <div className="text-right text-xs text-gray-400">
                                  {canvasState.canvasSize.width}x{canvasState.canvasSize.height}px
                                  <div className="mt-0.5 text-[11px] text-gray-500">底部面板可调</div>
                                </div>
                              </div>
                              <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.35em] text-gray-400/80">背景色</label>
                                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-[#050b17]/70 px-3 py-3 text-gray-300">
                                  <label className="flex items-center gap-2 text-sm text-gray-200">
                                    <input
                                      type="checkbox"
                                      checked={useCanvasBackground}
                                      onChange={(e) => setUseCanvasBackground(e.target.checked)}
                                      className="h-4 w-4 rounded border-gray-500 text-cyan-400 focus:ring-cyan-400"
                                    />
                                    使用背景色
                                  </label>
                                  <input
                                    type="color"
                                    value={backgroundColor}
                                    onChange={(e) => setBackgroundColor(e.target.value)}
                                    disabled={!useCanvasBackground}
                                    className={`h-9 w-9 rounded-xl border bg-transparent p-0.5 ${
                                      useCanvasBackground
                                        ? 'cursor-pointer border-white/20'
                                        : 'cursor-not-allowed border-white/10 opacity-50'
                                    }`}
                                    title="选择背景色"
                                  />
                                  <span className="text-xs text-gray-400">
                                    {useCanvasBackground ? backgroundColor : '透明背景'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-white/10 via-[#050b17]/70 to-[#040913]/90 p-5 backdrop-blur-2xl shadow-[0_20px_70px_rgba(3,7,18,0.7)]">
                            <h5 className="mb-3 flex items-center text-sm font-medium text-gray-100">
                              <Palette className="mr-2 h-4 w-4 text-cyan-300" />
                              绘制工具
                            </h5>
                            
                            <div className="mb-4">
                              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.35em] text-gray-400/80">
                                工具
                              </label>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setDrawingMode('brush')}
                                  className={`flex-1 flex items-center justify-center rounded-2xl border px-3 py-2 text-sm font-medium transition-all duration-300 ${
                                    drawingTools.mode === 'brush'
                                      ? 'border-cyan-400 bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/40'
                                      : 'border-white/10 bg-white/5 text-gray-300 hover:border-cyan-300/40 hover:text-white'
                                  }`}
                                  title="画笔"
                                >
                                  <Brush className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setDrawingMode('eraser')}
                                  className={`flex-1 flex items-center justify-center rounded-2xl border px-3 py-2 text-sm font-medium transition-all duration-300 ${
                                    drawingTools.mode === 'eraser'
                                      ? 'border-emerald-400 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/40'
                                      : 'border-white/10 bg-white/5 text-gray-300 hover:border-emerald-300/40 hover:text-white'
                                  }`}
                                  title="橡皮擦"
                                >
                                  <Eraser className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => drawingActions.undo?.()}
                                  disabled={!drawingActions.canUndo}
                                  className="flex-1 flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-gray-200 transition-all duration-300 hover:border-cyan-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  title="撤销 (Ctrl+Z)"
                                >
                                  <Undo2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => drawingActions.redo?.()}
                                  disabled={!drawingActions.canRedo}
                                  className="flex-1 flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-gray-200 transition-all duration-300 hover:border-cyan-300/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                  title="重做 (Ctrl+Y)"
                                >
                                  <Redo2 className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (window.confirm('确定要清空所有涂鸦吗？')) {
                                      clearDrawings();
                                    }
                                  }}
                                  className="flex-1 flex items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-amber-200 transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-500/20"
                                  title="清空涂鸦"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mb-4">
                              <label className="mb-2 block text-xs font-semibold text-gray-300">
                                画笔大小: {drawingTools.brushSize}px
                              </label>
                              <input
                                type="range"
                                min="1"
                                max="50"
                                value={drawingTools.brushSize}
                                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400"
                              />
                            </div>

                            {drawingTools.mode === 'brush' && (
                              <div className="mb-4">
                              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-gray-400/80">
                                涂抹方式
                              </label>
                                <div className="grid grid-cols-3 gap-2">
                                  <button
                                    onClick={() => setBrushShape('point')}
                                    className={`flex items-center justify-center rounded-2xl border px-3 py-2 transition-all duration-300 ${
                                      drawingTools.brushShape === 'point'
                                        ? 'border-cyan-400 bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/30'
                                        : 'border-white/10 bg-white/5 text-gray-300 hover:border-cyan-300/40 hover:text-white'
                                    }`}
                                    title="点状"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setBrushShape('square')}
                                    className={`flex items-center justify-center rounded-2xl border px-3 py-2 transition-all duration-300 ${
                                      drawingTools.brushShape === 'square'
                                        ? 'border-fuchsia-400 bg-gradient-to-r from-fuchsia-500 to-orange-500 text-white shadow-lg shadow-fuchsia-500/30'
                                        : 'border-white/10 bg-white/5 text-gray-300 hover:border-fuchsia-300/40 hover:text-white'
                                    }`}
                                    title="方形"
                                  >
                                    <Square className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setBrushShape('circle')}
                                    className={`flex items-center justify-center rounded-2xl border px-3 py-2 transition-all duration-300 ${
                                      drawingTools.brushShape === 'circle'
                                        ? 'border-amber-300 bg-gradient-to-r from-amber-300 to-lime-400 text-gray-900 shadow-lg shadow-amber-400/30'
                                        : 'border-white/10 bg-white/5 text-gray-300 hover:border-amber-200/40 hover:text-white'
                                    }`}
                                    title="圆形"
                                  >
                                    <Circle className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                            
                            {drawingTools.mode === 'brush' && (
                              <div>
                              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-gray-400/80">
                                画笔颜色
                              </label>
                                <div className="mb-3 grid grid-cols-4 gap-2">
                                  {['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'].map(color => (
                                    <button
                                      key={color}
                                      onClick={() => setBrushColor(color)}
                                      className={`h-9 w-9 rounded-xl border-2 transition-all duration-200 ${
                                        drawingTools.brushColor === color
                                          ? 'scale-105 border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.5)]'
                                          : 'border-white/10 hover:border-cyan-300/60 hover:scale-105'
                                      }`}
                                      style={{ backgroundColor: color }}
                                    />
                                  ))}
                                </div>
                                <input
                                  type="color"
                                  value={drawingTools.brushColor}
                                  onChange={(e) => setBrushColor(e.target.value)}
                                  className="h-12 w-full cursor-pointer rounded-2xl border border-white/15 bg-white/5 p-1 shadow-inner shadow-black/30"
                                />
                              </div>
                            )}
                          </div>
                          
                          {canvasState.images.length > 0 && (
                            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur-2xl shadow-[0_15px_60px_rgba(3,7,18,0.65)]">
                              <h5 className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-gray-400/80">
                                画布图片 ({canvasState.images.length})
                              </h5>
                              <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
                                {canvasState.images.map((image, index) => (
                                  <div
                                    key={image.id}
                                    onClick={() => selectImage(image.id)}
                                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 transition-all duration-300 ${
                                      image.selected
                                        ? 'border-cyan-400/60 bg-cyan-500/10 text-white shadow-[0_10px_40px_rgba(6,182,212,0.35)]'
                                        : 'border-white/10 bg-white/5 hover:border-cyan-400/30 hover:bg-white/10'
                                    }`}
                                  >
                                    <img
                                      src={image.url}
                                      alt={image.name}
                                      className="h-9 w-9 rounded-xl border border-white/15 object-cover shadow-inner shadow-black/30"
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
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
                      <div className="lg:col-span-1">
                        <div className="space-y-5">
                          <p className="text-sm text-gray-400/80">在下方的悬浮窗口上传图片开始拼接。</p>
                          
                          {stitchingImages.length > 0 && (
                            <div className="space-y-2 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-2xl shadow-[0_15px_60px_rgba(3,7,18,0.65)]">
                              <h5 className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400/80">已上传 ({stitchingImages.length})</h5>
                              <DragDropContext onDragEnd={handleStitchingDragEnd}>
                                <Droppable
                                  droppableId="stitchingUploads"
                                  renderClone={(provided, snapshot, rubric) => {
                                    const draggedImage = stitchingImages[rubric.source.index];
                                    if (!draggedImage) return null;
                                    return renderStitchingUploadItem(
                                      draggedImage,
                                      rubric.source.index,
                                      provided,
                                      snapshot,
                                      { isClone: true }
                                    );
                                  }}
                                >
                                  {(dropProvided, dropSnapshot) => (
                                    <div
                                      ref={dropProvided.innerRef}
                                      {...dropProvided.droppableProps}
                                      className={`space-y-2 rounded-2xl transition-colors ${
                                        dropSnapshot.isDraggingOver ? 'bg-white/5 p-2' : ''
                                      }`}
                                    >
                                      {stitchingImages.map((image, index) => (
                                        <Draggable key={image.id} draggableId={image.id} index={index}>
                                          {(dragProvided, dragSnapshot) =>
                                            renderStitchingUploadItem(image, index, dragProvided, dragSnapshot)
                                          }
                                        </Draggable>
                                      ))}
                                      {dropProvided.placeholder}
                                    </div>
                                  )}
                                </Droppable>
                              </DragDropContext>
                            </div>
                          )}
                          
                          {stitchingImages.length >= 2 && (
                            <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/5 p-4 backdrop-blur-2xl shadow-[0_15px_60px_rgba(3,7,18,0.65)]">
                              <div>
                                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.35em] text-gray-400/80">画布配置</label>
                                <div className="space-y-3 rounded-2xl border border-white/10 bg-[#050b17]/70 px-3 py-3 text-gray-300">
                                  <div className="space-y-2">
                                    <span className="text-[11px] uppercase tracking-[0.2em] text-gray-400">尺寸来源</span>
                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        onClick={() => handleStitchingCanvasSizingChange('default')}
                                        className={`flex flex-col rounded-2xl border px-3 py-2 text-left text-xs transition-all duration-300 ${
                                          stitchingCanvasSizing === 'default'
                                            ? 'border-cyan-300/70 bg-gradient-to-br from-cyan-500/20 to-sky-500/30 text-white shadow-[0_8px_30px_rgba(6,182,212,0.35)]'
                                            : 'border-white/10 bg-white/5 text-gray-300 hover:border-cyan-300/40 hover:text-white'
                                        }`}
                                      >
                                        <span className="text-sm font-semibold">1536 × 1536</span>
                                        <span className="text-[11px] text-gray-400">默认毛玻璃画布</span>
                                      </button>
                                      <button
                                        onClick={() => handleStitchingCanvasSizingChange('bottom')}
                                        className={`flex flex-col rounded-2xl border px-3 py-2 text-left text-xs transition-all duration-300 ${
                                          stitchingCanvasSizing === 'bottom'
                                            ? 'border-purple-300/70 bg-gradient-to-br from-purple-500/20 to-indigo-500/30 text-white shadow-[0_8px_30px_rgba(167,139,250,0.35)]'
                                            : 'border-white/10 bg-white/5 text-gray-300 hover:border-purple-300/40 hover:text-white'
                                        }`}
                                      >
                                        <span className="text-sm font-semibold">跟随底部尺寸</span>
                                        <span className="text-[11px] text-gray-400">沿用下方悬浮面板</span>
                                      </button>
                                    </div>
                                    <p className="text-[11px] text-gray-500">
                                      {stitchingCanvasSizing === 'default'
                                        ? '预设画布为 1536x1536，不受底部面板影响'
                                        : `当前画布：${canvasState.canvasSize.width}x${canvasState.canvasSize.height}px`}
                                    </p>
                                  </div>
                                  <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[#03050b]/70 px-3 py-2">
                                    <label className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gray-300">
                                      <input
                                        type="checkbox"
                                        checked={useCanvasBackground}
                                        onChange={(e) => setUseCanvasBackground(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-500 text-cyan-400 focus:ring-cyan-400"
                                      />
                                      启用背景色
                                    </label>
                                    <div className="flex items-center gap-3">
                                      <input
                                        type="color"
                                        value={backgroundColor}
                                        onChange={(e) => setBackgroundColor(e.target.value)}
                                        disabled={!useCanvasBackground}
                                        className={`h-9 w-9 rounded-xl border bg-transparent p-0.5 ${
                                          useCanvasBackground
                                            ? 'cursor-pointer border-white/20'
                                            : 'cursor-not-allowed border-white/10 opacity-50'
                                        }`}
                                      />
                                      <span className="text-xs text-gray-400">
                                        {useCanvasBackground ? backgroundColor : '透明背景'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="lg:col-span-2">
                        <div className="h-full max-w-full">
                          {stitchingImages.length >= 2 ? (
                            <div className="space-y-5">
                              <div>
                                <h5 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-gray-200">选择布局样式</h5>
                                <div className="flex flex-wrap gap-2 sm:gap-3">
                                  {stitchingImages.length >= 2 && (
                                    <>
                                      <button
                                        onClick={() => setStitchingLayout('2h')}
                                        className={`flex min-w-[120px] flex-col items-center justify-center rounded-2xl border px-3 py-3 text-xs transition-all duration-300 ${
                                          stitchingLayout === '2h'
                                            ? 'border-cyan-400 bg-gradient-to-br from-cyan-500/30 to-sky-500/40 text-white shadow-[0_10px_35px_rgba(6,182,212,0.45)]'
                                            : 'border-white/10 bg-white/5 text-gray-400 hover:border-cyan-300/40 hover:text-white'
                                        }`}
                                      >
                                        <div className="mb-1 flex gap-1">
                                          <div className="h-6 w-4 rounded-sm bg-white/60"></div>
                                          <div className="h-6 w-4 rounded-sm bg-white/60"></div>
                                        </div>
                                        <div className="text-[11px]">左右排列</div>
                                      </button>
                                      <button
                                        onClick={() => setStitchingLayout('2v')}
                                        className={`flex min-w-[120px] flex-col items-center justify-center rounded-2xl border px-3 py-3 text-xs transition-all duration-300 ${
                                          stitchingLayout === '2v'
                                            ? 'border-purple-400 bg-gradient-to-br from-purple-500/30 to-indigo-500/40 text-white shadow-[0_10px_35px_rgba(168,85,247,0.45)]'
                                            : 'border-white/10 bg-white/5 text-gray-400 hover:border-purple-300/40 hover:text-white'
                                        }`}
                                      >
                                        <div className="mb-1 flex flex-col gap-1">
                                          <div className="h-3 w-8 rounded-sm bg-white/60"></div>
                                          <div className="h-3 w-8 rounded-sm bg-white/60"></div>
                                        </div>
                                        <div className="text-[11px]">上下排列</div>
                                      </button>
                                    </>
                                  )}
                                  {stitchingImages.length >= 3 && (
                                    <>
                                      <button
                                        onClick={() => setStitchingLayout('3l')}
                                        className={`flex min-w-[120px] flex-col items-center justify-center rounded-2xl border px-3 py-3 text-xs transition-all duration-300 ${
                                          stitchingLayout === '3l'
                                            ? 'border-emerald-400 bg-gradient-to-br from-emerald-500/30 to-cyan-500/40 text-white shadow-[0_10px_35px_rgba(16,185,129,0.45)]'
                                            : 'border-white/10 bg-white/5 text-gray-400 hover:border-emerald-300/40 hover:text-white'
                                        }`}
                                      >
                                        <div className="mb-1 flex h-7 items-end gap-1">
                                          <div className="h-7 w-5 rounded-sm bg-white/60"></div>
                                          <div className="flex flex-col gap-1">
                                            <div className="h-3 w-3 rounded-sm bg-white/60"></div>
                                            <div className="h-3 w-3 rounded-sm bg-white/60"></div>
                                          </div>
                                        </div>
                                        <div className="text-[11px]">L型(左大)</div>
                                      </button>
                                      <button
                                        onClick={() => setStitchingLayout('3r')}
                                        className={`flex min-w-[120px] flex-col items-center justify-center rounded-2xl border px-3 py-3 text-xs transition-all duration-300 ${
                                          stitchingLayout === '3r'
                                            ? 'border-amber-400 bg-gradient-to-br from-amber-400/30 to-orange-500/40 text-white shadow-[0_10px_35px_rgba(245,158,11,0.4)]'
                                            : 'border-white/10 bg-white/5 text-gray-400 hover:border-amber-300/40 hover:text-white'
                                        }`}
                                      >
                                        <div className="mb-1 flex h-7 items-end gap-1">
                                          <div className="flex flex-col gap-1">
                                            <div className="h-3 w-3 rounded-sm bg-white/60"></div>
                                            <div className="h-3 w-3 rounded-sm bg-white/60"></div>
                                          </div>
                                          <div className="h-7 w-5 rounded-sm bg-white/60"></div>
                                        </div>
                                        <div className="text-[11px]">L型(右大)</div>
                                      </button>
                                    </>
                                  )}
                                  {stitchingImages.length >= 4 && (
                                    <button
                                      onClick={() => setStitchingLayout('4g')}
                                      className={`flex min-w-[120px] flex-col items-center justify-center rounded-2xl border px-3 py-3 text-xs transition-all duration-300 ${
                                        stitchingLayout === '4g'
                                          ? 'border-pink-400 bg-gradient-to-br from-pink-500/30 to-purple-500/40 text-white shadow-[0_10px_35px_rgba(236,72,153,0.45)]'
                                          : 'border-white/10 bg-white/5 text-gray-400 hover:border-pink-300/40 hover:text-white'
                                      }`}
                                    >
                                      <div className="mb-1 grid grid-cols-2 gap-1">
                                        <div className="h-4 w-4 rounded-sm bg-white/60"></div>
                                        <div className="h-4 w-4 rounded-sm bg-white/60"></div>
                                        <div className="h-4 w-4 rounded-sm bg-white/60"></div>
                                        <div className="h-4 w-4 rounded-sm bg-white/60"></div>
                                      </div>
                                      <div className="text-[11px]">四宫格</div>
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex-1">
                                <div className="max-w-full overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-white/10 via-[#050b17]/70 to-[#03070f]/90 p-6 backdrop-blur-2xl shadow-[0_25px_90px_rgba(3,7,18,0.85)]">
                                  <div className="flex items-center justify-center" style={{ maxHeight: '60vh' }}>
                                    {previewImage ? (
                                      <div className="relative max-w-full max-h-full group">
                                        <img
                                          src={previewImage}
                                          alt="拼接预览"
                                          className="max-h-full max-w-full rounded-[24px] border border-cyan-400/30 bg-black/60 object-contain shadow-[0_25px_80px_rgba(6,182,212,0.35)]"
                                          style={{
                                            maxWidth: 'min(500px, 100%)',
                                            maxHeight: 'min(500px, 60vh)'
                                          }}
                                        />
                                        <button
                                          onClick={handleOpenPreviewEditor}
                                          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/40 transition-all duration-300 hover:scale-105"
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
                            <div className="flex h-full items-center justify-center rounded-[32px] border border-white/10 bg-white/5 p-8 text-gray-400 backdrop-blur-2xl">
                              <div className="text-center">
                                <Images className="mx-auto mb-4 h-16 w-16 opacity-50" />
                                <p className="mb-2 text-lg">图像拼接模式</p>
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
          disableUploadLimit
          hideUploadUsage
          initialModel={selectedModel}
          onModelChange={setSelectedModel}
          initialAspectRatio="1:1"
          onAspectRatioChange={setBottomAspectRatio}
          onResolutionChange={setPuzzleResolutionId}
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
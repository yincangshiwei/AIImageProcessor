import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Brush, Eraser, Trash2, Undo2, Redo2, Crop as CropIcon, Check, Square, Circle, Minus } from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onSave: (editedImageData: string) => void;
  imageId?: string;
}

const ImageEditModal: React.FC<ImageEditModalProps> = ({
  isOpen,
  onClose,
  imageSrc,
  onSave,
  imageId
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const selectedToolRef = useRef<'brush' | 'eraser' | 'crop'>('brush');
  const [currentImageSrc, setCurrentImageSrc] = useState(imageSrc);
  const [selectedTool, setSelectedTool] = useState<'brush' | 'eraser' | 'crop'>('brush');
  const [brushShape, setBrushShape] = useState<'point' | 'square' | 'circle'>('point');
  const [brushSize, setBrushSize] = useState<number>(10);
  const [brushColor, setBrushColor] = useState<string>('#ff0000');
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [lastPosition, setLastPosition] = useState<{ x: number; y: number } | null>(null);

  // New state for cropping
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [initialOverlayData, setInitialOverlayData] = useState<string | null>(null);

  const baseStorageKey = imageId ? `image-edit-base:${imageId}` : null;
  const overlayStorageKey = imageId ? `image-edit-overlay:${imageId}` : null;

  const readStorageValue = (key: string | null): string | null => {
    if (!key || typeof window === 'undefined') return null;

    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      console.warn('读取历史编辑记录失败:', error);
      return null;
    }
  };

  const setStorageValue = (key: string | null, value: string | null) => {
    if (!key || typeof window === 'undefined') return;

    try {
      if (value) {
        window.localStorage.setItem(key, value);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('写入历史编辑记录失败:', error);
    }
  };

  // 撤销/重做栈（使用 ref 存储以避免频繁重渲染），并用 state 记录数量用于按钮禁用态
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const [undoCount, setUndoCount] = useState<number>(0);
  const [redoCount, setRedoCount] = useState<number>(0);

  // Reset state when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setSelectedTool('brush');
    setCrop(undefined);
    setCompletedCrop(undefined);
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);
    setRedoCount(0);

    let nextImageSource = imageSrc;

    if (baseStorageKey && imageSrc) {
      const storedBaseImage = readStorageValue(baseStorageKey);
      if (storedBaseImage) {
        nextImageSource = storedBaseImage;
      } else {
        setStorageValue(baseStorageKey, imageSrc);
      }
    }

    if (overlayStorageKey) {
      setInitialOverlayData(readStorageValue(overlayStorageKey));
    } else {
      setInitialOverlayData(null);
    }

    setCurrentImageSrc(nextImageSource);
  }, [isOpen, imageSrc, baseStorageKey, overlayStorageKey]);

  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);

  // 初始化画布
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !imageRef.current) return;
    if (selectedToolRef.current === 'crop') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    if (!ctx) return;

    const applyStoredOverlay = () => {
      if (!initialOverlayData) return;
      const overlayImage = new Image();
      overlayImage.onload = () => {
        ctx.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);
      };
      overlayImage.src = initialOverlayData;
    };

    const initCanvas = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const container = canvas.parentElement as HTMLElement | null;
      const containerRect = container?.getBoundingClientRect();
      const imageRect = img.getBoundingClientRect();
      const displayWidth = containerRect?.width || imageRect.width || img.naturalWidth;
      const displayHeight = containerRect?.height || imageRect.height || img.naturalHeight;

      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      applyStoredOverlay();
    };

    let imageLoadHandler: (() => void) | null = null;

    if (img.complete) {
      initCanvas();
    } else {
      imageLoadHandler = () => initCanvas();
      img.onload = imageLoadHandler;
    }

    const handleResize = () => initCanvas();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (img && imageLoadHandler) {
        img.onload = null;
      }
    };
  }, [isOpen, currentImageSrc, initialOverlayData]); // Depend on currentImageSrc

  // 开始绘制
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || selectedTool === 'crop') return; // Don't draw when cropping
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // 在开始绘制之前记录当前涂抹层快照，支持撤销到绘制前状态
    const ctx = canvas.getContext('2d');
    if (ctx) {
      try {
        const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        undoStackRef.current.push(snapshot);
        setUndoCount(undoStackRef.current.length);
        // 开始新的操作时清空重做栈
        redoStackRef.current = [];
        setRedoCount(0);
      } catch (err) {
        // 某些情况下可能读取失败（极少数跨域/污染），忽略
        console.warn('Failed to capture canvas snapshot:', err);
      }
    } else {
      return;
    }
    
    setIsDrawing(true);
    setLastPosition({ x, y });

    // For 'point' mode, draw a single dot on click for immediate feedback
    if (brushShape === 'point') {
      ctx.globalCompositeOperation = selectedTool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.fillStyle = selectedTool === 'eraser' ? 'rgba(0,0,0,1)' : brushColor;
      ctx.beginPath();
      ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // 绘制过程
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || !lastPosition || selectedTool === 'crop') return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    if (!ctx) return;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;
    
    ctx.globalCompositeOperation = selectedTool === 'eraser' ? 'destination-out' : 'source-over';

    if (brushShape === 'point') {
      ctx.strokeStyle = selectedTool === 'eraser' ? 'rgba(0,0,0,1)' : brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPosition.x, lastPosition.y);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
      setLastPosition({ x: currentX, y: currentY });
    } else {
      // For square and circle, redraw from snapshot and draw shape as preview
      const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
      if (snapshot) {
        ctx.putImageData(snapshot, 0, 0);
      }

      const startX = lastPosition.x;
      const startY = lastPosition.y;
      
      // Set stroke style for shapes
      ctx.lineWidth = brushSize;
      ctx.strokeStyle = selectedTool === 'eraser' ? 'rgba(0,0,0,1)' : brushColor;
      
      ctx.beginPath();
      if (brushShape === 'square') {
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
      } else { // circle
        const radiusX = Math.abs(currentX - startX) / 2;
        const radiusY = Math.abs(currentY - startY) / 2;
        const centerX = startX + (currentX - startX) / 2;
        const centerY = startY + (currentY - startY) / 2;
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
  };

  // 结束绘制
  const stopDrawing = () => {
    // For shape tools, the final shape is already on the canvas from the last 'draw' call.
    // We just need to finalize the state.
    setIsDrawing(false);
    setLastPosition(null);
  };

  const cancelDrawing = () => {
    if (isDrawing && (brushShape === 'square' || brushShape === 'circle')) {
      // Restore the canvas to the state before drawing started
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
      if (ctx && snapshot) {
        ctx.putImageData(snapshot, 0, 0);
      }
    }
    setIsDrawing(false);
    setLastPosition(null);
  }

  // 清除画布
  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      // 清空前记录快照，支持撤销清空
      try {
        const snapshot = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
        undoStackRef.current.push(snapshot);
        setUndoCount(undoStackRef.current.length);
        redoStackRef.current = [];
        setRedoCount(0);
      } catch (err) {
        console.warn('Failed to capture canvas snapshot before clear:', err);
      }

      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // 撤销
  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (undoStackRef.current.length === 0) return;

    try {
      // 当前状态入重做栈
      const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      redoStackRef.current.push(current);
      setRedoCount(redoStackRef.current.length);

      // 回到上一个快照
      const prev = undoStackRef.current.pop()!;
      ctx.putImageData(prev, 0, 0);
      setUndoCount(undoStackRef.current.length);
    } catch (err) {
      console.warn('Undo failed:', err);
    }
  };

  // 重做
  const redo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (redoStackRef.current.length === 0) return;

    try {
      // 当前状态入撤销栈
      const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStackRef.current.push(current);
      setUndoCount(undoStackRef.current.length);

      const next = redoStackRef.current.pop()!;
      ctx.putImageData(next, 0, 0);
      setRedoCount(redoStackRef.current.length);
    } catch (err) {
      console.warn('Redo failed:', err);
    }
  };

  // 绑定快捷键：Ctrl+Z 撤销，Ctrl+Shift+Z 或 Ctrl+Y 重做
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (selectedTool === 'crop') return; // Disable when cropping
      const key = e.key.toLowerCase();
      if (e.ctrlKey && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey && e.shiftKey && key === 'z') || (e.ctrlKey && key === 'y')) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, selectedTool]); // Add selectedTool dependency

  const handleApplyCrop = () => {
    if (!completedCrop || !imageRef.current) return;

    const img = imageRef.current;
    const tempCanvas = document.createElement('canvas');
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    tempCanvas.width = completedCrop.width * scaleX;
    tempCanvas.height = completedCrop.height * scaleY;

    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(
      img,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      tempCanvas.width,
      tempCanvas.height
    );

    const croppedDataUrl = tempCanvas.toDataURL('image/png');
    setCurrentImageSrc(croppedDataUrl);
    setSelectedTool('brush');
    setCrop(undefined);

    if (baseStorageKey) {
      setStorageValue(baseStorageKey, croppedDataUrl);
    }
    if (overlayStorageKey) {
      setStorageValue(overlayStorageKey, null);
      setInitialOverlayData(null);
    }
    
    // Clear drawing history as it applied to the pre-crop image
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
  };

  // 保存编辑结果
  const handleSave = () => {
    if (!imageRef.current || !canvasRef.current) return;

    const img = imageRef.current;
    const canvas = canvasRef.current;
    
    // 创建一个临时画布来合并图片和涂抹
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) return;
    
    tempCanvas.width = img.naturalWidth;
    tempCanvas.height = img.naturalHeight;
    
    // 先绘制当前（可能已裁剪的）图片
    tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
    
    // 再绘制涂抹内容
    tempCtx.drawImage(canvas, 0, 0);
    
    // 转换为base64
    const editedImageData = tempCanvas.toDataURL('image/png');
    const overlayDataUrl = canvas.toDataURL('image/png');

    if (baseStorageKey) {
      setStorageValue(baseStorageKey, currentImageSrc);
    }
    if (overlayStorageKey) {
      setStorageValue(overlayStorageKey, overlayDataUrl);
      setInitialOverlayData(overlayDataUrl);
    }

    onSave(editedImageData);
  };

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-[#030712]/95 backdrop-blur-3xl" />
      <div className="fixed left-1/2 top-1/2 z-[9999] w-full max-w-[1100px] px-4 sm:px-6 -translate-x-1/2 -translate-y-1/2">
        <div className="relative bg-white/5 backdrop-blur-[40px] border border-cyan-400/40 rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.75)] max-h-[92vh] overflow-hidden flex flex-col">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -left-10 h-72 w-72 rounded-full bg-cyan-500/30 blur-[140px] animate-pulse" />
            <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-purple-700/20 blur-[180px] animate-pulse delay-1000" />
          </div>
          {/* 模态框头部 */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-cyan-400/50 to-purple-500/40 flex items-center justify-center text-cyan-200 shadow-inner shadow-cyan-500/40">
              <Brush className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.6em] text-cyan-200/70">AI IMAGE FORGE</p>
              <h3 className="text-2xl font-semibold text-white">编辑图片</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-3 rounded-2xl text-gray-300 bg-white/10 hover:bg-white/20 hover:text-white transition-all duration-300 shadow-inner shadow-black/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 编辑区域 */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gradient-to-br from-white/5 via-transparent to-white/5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 图片和画布区域 */}
            <div className="lg:col-span-2">
              <div
                className="relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-2xl overflow-hidden flex items-center justify-center min-h-[460px] shadow-[0_0_60px_rgba(6,182,212,0.25)]"
              >
                <div className="absolute inset-0 opacity-40 group-hover:opacity-70 transition-opacity duration-500 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.25),transparent_60%)]" />
                {/* 背景图片 */}
                {selectedTool === 'crop' ? (
                  <ReactCrop
                    crop={crop}
                    onChange={c => setCrop(c)}
                    onComplete={c => setCompletedCrop(c)}
                    aspect={undefined}
                    className="relative z-10 h-full w-full"
                  >
                    <img
                      ref={imageRef}
                      src={currentImageSrc}
                      alt="编辑图片"
                      className="h-full w-full object-contain"
                      style={{ width: '100%', height: '100%' }}
                      crossOrigin="anonymous"
                    />
                  </ReactCrop>
                ) : (
                  <img
                    ref={imageRef}
                    src={currentImageSrc}
                    alt="编辑图片"
                    className="relative z-10 h-full w-full object-contain"
                    style={{ width: '100%', height: '100%' }}
                    crossOrigin="anonymous"
                  />
                )}
                
                {/* 涂抹画布 */}
                {selectedTool !== 'crop' && (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 z-20 cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={cancelDrawing}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      const touch = e.touches[0];
                      const mouseEvent = {
                        clientX: touch.clientX,
                        clientY: touch.clientY
                      } as React.MouseEvent<HTMLCanvasElement>;
                      startDrawing(mouseEvent);
                    }}
                    onTouchMove={(e) => {
                      e.preventDefault();
                      const touch = e.touches[0];
                      const mouseEvent = {
                        clientX: touch.clientX,
                        clientY: touch.clientY
                      } as React.MouseEvent<HTMLCanvasElement>;
                      draw(mouseEvent);
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      stopDrawing();
                    }}
                  />
                )}
              </div>
            </div>

            {/* 控制面板 */}
            <div className="space-y-6">
              {/* 工具选择 */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_35px_rgba(0,0,0,0.4)] transition-transform duration-300 hover:-translate-y-1">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  工具选择
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedTool('brush')}
                    className={`flex-1 flex items-center justify-center py-3 rounded-2xl transition-all border ${
                      selectedTool === 'brush'
                        ? 'bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 text-white shadow-lg shadow-cyan-500/40 border-transparent'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/10'
                    }`}
                    title="画笔工具"
                  >
                    <Brush className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSelectedTool('eraser')}
                    className={`flex-1 flex items-center justify-center py-3 rounded-2xl transition-all border ${
                      selectedTool === 'eraser'
                        ? 'bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-600 text-white shadow-lg shadow-emerald-500/40 border-transparent'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/10'
                    }`}
                    title="橡皮擦"
                  >
                    <Eraser className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSelectedTool('crop')}
                    className={`flex-1 flex items-center justify-center py-3 rounded-2xl transition-all border ${
                      selectedTool === 'crop'
                        ? 'bg-gradient-to-r from-fuchsia-400 via-purple-500 to-indigo-600 text-white shadow-lg shadow-fuchsia-500/40 border-transparent'
                        : 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/10'
                    }`}
                    title="裁剪"
                  >
                    <CropIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={undo}
                    disabled={undoCount === 0 || selectedTool === 'crop'}
                    className={`flex-1 flex items-center justify-center py-3 rounded-2xl transition-all border ${
                      undoCount === 0 || selectedTool === 'crop'
                        ? 'bg-white/5 text-gray-500 cursor-not-allowed border-white/10'
                        : 'bg-gradient-to-r from-sky-500/30 to-cyan-500/30 hover:from-sky-500/50 hover:to-cyan-500/50 text-cyan-200 shadow-lg shadow-cyan-500/30 border-cyan-400/30'
                    }`}
                    title="撤销 (Ctrl+Z)"
                  >
                    <Undo2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={redo}
                    disabled={redoCount === 0 || selectedTool === 'crop'}
                    className={`flex-1 flex items-center justify-center py-3 rounded-2xl transition-all border ${
                      redoCount === 0 || selectedTool === 'crop'
                        ? 'bg-white/5 text-gray-500 cursor-not-allowed border-white/10'
                        : 'bg-gradient-to-r from-emerald-400/30 to-lime-400/30 hover:from-emerald-400/50 hover:to-lime-400/50 text-emerald-200 shadow-lg shadow-emerald-500/30 border-emerald-400/30'
                    }`}
                    title="重做 (Ctrl+Shift+Z / Ctrl+Y)"
                  >
                    <Redo2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={clearCanvas}
                    disabled={selectedTool === 'crop'}
                    className={`flex-1 flex items-center justify-center py-3 rounded-2xl transition-all border ${
                      selectedTool === 'crop'
                        ? 'bg-white/5 text-gray-500 cursor-not-allowed border-white/10'
                        : 'bg-gradient-to-r from-amber-400/30 to-pink-500/30 hover:from-amber-400/50 hover:to-pink-500/50 text-amber-200 shadow-lg shadow-amber-500/30 border-amber-400/30'
                    }`}
                    title="清空所有涂抹内容"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 涂抹方式 */}
              {selectedTool !== 'crop' && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_35px_rgba(0,0,0,0.4)] transition-transform duration-300 hover:-translate-y-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    涂抹方式
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBrushShape('point')}
                      className={`flex-1 flex items-center justify-center py-3 rounded-2xl border transition-all ${
                        brushShape === 'point'
                          ? 'bg-gradient-to-r from-indigo-400 via-blue-500 to-cyan-500 text-white shadow-lg shadow-indigo-500/30 border-transparent'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/10'
                      }`}
                      title="点状"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setBrushShape('square')}
                      className={`flex-1 flex items-center justify-center py-3 rounded-2xl border transition-all ${
                        brushShape === 'square'
                          ? 'bg-gradient-to-r from-pink-400 via-rose-500 to-orange-500 text-white shadow-lg shadow-pink-500/30 border-transparent'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/10'
                      }`}
                      title="方形"
                    >
                      <Square className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setBrushShape('circle')}
                      className={`flex-1 flex items-center justify-center py-3 rounded-2xl border transition-all ${
                        brushShape === 'circle'
                          ? 'bg-gradient-to-r from-amber-300 via-yellow-400 to-lime-400 text-gray-900 font-semibold shadow-lg shadow-amber-400/40 border-transparent'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10 border-white/10'
                      }`}
                      title="圆形"
                    >
                      <Circle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* 画笔大小 */}
              {selectedTool !== 'crop' && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_35px_rgba(0,0,0,0.4)] transition-transform duration-300 hover:-translate-y-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    画笔大小: {brushSize}px
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-full h-2 rounded-full bg-white/10 accent-cyan-400 appearance-none cursor-pointer"
                  />
                </div>
              )}

              {/* 画笔颜色 */}
              {selectedTool === 'brush' && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_35px_rgba(0,0,0,0.4)] transition-transform duration-300 hover:-translate-y-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    画笔颜色
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'].map(color => (
                      <button
                        key={color}
                        onClick={() => setBrushColor(color)}
                        className={`w-9 h-9 rounded-xl border-2 transition-all duration-200 ${
                          brushColor === color
                            ? 'border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.5)] scale-105'
                            : 'border-white/10 hover:border-cyan-300/60 hover:scale-105'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="w-full h-12 rounded-2xl border border-white/10 bg-white/5 cursor-pointer shadow-inner shadow-black/40"
                  />
                </div>
              )}

              {/* 应用裁剪按钮 */}
              {selectedTool === 'crop' && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_10px_35px_rgba(0,0,0,0.4)] transition-transform duration-300 hover:-translate-y-1">
                  <button
                    onClick={handleApplyCrop}
                    disabled={!completedCrop?.width || !completedCrop?.height}
                    className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-white bg-gradient-to-r from-emerald-400 to-green-600 shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/50 disabled:bg-white/10 disabled:text-gray-500 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    <Check className="w-5 h-5" />
                    <span>应用裁剪</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-t border-white/10 bg-white/5">
          <p className="text-xs uppercase tracking-[0.5em] text-gray-400/80">
            SHIFT+滚轮 调整大小 · CTRL+Z 撤销
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 rounded-2xl text-gray-200 bg-white/10 hover:bg-white/20 border border-white/15 transition-all duration-300"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={selectedTool === 'crop'}
              className="px-7 py-3 rounded-2xl text-white bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 shadow-lg shadow-cyan-500/30 transition-all duration-300 hover:shadow-cyan-500/50 disabled:bg-white/10 disabled:text-gray-500 disabled:cursor-not-allowed disabled:shadow-none"
            >
              保存
            </button>
          </div>
        </div>
      </div>
      </div>
    </>,
    document.body
  );
};

export default ImageEditModal;
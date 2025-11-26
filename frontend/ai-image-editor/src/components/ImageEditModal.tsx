import React, { useEffect, useRef, useState } from 'react';
import { X, Brush, Eraser, Trash2, Undo2, Redo2, Crop as CropIcon, Check, Square, Circle, Minus } from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onSave: (editedImageData: string) => void;
}

const ImageEditModal: React.FC<ImageEditModalProps> = ({
  isOpen,
  onClose,
  imageSrc,
  onSave
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
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

  // 撤销/重做栈（使用 ref 存储以避免频繁重渲染），并用 state 记录数量用于按钮禁用态
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const [undoCount, setUndoCount] = useState<number>(0);
  const [redoCount, setRedoCount] = useState<number>(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentImageSrc(imageSrc);
      setSelectedTool('brush');
      setCrop(undefined);
      setCompletedCrop(undefined);
      undoStackRef.current = [];
      redoStackRef.current = [];
      setUndoCount(0);
      setRedoCount(0);
    }
  }, [isOpen, imageSrc]);

  // 初始化画布
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !imageRef.current || selectedTool === 'crop') return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    const initCanvas = () => {
      // 设置画布尺寸与图片一致
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      // 让画布显示尺寸与容器保持一致，确保与图片重合
      const container = canvas.parentElement as HTMLElement | null;
      const containerRect = container?.getBoundingClientRect();
      const imageRect = img.getBoundingClientRect();
      const displayWidth = containerRect?.width || imageRect.width || img.naturalWidth;
      const displayHeight = containerRect?.height || imageRect.height || img.naturalHeight;
      
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
        // Clear canvas when image source changes
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    if (img.complete) {
      initCanvas();
    } else {
      img.onload = initCanvas;
    }

    const handleResize = () => initCanvas();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, currentImageSrc, selectedTool]); // Depend on currentImageSrc

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
    onSave(editedImageData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] backdrop-blur-sm">
      <div className="bg-gray-900 border border-cyan-500/20 rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* 模态框头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <Brush className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">编辑图片</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 编辑区域 */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 图片和画布区域 */}
            <div className="lg:col-span-2">
              <div className="relative bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center" style={{minHeight: '400px'}}>
                {/* 背景图片 */}
                {selectedTool === 'crop' ? (
                  <ReactCrop
                    crop={crop}
                    onChange={c => setCrop(c)}
                    onComplete={c => setCompletedCrop(c)}
                    aspect={undefined} // Or a specific aspect ratio, e.g., 16 / 9
                    className="w-full h-full"
                  >
                    <img
                      ref={imageRef}
                      src={currentImageSrc}
                      alt="编辑图片"
                      className="w-full h-full object-contain"
                      style={{ width: '100%', height: '100%' }}
                      crossOrigin="anonymous"
                    />
                  </ReactCrop>
                ) : (
                  <img
                    ref={imageRef}
                    src={currentImageSrc}
                    alt="编辑图片"
                    className="w-full h-full object-contain"
                    style={{ width: '100%', height: '100%' }}
                    crossOrigin="anonymous"
                  />
                )}
                
                {/* 涂抹画布 */}
                {selectedTool !== 'crop' && (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 cursor-crosshair"
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
              <div className="bg-gray-800 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  工具选择
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedTool('brush')}
                    className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                      selectedTool === 'brush'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title="画笔工具"
                  >
                    <Brush className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSelectedTool('eraser')}
                    className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                      selectedTool === 'eraser'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title="橡皮擦"
                  >
                    <Eraser className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setSelectedTool('crop')}
                    className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                      selectedTool === 'crop'
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    title="裁剪"
                  >
                    <CropIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={undo}
                    disabled={undoCount === 0 || selectedTool === 'crop'}
                    className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                      undoCount === 0 || selectedTool === 'crop'
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400'
                    }`}
                    title="撤销 (Ctrl+Z)"
                  >
                    <Undo2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={redo}
                    disabled={redoCount === 0 || selectedTool === 'crop'}
                    className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                      redoCount === 0 || selectedTool === 'crop'
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600/20 hover:bg-green-600/30 border border-green-500/30 text-green-400'
                    }`}
                    title="重做 (Ctrl+Shift+Z / Ctrl+Y)"
                  >
                    <Redo2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={clearCanvas}
                    disabled={selectedTool === 'crop'}
                    className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                      selectedTool === 'crop'
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-400'
                    }`}
                    title="清空所有涂抹内容"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 涂抹方式 */}
              {selectedTool !== 'crop' && (
                <div className="bg-gray-800 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    涂抹方式
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBrushShape('point')}
                      className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                        brushShape === 'point'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      title="点状"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setBrushShape('square')}
                      className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                        brushShape === 'square'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      title="方形"
                    >
                      <Square className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setBrushShape('circle')}
                      className={`flex-1 flex items-center justify-center py-2 rounded-lg transition-colors ${
                        brushShape === 'circle'
                          ? 'bg-cyan-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
                <div className="bg-gray-800 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    画笔大小: {brushSize}px
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={brushSize}
                    onChange={(e) => setBrushSize(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
              )}

              {/* 画笔颜色 */}
              {selectedTool === 'brush' && (
                <div className="bg-gray-800 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    画笔颜色
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000'].map(color => (
                      <button
                        key={color}
                        onClick={() => setBrushColor(color)}
                        className={`w-8 h-8 rounded border-2 ${
                          brushColor === color ? 'border-cyan-400' : 'border-gray-600'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={brushColor}
                    onChange={(e) => setBrushColor(e.target.value)}
                    className="w-full h-10 rounded cursor-pointer"
                  />
                </div>
              )}

              {/* 应用裁剪按钮 */}
              {selectedTool === 'crop' && (
                <div className="bg-gray-800 rounded-lg p-4">
                  <button
                    onClick={handleApplyCrop}
                    disabled={!completedCrop?.width || !completedCrop?.height}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
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
        <div className="flex items-center justify-end space-x-3 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={selectedTool === 'crop'}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageEditModal;
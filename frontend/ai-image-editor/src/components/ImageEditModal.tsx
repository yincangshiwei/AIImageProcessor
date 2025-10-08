import React, { useEffect, useRef, useState } from 'react';
import { X, Brush, RotateCcw, Eraser, Trash2 } from 'lucide-react';

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
  const [selectedTool, setSelectedTool] = useState<'brush' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState<number>(10);
  const [brushColor, setBrushColor] = useState<string>('#ff0000');
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [lastPosition, setLastPosition] = useState<{ x: number; y: number } | null>(null);

  // 初始化画布
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    const initCanvas = () => {
      // 设置画布尺寸与图片一致
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      
      // 设置画布显示尺寸
      const containerWidth = 500;
      const containerHeight = 400;
      const scale = Math.min(containerWidth / img.naturalWidth, containerHeight / img.naturalHeight);
      
      canvas.style.width = `${img.naturalWidth * scale}px`;
      canvas.style.height = `${img.naturalHeight * scale}px`;
      
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    if (img.complete) {
      initCanvas();
    } else {
      img.onload = initCanvas;
    }
  }, [isOpen, imageSrc]);

  // 开始绘制
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    setIsDrawing(true);
    setLastPosition({ x, y });
  };

  // 绘制过程
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current || !lastPosition) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    if (!ctx) return;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // 设置绘制模式
    ctx.globalCompositeOperation = selectedTool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = selectedTool === 'eraser' ? 'rgba(0,0,0,1)' : brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(lastPosition.x, lastPosition.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    setLastPosition({ x, y });
  };

  // 结束绘制
  const stopDrawing = () => {
    setIsDrawing(false);
    setLastPosition(null);
  };

  // 清除画布
  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // 保存编辑结果
  const handleSave = () => {
    if (!canvasRef.current || !imageRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;
    
    if (!ctx) return;
    
    // 创建一个临时画布来合并图片和涂抹
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) return;
    
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    
    // 先绘制原图
    tempCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // 再绘制涂抹内容
    tempCtx.drawImage(canvas, 0, 0);
    
    // 转换为base64
    const editedImageData = tempCanvas.toDataURL('image/png');
    onSave(editedImageData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] backdrop-blur-sm">
      <div className="bg-gray-900 border border-cyan-500/20 rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
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
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="编辑图片"
                  className="max-w-full max-h-[400px] object-contain"
                  crossOrigin="anonymous"
                />
                
                {/* 涂抹画布 */}
                <canvas
                  ref={canvasRef}
                  className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 cursor-crosshair"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
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
                    onClick={clearCanvas}
                    className="flex-1 flex items-center justify-center py-2 rounded-lg bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 text-yellow-400 transition-colors"
                    title="清空所有涂抹内容"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 画笔大小 */}
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
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg text-white transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageEditModal;
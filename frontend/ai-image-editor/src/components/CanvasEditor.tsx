import { useRef, useEffect, useState } from 'react'
import {
  Move,
  RotateCw,
  Trash2,
  Square,
  Circle,
  Minus,
  Palette,
  Layers,
  Download,
  Undo,
  Redo,
  Grid,
  Maximize
} from 'lucide-react'

interface CanvasEditorProps {
  images: { id: string; file: File; url: string; name: string }[]
  canvasSize: { width: number; height: number }
  onCanvasDataChange: (dataUrl: string) => void
  mode?: 'multi' | 'puzzle'
}

export default function CanvasEditor({ images, canvasSize, onCanvasDataChange, mode = 'multi' }: CanvasEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedTool, setSelectedTool] = useState<'select' | 'brush' | 'eraser'>('select')
  const [brushSize, setBrushSize] = useState(10)
  const [brushColor, setBrushColor] = useState('#00d4ff')
  const [isDrawing, setIsDrawing] = useState(false)
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number } | null>(null)

  // 初始化画布
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 设置画布大小
    canvas.width = canvasSize.width
    canvas.height = canvasSize.height

    // 设置背景
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)

    // 绘制网格
    drawGrid(ctx)
  }, [canvasSize])

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const gridSize = 20
    ctx.strokeStyle = '#333333'
    ctx.lineWidth = 1

    for (let i = 0; i <= canvasSize.width / gridSize; i++) {
      ctx.beginPath()
      ctx.moveTo(i * gridSize, 0)
      ctx.lineTo(i * gridSize, canvasSize.height)
      ctx.stroke()
    }

    for (let i = 0; i <= canvasSize.height / gridSize; i++) {
      ctx.beginPath()
      ctx.moveTo(0, i * gridSize)
      ctx.lineTo(canvasSize.width, i * gridSize)
      ctx.stroke()
    }
  }

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === 'select') return
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    // 计算实际坐标，考虑画布缩放
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    
    setIsDrawing(true)
    setLastPoint({ x, y })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPoint || selectedTool === 'select') return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const rect = canvas.getBoundingClientRect()
    // 计算实际坐标，考虑画布缩放
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    ctx.globalCompositeOperation = selectedTool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = brushColor
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    ctx.beginPath()
    ctx.moveTo(lastPoint.x, lastPoint.y)
    ctx.lineTo(x, y)
    ctx.stroke()

    setLastPoint({ x, y })
    
    // 更新画布数据
    onCanvasDataChange(canvas.toDataURL())
  }

  const handleMouseUp = () => {
    setIsDrawing(false)
    setLastPoint(null)
  }

  // 添加图片到画布
  const addImageToCanvas = (imageUrl: string, imageName: string) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const img = new Image()
    img.onload = () => {
      const maxSize = Math.min(canvasSize.width, canvasSize.height) / 3
      const scale = Math.min(maxSize / img.width, maxSize / img.height)
      
      const width = img.width * scale
      const height = img.height * scale
      const x = Math.random() * (canvasSize.width - width)
      const y = Math.random() * (canvasSize.height - height)
      
      ctx.drawImage(img, x, y, width, height)
      onCanvasDataChange(canvas.toDataURL())
    }
    img.src = imageUrl
  }

  // 在拼图模式下，自动将新上传的图片添加到画布
  useEffect(() => {
    if (mode === 'puzzle' && images.length > 0) {
      const latestImage = images[images.length - 1]
      addImageToCanvas(latestImage.url, latestImage.name)
    }
  }, [images, mode])

  // 清空画布
  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)
    drawGrid(ctx)
    onCanvasDataChange(canvas.toDataURL())
  }

  // 导出画布
  const exportCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = 'canvas-design.png'
    link.click()
  }

  // 计算动态画布容器样式
  const getCanvasContainerStyle = () => {
    const aspectRatio = canvasSize.width / canvasSize.height;
    
    // 计算最大可用空间
    const maxWidth = Math.min(window.innerWidth * 0.6, 700);
    const maxHeight = Math.min(window.innerHeight * 0.5, 500);
    
    let containerWidth, containerHeight;
    
    // 根据宽高比确定容器尺寸
    if (aspectRatio >= 1) {
      // 横向或正方形：以宽度为准
      containerWidth = Math.min(maxWidth, maxHeight * aspectRatio);
      containerHeight = containerWidth / aspectRatio;
    } else {
      // 纵向：以高度为准
      containerHeight = Math.min(maxHeight, maxWidth / aspectRatio);
      containerWidth = containerHeight * aspectRatio;
    }
    
    // 确保最小尺寸
    containerWidth = Math.max(containerWidth, 250);
    containerHeight = Math.max(containerHeight, 250);
    
    return {
      width: `${containerWidth}px`,
      height: `${containerHeight}px`,
      aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
      minHeight: '250px',
      maxWidth: '100%'
    };
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="toolbar mb-4 flex flex-wrap items-center justify-between">
        {/* Tool Selection */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedTool('select')}
            className={`tool-button ${selectedTool === 'select' ? 'active' : ''}`}
            title="选择工具"
          >
            <Move className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setSelectedTool('brush')}
            className={`tool-button ${selectedTool === 'brush' ? 'active' : ''}`}
            title="画笔工具"
          >
            <Minus className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => setSelectedTool('eraser')}
            className={`tool-button ${selectedTool === 'eraser' ? 'active' : ''}`}
            title="橡皮擦"
          >
            <Square className="w-4 h-4" />
          </button>
        </div>
        
        {/* Color and Size Controls */}
        {selectedTool !== 'select' && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-gray-400" />
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">大小:</span>
              <input
                type="range"
                min="1"
                max="50"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-gray-300 min-w-[2rem]">{brushSize}</span>
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={clearCanvas}
            className="tool-button text-red-400 hover:text-red-300"
            title="清空画布"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={exportCanvas}
            className="tool-button text-neon-green hover:text-green-300"
            title="导出画布"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {mode === 'puzzle' ? (
        // 拼图模式：只显示画布
        <div className="flex-1 flex justify-center items-center">
          <div className="canvas-container bg-gray-900 rounded-lg p-2 overflow-hidden" style={getCanvasContainerStyle()}>
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="cursor-crosshair w-full h-full object-contain"
              style={{
                width: '100%',
                height: '100%',
                display: 'block'
              }}
            />
          </div>
        </div>
      ) : (
        // 多图模式：显示画布和图片面板
        <div className="flex-1 flex gap-4">
          {/* Canvas */}
          <div className="flex-1 flex justify-center items-center">
            <div className="canvas-container bg-gray-900 rounded-lg p-2 overflow-hidden" style={getCanvasContainerStyle()}>
              <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="cursor-crosshair w-full h-full object-contain"
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block'
                }}
              />
            </div>
          </div>
          
          {/* Images Panel - 仅在多图模式显示 */}
          <div className="w-64 cyber-card p-4">
            <h4 className="font-medium mb-3 flex items-center">
              <Layers className="w-4 h-4 mr-2" />
              图片库
            </h4>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {images.map((image) => (
                <div key={image.id} className="group">
                  <div className="flex items-center gap-2 p-2 rounded hover:bg-gray-700/50 transition-colors">
                    <img
                      src={image.url}
                      alt={image.name}
                      className="w-10 h-10 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{image.name}</p>
                    </div>
                    <button
                      onClick={() => addImageToCanvas(image.url, image.name)}
                      className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs bg-neon-blue/20 hover:bg-neon-blue/30 text-neon-blue rounded transition-all"
                    >
                      添加
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {images.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Layers className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">请先上传图片</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
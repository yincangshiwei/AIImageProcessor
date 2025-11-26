import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCollage, CollageImage } from '../contexts/CollageContext';
import { Move, RotateCw, Trash2, Palette, Crop as CropIcon } from 'lucide-react';

type Point = { x: number; y: number };
type TransformHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';

const MIN_SIZE = 20;

interface CollageCanvasProps {
  startCropping: (image: CollageImage) => void;
}

const CollageCanvas: React.FC<CollageCanvasProps> = ({ startCropping }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null); // For background images and grid
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null); // For user drawings
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  const {
    canvasState,
    drawingTools,
    updateImage,
    selectImage,
    removeImage,
    setDrawingMode,
    setDrawingActions,
  } = useCollage();

  // 显示缩放
  const [displayScale, setDisplayScale] = useState(1);

  // Undo/Redo 状态
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  // 绘制状态
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastDrawPoint, setLastDrawPoint] = useState<Point | null>(null);

  // 交互状态
  const [dragStartWorld, setDragStartWorld] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  type ResizeState = {
    handle: TransformHandle;
    rotationRad: number;
    sX: 1 | -1;
    sY: 1 | -1;
    w0: number;
    h0: number;
    anchorWorld: Point; // 对侧锚点（世界坐标，保持不动）
  };
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  // ============== Undo/Redo 逻辑 ==============
  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
  }, []);

  const saveState = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(data);
    redoStackRef.current = [];

    setUndoCount(undoStackRef.current.length);
    setRedoCount(0);
  }, []);

  const undo = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || undoStackRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    redoStackRef.current.push(currentData);

    const lastState = undoStackRef.current.pop();
    if (lastState) {
      ctx.putImageData(lastState, 0, 0);
    }

    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);

  const redo = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current.push(currentData);

    const nextState = redoStackRef.current.pop();
    if (nextState) {
      ctx.putImageData(nextState, 0, 0);
    }

    setUndoCount(undoStackRef.current.length);
    setRedoCount(redoStackRef.current.length);
  }, []);

  // ============== 工具函数 ==============

  const toCanvasPoint = (e: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = drawingCanvasRef.current; // Events are on the drawing canvas
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      clientX = t.clientX;
      clientY = t.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) / displayScale,
      y: (clientY - rect.top) / displayScale,
    };
  };

  const deg2rad = (deg: number) => (deg * Math.PI) / 180;

  const rotateLocalToWorld = (local: Point, rotationRad: number): Point => {
    return {
      x: local.x * Math.cos(rotationRad) - local.y * Math.sin(rotationRad),
      y: local.x * Math.sin(rotationRad) + local.y * Math.cos(rotationRad),
    };
  };

  const worldToLocal = (world: Point, centerWorld: Point, rotationRad: number): Point => {
    const rx = world.x - centerWorld.x;
    const ry = world.y - centerWorld.y;
    const ang = -rotationRad;
    return {
      x: rx * Math.cos(ang) - ry * Math.sin(ang),
      y: rx * Math.sin(ang) + ry * Math.cos(ang),
    };
  };

  const getImageCenter = (img: CollageImage) => ({
    x: img.x + img.width / 2,
    y: img.y + img.height / 2,
  });

  // 命中测试：考虑旋转
  const getImageAtPoint = (p: Point): CollageImage | null => {
    for (let i = canvasState.images.length - 1; i >= 0; i--) {
      const img = canvasState.images[i];
      const center = getImageCenter(img);
      const local = worldToLocal(p, center, deg2rad(img.rotation));
      if (
        local.x >= -img.width / 2 &&
        local.x <= img.width / 2 &&
        local.y >= -img.height / 2 &&
        local.y <= img.height / 2
      ) {
        return img;
      }
    }
    return null;
  };

  // 控制点检测（旋转感知）
  const getHandleAtPoint = (p: Point, img: CollageImage): TransformHandle | null => {
    const hs = 12;
    const tol = 14;
    const center = getImageCenter(img);
    const local = worldToLocal(p, center, deg2rad(img.rotation));

    const halfW = img.width / 2;
    const halfH = img.height / 2;

    const handles: Array<{ t: TransformHandle; x: number; y: number }> = [
      { t: 'nw', x: -halfW - hs / 2, y: -halfH - hs / 2 },
      { t: 'ne', x: halfW - hs / 2, y: -halfH - hs / 2 },
      { t: 'sw', x: -halfW - hs / 2, y: halfH - hs / 2 },
      { t: 'se', x: halfW - hs / 2, y: halfH - hs / 2 },
      { t: 'n', x: -hs / 2, y: -halfH - hs / 2 },
      { t: 's', x: -hs / 2, y: halfH - hs / 2 },
      { t: 'w', x: -halfW - hs / 2, y: -hs / 2 },
      { t: 'e', x: halfW - hs / 2, y: -hs / 2 },
    ];

    for (const h of handles) {
      if (
        local.x >= h.x - tol &&
        local.x <= h.x + hs + tol &&
        local.y >= h.y - tol &&
        local.y <= h.y + hs + tol
      ) {
        return h.t;
      }
    }
    return null;
  };

  const handleSigns = (h: TransformHandle): { sX: 1 | -1; sY: 1 | -1; edge: boolean } => {
    switch (h) {
      case 'e':
        return { sX: 1, sY: 0 as any, edge: true };
      case 'w':
        return { sX: -1, sY: 0 as any, edge: true };
      case 's':
        return { sX: 0 as any, sY: 1, edge: true };
      case 'n':
        return { sX: 0 as any, sY: -1, edge: true };
      case 'se':
        return { sX: 1, sY: 1, edge: false };
      case 'sw':
        return { sX: -1, sY: 1, edge: false };
      case 'ne':
        return { sX: 1, sY: -1, edge: false };
      case 'nw':
        return { sX: -1, sY: -1, edge: false };
    }
  };

  // ============== 绘制 ==============

  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    // 背景
    ctx.save();
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();

    const grid = 20;
    ctx.save();
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    for (let x = 0; x <= canvasState.canvasSize.width; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasState.canvasSize.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvasState.canvasSize.height; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasState.canvasSize.width, y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawOneImage = (ctx: CanvasRenderingContext2D, imgData: CollageImage) => {
    const imgEl = imageCacheRef.current.get(imgData.id);
    if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) return;

    const center = getImageCenter(imgData);
    const rot = deg2rad(imgData.rotation);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    const imgAspect = imgEl.naturalWidth / imgEl.naturalHeight;
    const boxAspect = imgData.width / imgData.height;
    let drawW: number, drawH: number;
    if (imgAspect > boxAspect) {
      drawW = imgData.width;
      drawH = imgData.width / imgAspect;
    } else {
      drawH = imgData.height;
      drawW = imgData.height * imgAspect;
    }

    // 裁剪在边框内
    ctx.beginPath();
    ctx.rect(-imgData.width / 2, -imgData.height / 2, imgData.width, imgData.height);
    ctx.clip();

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(imgEl, -drawW / 2, -drawH / 2, drawW, drawH);

    // 选中边框
    if (imgData.selected) {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.strokeRect(-imgData.width / 2, -imgData.height / 2, imgData.width, imgData.height);
    }
    ctx.restore();
  };

  const drawHandles = (ctx: CanvasRenderingContext2D, imgData: CollageImage) => {
    const center = getImageCenter(imgData);
    const rot = deg2rad(imgData.rotation);
    const hs = 12;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.strokeRect(-imgData.width / 2, -imgData.height / 2, imgData.width, imgData.height);

    const rects = [
      { x: -imgData.width / 2 - hs / 2, y: -imgData.height / 2 - hs / 2 },
      { x: imgData.width / 2 - hs / 2, y: -imgData.height / 2 - hs / 2 },
      { x: -imgData.width / 2 - hs / 2, y: imgData.height / 2 - hs / 2 },
      { x: imgData.width / 2 - hs / 2, y: imgData.height / 2 - hs / 2 },
      { x: -hs / 2, y: -imgData.height / 2 - hs / 2 },
      { x: -hs / 2, y: imgData.height / 2 - hs / 2 },
      { x: -imgData.width / 2 - hs / 2, y: -hs / 2 },
      { x: imgData.width / 2 - hs / 2, y: -hs / 2 },
    ];

    ctx.fillStyle = '#06b6d4';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    rects.forEach((r) => {
      ctx.fillRect(r.x, r.y, hs, hs);
      ctx.strokeRect(r.x, r.y, hs, hs);
    });

    ctx.restore();
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current; // This is the background canvas
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and draw background elements
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx);

    // 绘制图片
    canvasState.images.forEach((img) => drawOneImage(ctx, img));

    // 绘制选中控制点
    const selected = canvasState.images.find((i) => i.id === canvasState.selectedImageId);
    if (selected) drawHandles(ctx, selected);
  }, [canvasState.images, canvasState.selectedImageId]);

  // ============== 图片缓存/预加载 ==============

  useEffect(() => {
    const cache = imageCacheRef.current;

    // 清理移除的
    const alive = new Set(canvasState.images.map((i) => i.id));
    for (const k of Array.from(cache.keys())) {
      if (!alive.has(k)) cache.delete(k);
    }

    // 预加载
    canvasState.images.forEach((img) => {
      const cur = cache.get(img.id);
      if (!cur || cur.src !== img.url) {
        const el = new Image();
        el.onload = () => redraw();
        el.src = img.url;
        cache.set(img.id, el);
      }
    });

    // 初次尝试重绘
    redraw();
  }, [canvasState.images, redraw]);

  // ============== 显示缩放 ==============

  const recalcScale = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { width, height } = canvasState.canvasSize;
    const rect = container.getBoundingClientRect();
    const padding = 24;
    const maxW = Math.max(rect.width - padding, 200);
    const maxH = Math.max(rect.height - padding, 200);
    const scale = Math.min(maxW / width, maxH / height, 1);
    setDisplayScale(Math.max(0.15, scale));
  }, [canvasState.canvasSize]);

  useEffect(() => {
    const onResize = () => recalcScale();
    window.addEventListener('resize', onResize);
    const t = setTimeout(recalcScale, 50);
    return () => {
      window.removeEventListener('resize', onResize);
      clearTimeout(t);
    };
  }, [recalcScale]);

  useEffect(() => {
    // Update CSS size for both canvases
    const bgCanvas = canvasRef.current;
    const drawCanvas = drawingCanvasRef.current;
    if (!bgCanvas || !drawCanvas) return;

    const w = `${canvasState.canvasSize.width * displayScale}px`;
    const h = `${canvasState.canvasSize.height * displayScale}px`;
    bgCanvas.style.width = w;
    bgCanvas.style.height = h;
    drawCanvas.style.width = w;
    drawCanvas.style.height = h;
  }, [canvasState.canvasSize, displayScale]);

  useEffect(() => {
    // Set canvas resolution and redraw background when size changes
    const bgCanvas = canvasRef.current;
    const drawCanvas = drawingCanvasRef.current;
    if (!bgCanvas || !drawCanvas) return;

    // Snapshot current drawings before resizing (resizing clears the canvas)
    let snapshotCanvas: HTMLCanvasElement | null = null;
    const prevW = drawCanvas.width;
    const prevH = drawCanvas.height;
    if (prevW > 0 && prevH > 0) {
      snapshotCanvas = document.createElement('canvas');
      snapshotCanvas.width = prevW;
      snapshotCanvas.height = prevH;
      const sctx = snapshotCanvas.getContext('2d');
      const dctx = drawCanvas.getContext('2d');
      if (sctx && dctx) {
        sctx.drawImage(drawCanvas, 0, 0);
      }
    }

    // Apply new resolution
    bgCanvas.width = canvasState.canvasSize.width;
    bgCanvas.height = canvasState.canvasSize.height;
    drawCanvas.width = canvasState.canvasSize.width;
    drawCanvas.height = canvasState.canvasSize.height;

    // Restore drawings scaled to new size (if snapshot exists)
    if (snapshotCanvas) {
      const dctx = drawCanvas.getContext('2d');
      if (dctx) {
        dctx.imageSmoothingEnabled = true;
        dctx.drawImage(
          snapshotCanvas,
          0,
          0,
          snapshotCanvas.width,
          snapshotCanvas.height,
          0,
          0,
          drawCanvas.width,
          drawCanvas.height
        );
      }
    }

    clearHistory(); // 画布尺寸变化，清空历史记录
    redraw();
  }, [canvasState.canvasSize, redraw, clearHistory]);

  // 将 undo/redo 操作注册到 context
  useEffect(() => {
    setDrawingActions({ undo, redo });
    return () => {
      setDrawingActions({ undo: null, redo: null });
    };
  }, [undo, redo, setDrawingActions]);

  // 更新 context 中的 canUndo/canRedo 状态
  useEffect(() => {
    setDrawingActions({ canUndo: undoCount > 0, canRedo: redoCount > 0 });
  }, [undoCount, redoCount, setDrawingActions]);

  useEffect(() => {
    // Effect to clear the drawing canvas from outside
    if (canvasState.drawingRevision > 0) {
      const canvas = drawingCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        saveState(); // 清空前保存状态
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [canvasState.drawingRevision, saveState]);

  // ============== 事件 ==============

  const onStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const p = toCanvasPoint(e);

    if (drawingTools.mode === 'brush' || drawingTools.mode === 'eraser') {
      saveState(); // 绘制前保存状态
      setIsDrawing(true);
      setLastDrawPoint(p);

      // Draw a dot on click
      const canvas = drawingCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      ctx.globalCompositeOperation = drawingTools.mode === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = drawingTools.mode === 'eraser' ? 'rgba(0,0,0,1)' : drawingTools.brushColor;
      ctx.lineWidth = drawingTools.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      return;
    }

    const selected = canvasState.images.find((i) => i.id === canvasState.selectedImageId);

    // 点在当前选中图的控制点上 => 缩放
    if (selected) {
      const h = getHandleAtPoint(p, selected);
      if (h) {
        const rot = deg2rad(selected.rotation);
        const { sX, sY } = handleSigns(h);
        const c0 = getImageCenter(selected);

        // 对侧锚点（随新尺寸变化但世界坐标保持不动），这里基于当前尺寸计算锚点世界坐标
        const halfW0 = selected.width / 2;
        const halfH0 = selected.height / 2;
        // 对应对侧角/边中心（按 handle 定义）
        let anchorLocal: Point;
        if (h === 'e' || h === 'w') {
          // 水平边，锚点在相对边的边中心
          anchorLocal = { x: (h === 'e' ? -halfW0 : halfW0), y: 0 };
        } else if (h === 'n' || h === 's') {
          // 垂直边，锚点在相对边的边中心
          anchorLocal = { x: 0, y: (h === 's' ? -halfH0 : halfH0) };
        } else {
          // 角
          const sx = sX;
          const sy = sY;
          anchorLocal = { x: -sx * halfW0, y: -sy * halfH0 };
        }
        const anchorWorld = {
          x: rotateLocalToWorld(anchorLocal, rot).x + c0.x,
          y: rotateLocalToWorld(anchorLocal, rot).y + c0.y,
        };

        setResizeState({
          handle: h,
          rotationRad: rot,
          sX: (sX || 0) as 1 | -1,
          sY: (sY || 0) as 1 | -1,
          w0: selected.width,
          h0: selected.height,
          anchorWorld,
        });
        setDragStartWorld(p);
        return;
      }
    }

    // 命中任何图片 => 选择并开始拖动
    const hit = getImageAtPoint(p);
    if (hit) {
      selectImage(hit.id);
      setIsDragging(true);
      setDragStartWorld(p);
      return;
    }

    // 空白处 => 取消选择
    selectImage(null);
  };

  const onMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const p = toCanvasPoint(e);

    // 绘制模式
    if ((drawingTools.mode === 'brush' || drawingTools.mode === 'eraser') && isDrawing && lastDrawPoint) {
      const canvas = drawingCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      // Composite operation is set in onStart and onMove
      ctx.strokeStyle = drawingTools.mode === 'eraser' ? 'rgba(0,0,0,1)' : drawingTools.brushColor;
      ctx.lineWidth = drawingTools.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastDrawPoint.x, lastDrawPoint.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      setLastDrawPoint(p);
      return;
    }

    const selected = canvasState.images.find((i) => i.id === canvasState.selectedImageId);
    if (!selected || !dragStartWorld) return;

    // 缩放
    if (resizeState) {
      const { handle, rotationRad, sX, sY, w0, h0, anchorWorld } = resizeState;

      // 将当前指针点转换为"以当前锚点为基准"的本地坐标
      // 但我们更稳定的做法：先求“相对当前矩形中心”的本地坐标，然后根据 handle 推导尺寸
      const c0 = getImageCenter(selected);
      const localP = worldToLocal(p, c0, rotationRad);

      let w1 = w0;
      let h1 = h0;

      if (handle === 'e' || handle === 'w') {
        // 水平边：仅改变宽度
        const v = Math.abs((sX as number) * localP.x);
        w1 = Math.max(MIN_SIZE, 2 * v);
      } else if (handle === 'n' || handle === 's') {
        // 垂直边：仅改变高度
        const v = Math.abs((sY as number) * localP.y);
        h1 = Math.max(MIN_SIZE, 2 * v);
      } else {
        // 角：宽高都变
        const vx = Math.abs((sX as number) * localP.x);
        const vy = Math.abs((sY as number) * localP.y);
        w1 = Math.max(MIN_SIZE, 2 * vx);
        h1 = Math.max(MIN_SIZE, 2 * vy);
      }

      // 依据新尺寸，计算“新锚点”的本地坐标（相对于新中心）
      let anchorLocalNew: Point;
      if (handle === 'e' || handle === 'w') {
        anchorLocalNew = { x: (handle === 'e' ? -w1 / 2 : w1 / 2), y: 0 };
      } else if (handle === 'n' || handle === 's') {
        anchorLocalNew = { x: 0, y: (handle === 's' ? -h1 / 2 : h1 / 2) };
      } else {
        anchorLocalNew = { x: -((sX as number) * w1) / 2, y: -((sY as number) * h1) / 2 };
      }

      // 为保证锚点世界坐标不变：C_new = anchorWorld - R(anchorLocalNew)
      const rotAnchor = rotateLocalToWorld(anchorLocalNew, rotationRad);
      const cNew = { x: anchorWorld.x - rotAnchor.x, y: anchorWorld.y - rotAnchor.y };

      // 回写状态（x,y 为未旋转矩形左上）
      updateImage(selected.id, {
        x: cNew.x - w1 / 2,
        y: cNew.y - h1 / 2,
        width: w1,
        height: h1,
      });
      return;
    }

    // 拖动
    if (isDragging) {
      const dx = p.x - dragStartWorld.x;
      const dy = p.y - dragStartWorld.y;
      updateImage(selected.id, {
        x: selected.x + dx,
        y: selected.y + dy,
      });
      setDragStartWorld(p);
    }
  };

  const onEnd = () => {
    setIsDrawing(false);
    setLastDrawPoint(null);
    setIsDragging(false);
    setResizeState(null);
    setDragStartWorld(null);
  };

  // ============== 容器样式 ==============

  const containerStyle = useMemo(() => {
    const { width, height } = canvasState.canvasSize;
    const aspect = width / height;

    // 给容器一个合理的最大展示区域
    const maxW = Math.min(window.innerWidth * 0.7, 900);
    const maxH = Math.min(window.innerHeight * 0.65, 700);

    let cw: number, ch: number;
    if (aspect >= 1) {
      cw = Math.min(maxW, maxH * aspect);
      ch = cw / aspect;
    } else {
      ch = Math.min(maxH, maxW / aspect);
      cw = ch * aspect;
    }
    cw = Math.max(cw, 320);
    ch = Math.max(ch, 320);

    return {
      width: `${cw}px`,
      height: `${ch}px`,
      aspectRatio: `${width} / ${height}`,
      minHeight: '320px',
      maxWidth: '100%',
    } as React.CSSProperties;
  }, [canvasState.canvasSize]);

  // ============== 渲染 ==============

  return (
    <div className="flex justify-center items-center p-4 min-h-[400px]">
      <div
        ref={containerRef}
        className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg"
        style={containerStyle}
      >
        {/* 工具栏 */}
        <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-2 flex space-x-1">
            <button
              onClick={() => setDrawingMode('select')}
              className={`p-2 rounded transition-colors ${
                drawingTools.mode === 'select'
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="选择模式"
            >
              <Move className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDrawingMode('brush')}
              className={`p-2 rounded transition-colors ${
                drawingTools.mode === 'brush' || drawingTools.mode === 'eraser'
                  ? 'bg-cyan-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="绘制模式"
            >
              <Palette className="w-4 h-4" />
            </button>
          </div>

          {canvasState.selectedImageId && (
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg p-2 flex space-x-1">
              <button
                onClick={() => {
                  if (canvasState.selectedImageId) {
                    const imageToCrop = canvasState.images.find(i => i.id === canvasState.selectedImageId);
                    if (imageToCrop) {
                      startCropping(imageToCrop);
                    }
                  }
                }}
                className="p-2 rounded text-gray-400 hover:text-white transition-colors"
                title="裁剪"
              >
                <CropIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const selected = canvasState.images.find(
                    (i) => i.id === canvasState.selectedImageId
                  );
                  if (selected) {
                    updateImage(selected.id, { rotation: selected.rotation + 15 });
                  }
                }}
                className="p-2 rounded text-gray-400 hover:text-white transition-colors"
                title="旋转"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (canvasState.selectedImageId) {
                    removeImage(canvasState.selectedImageId);
                  }
                }}
                className="p-2 rounded text-red-400 hover:text-red-300 transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* 画布容器 */}
        <div className="w-full h-full flex items-center justify-center p-2" style={{ position: 'relative' }}>
          {/* 背景画布 (图片和网格) */}
          <canvas
            ref={canvasRef}
            className="border border-gray-600 shadow-lg"
            style={{
              position: 'absolute',
              width: `${canvasState.canvasSize.width * displayScale}px`,
              height: `${canvasState.canvasSize.height * displayScale}px`,
              maxWidth: 'calc(100% - 16px)',
              maxHeight: 'calc(100% - 16px)',
              objectFit: 'contain',
            }}
          />
          {/* 绘制画布 (画笔和橡皮擦) */}
          <canvas
            ref={drawingCanvasRef}
            className="touch-none"
            style={{
              position: 'absolute',
              cursor:
                drawingTools.mode === 'brush' || drawingTools.mode === 'eraser'
                  ? 'crosshair'
                  : isDragging
                  ? 'grabbing'
                  : 'grab',
              width: `${canvasState.canvasSize.width * displayScale}px`,
              height: `${canvasState.canvasSize.height * displayScale}px`,
              maxWidth: 'calc(100% - 16px)',
              maxHeight: 'calc(100% - 16px)',
              objectFit: 'contain',
            }}
            // 鼠/触事件
            onMouseDown={onStart}
            onMouseMove={onMove}
            onMouseUp={onEnd}
            onMouseLeave={onEnd}
            onTouchStart={onStart}
            onTouchMove={onMove}
            onTouchEnd={onEnd}
            onTouchCancel={onEnd}
          />
        </div>
      </div>
    </div>
  );
};

export default CollageCanvas;
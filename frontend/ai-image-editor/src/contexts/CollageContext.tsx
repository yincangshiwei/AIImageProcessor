import React, { createContext, useContext, useState, ReactNode } from 'react';

type CollageImage = {
  id: string;
  file: File;
  url: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  selected: boolean;
};

type CanvasState = {
  images: CollageImage[];
  canvasSize: { width: number; height: number };
  selectedImageId: string | null;
  drawingData: string; // Canvas drawing data
  drawingRevision: number;
};

type DrawingTools = {
  brushColor: string;
  brushSize: number;
  mode: 'select' | 'brush' | 'eraser';
};

type DrawingActions = {
  undo: (() => void) | null;
  redo: (() => void) | null;
  canUndo: boolean;
  canRedo: boolean;
};

type CollageContextType = {
  canvasState: CanvasState;
  drawingTools: DrawingTools;
  drawingActions: DrawingActions;
  setDrawingActions: (actions: Partial<DrawingActions>) => void;
  // 画布操作
  addImage: (file: File) => void;
  addImages: (files: File[]) => void;
  removeImage: (id: string) => void;
  updateImage: (id: string, updates: Partial<CollageImage>) => void;
  selectImage: (id: string | null) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setDrawingData: (data: string) => void;
  clearCanvas: () => void;
  clearDrawings: () => void;
  // 绘制工具操作
  setBrushColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  setDrawingMode: (mode: 'select' | 'brush' | 'eraser') => void;
  // 宫格排布功能
  arrangeAsGrid: (rows: number, cols: number) => void;
  // 重置功能
  resetCanvas: () => void;
};

const CollageContext = createContext<CollageContextType | null>(null);

export const useCollage = () => {
  const context = useContext(CollageContext);
  if (!context) {
    throw new Error('useCollage must be used within CollageProvider');
  }
  return context;
};

type CollageProviderProps = {
  children: ReactNode;
};

export const CollageProvider: React.FC<CollageProviderProps> = ({ children }) => {
  const [canvasState, setCanvasState] = useState<CanvasState>({
    images: [],
    canvasSize: { width: 1024, height: 1024 }, // 默认1:1比例，符合新规格
    selectedImageId: null,
    drawingData: '',
    drawingRevision: 0
  });

  const [drawingTools, setDrawingTools] = useState<DrawingTools>({
    brushColor: '#ff0000',
    brushSize: 10,
    mode: 'select'
  });

  const [drawingActions, setDrawingActionsState] = useState<DrawingActions>({
    undo: null,
    redo: null,
    canUndo: false,
    canRedo: false,
  });

  const setDrawingActions = (actions: Partial<DrawingActions>) => {
    setDrawingActionsState(prev => ({ ...prev, ...actions }));
  };

  const addImage = (file: File) => {
    const url = URL.createObjectURL(file);
    
    const isFirstImage = canvasState.images.length === 0;
    
    const newImage: CollageImage = {
      id: Date.now().toString() + Math.random().toString(),
      file,
      url,
      name: file.name,
      x: isFirstImage ? 0 : Math.random() * 200,
      y: isFirstImage ? 0 : Math.random() * 200,
      width: isFirstImage ? canvasState.canvasSize.width : 150,
      height: isFirstImage ? canvasState.canvasSize.height : 150,
      rotation: 0,
      selected: false
    };

    setCanvasState(prev => ({
      ...prev,
      images: [...prev.images, newImage]
    }));
  };

  const addImages = (files: File[]) => {
    files.forEach(file => addImage(file));
  };

  const removeImage = (id: string) => {
    setCanvasState(prev => ({
      ...prev,
      images: prev.images.filter(img => img.id !== id),
      selectedImageId: prev.selectedImageId === id ? null : prev.selectedImageId
    }));
  };

  const updateImage = (id: string, updates: Partial<CollageImage>) => {
    setCanvasState(prev => ({
      ...prev,
      images: prev.images.map(img => 
        img.id === id ? { ...img, ...updates } : img
      )
    }));
  };

  const selectImage = (id: string | null) => {
    setCanvasState(prev => ({
      ...prev,
      selectedImageId: id,
      images: prev.images.map(img => ({
        ...img,
        selected: img.id === id
      }))
    }));
  };

  const setCanvasSize = (size: { width: number; height: number }) => {
    setCanvasState(prev => ({
      ...prev,
      canvasSize: size
    }));
  };

  const setDrawingData = (data: string) => {
    setCanvasState(prev => ({
      ...prev,
      drawingData: data
    }));
  };

  const clearCanvas = () => {
    setCanvasState({
      images: [],
      canvasSize: { width: 1024, height: 1024 },
      selectedImageId: null,
      drawingData: '',
      drawingRevision: 0
    });
  };

  const setBrushColor = (color: string) => {
    setDrawingTools(prev => ({ ...prev, brushColor: color }));
  };

  const setBrushSize = (size: number) => {
    setDrawingTools(prev => ({ ...prev, brushSize: size }));
  };

  const setDrawingMode = (mode: 'select' | 'brush' | 'eraser') => {
    setDrawingTools(prev => ({ ...prev, mode }));
  };

  const clearDrawings = () => {
    setCanvasState(prev => ({ ...prev, drawingRevision: prev.drawingRevision + 1 }));
  };

  const arrangeAsGrid = (rows: number, cols: number) => {
    if (canvasState.images.length === 0) {
      return;
    }
    
    const { width: canvasWidth, height: canvasHeight } = canvasState.canvasSize;
    const padding = 20;
    const totalPaddingX = padding * (cols + 1);
    const totalPaddingY = padding * (rows + 1);
    
    const cellWidth = (canvasWidth - totalPaddingX) / cols;
    const cellHeight = (canvasHeight - totalPaddingY) / rows;
    
    const updatedImages = canvasState.images.slice(0, rows * cols).map((image, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      const x = padding + col * (cellWidth + padding);
      const y = padding + row * (cellHeight + padding);
      
      return {
        ...image,
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        rotation: 0,
        selected: false
      };
    });
    
    setCanvasState(prev => ({
      ...prev,
      images: updatedImages,
      selectedImageId: null
    }));
  };

  const resetCanvas = () => {
    clearDrawings();
    setCanvasState(prev => ({
      ...prev,
      images: [],
      selectedImageId: null,
      drawingData: ''
    }));
  };

  return (
    <CollageContext.Provider
      value={{
        canvasState,
        drawingTools,
        drawingActions,
        setDrawingActions,
        addImage,
        addImages,
        removeImage,
        updateImage,
        selectImage,
        setCanvasSize,
        setDrawingData,
        clearCanvas,
        setBrushColor,
        setBrushSize,
        setDrawingMode,
        arrangeAsGrid,
        resetCanvas,
        clearDrawings
      }}
    >
      {children}
    </CollageContext.Provider>
  );
};

export type { CollageImage, CanvasState, DrawingTools };
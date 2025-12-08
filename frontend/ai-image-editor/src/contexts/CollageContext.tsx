import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

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
  brushShape: 'point' | 'square' | 'circle';
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
  setBrushShape: (shape: 'point' | 'square' | 'circle') => void;
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
    brushShape: 'point',
    mode: 'select'
  });

  const [drawingActions, setDrawingActionsState] = useState<DrawingActions>({
    undo: null,
    redo: null,
    canUndo: false,
    canRedo: false,
  });

  const setDrawingActions = useCallback((actions: Partial<DrawingActions>) => {
    setDrawingActionsState(prev => ({ ...prev, ...actions }));
  }, []);

  const addImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setCanvasState(prev => {
      const isFirstImage = prev.images.length === 0;
      const newImage: CollageImage = {
        id: Date.now().toString() + Math.random().toString(),
        file,
        url,
        name: file.name,
        x: isFirstImage ? 0 : Math.random() * 200,
        y: isFirstImage ? 0 : Math.random() * 200,
        width: isFirstImage ? prev.canvasSize.width : 150,
        height: isFirstImage ? prev.canvasSize.height : 150,
        rotation: 0,
        selected: false
      };
      return {
        ...prev,
        images: [...prev.images, newImage]
      };
    });
  }, []);

  const addImages = useCallback((files: File[]) => {
    files.forEach(file => addImage(file));
  }, [addImage]);

  const removeImage = useCallback((id: string) => {
    setCanvasState(prev => ({
      ...prev,
      images: prev.images.filter(img => img.id !== id),
      selectedImageId: prev.selectedImageId === id ? null : prev.selectedImageId
    }));
  }, []);

  const updateImage = useCallback((id: string, updates: Partial<CollageImage>) => {
    setCanvasState(prev => ({
      ...prev,
      images: prev.images.map(img => 
        img.id === id ? { ...img, ...updates } : img
      )
    }));
  }, []);

  const selectImage = useCallback((id: string | null) => {
    setCanvasState(prev => ({
      ...prev,
      selectedImageId: id,
      images: prev.images.map(img => ({
        ...img,
        selected: img.id === id
      }))
    }));
  }, []);

  const setCanvasSize = useCallback((size: { width: number; height: number }) => {
    setCanvasState(prev => ({
      ...prev,
      canvasSize: size
    }));
  }, []);

  const setDrawingData = useCallback((data: string) => {
    setCanvasState(prev => ({
      ...prev,
      drawingData: data
    }));
  }, []);

  const clearCanvas = useCallback(() => {
    setCanvasState({
      images: [],
      canvasSize: { width: 1024, height: 1024 },
      selectedImageId: null,
      drawingData: '',
      drawingRevision: 0
    });
  }, []);

  const setBrushColor = useCallback((color: string) => {
    setDrawingTools(prev => ({ ...prev, brushColor: color }));
  }, []);

  const setBrushSize = useCallback((size: number) => {
    setDrawingTools(prev => ({ ...prev, brushSize: size }));
  }, []);

  const setBrushShape = useCallback((shape: 'point' | 'square' | 'circle') => {
    setDrawingTools(prev => ({ ...prev, brushShape: shape }));
  }, []);

  const setDrawingMode = useCallback((mode: 'select' | 'brush' | 'eraser') => {
    setDrawingTools(prev => ({ ...prev, mode }));
  }, []);

  const clearDrawings = useCallback(() => {
    setCanvasState(prev => ({ ...prev, drawingRevision: prev.drawingRevision + 1 }));
  }, []);

  const arrangeAsGrid = useCallback((rows: number, cols: number) => {
    setCanvasState(prev => {
      if (prev.images.length === 0) {
        return prev;
      }

      const { width: canvasWidth, height: canvasHeight } = prev.canvasSize;
      const padding = 20;
      const totalPaddingX = padding * (cols + 1);
      const totalPaddingY = padding * (rows + 1);

      const cellWidth = (canvasWidth - totalPaddingX) / cols;
      const cellHeight = (canvasHeight - totalPaddingY) / rows;

      const updatedImages = prev.images.slice(0, rows * cols).map((image, index) => {
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

      return {
        ...prev,
        images: updatedImages,
        selectedImageId: null
      };
    });
  }, []);

  const resetCanvas = useCallback(() => {
    clearDrawings();
    setCanvasState(prev => ({
      ...prev,
      images: [],
      selectedImageId: null,
      drawingData: ''
    }));
  }, [clearDrawings]);

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
        setBrushShape,
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
import React, { useEffect, useRef, useState } from 'react';
import FloatingImageUploader from './FloatingImageUploader';
import { Clock, Loader, ArrowUp, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface BottomGeneratePanelProps {
  prompt: string;
  onPromptChange: (value: string) => void;

  generating: boolean;
  generatingProgress: number;

  outputCount: number;
  onChangeOutputCount: (value: number) => void;

  onAddFiles: (files: File[]) => void;
  imageCount: number;
  maxFiles: number;

  onGenerate: () => void;
  canGenerate: boolean;

  canOpenHistory: boolean;
  onOpenHistory: () => void;

  initialAspectRatio?: string;
  onAspectRatioChange?: (ratio: string) => void;
}

const BottomGeneratePanel: React.FC<BottomGeneratePanelProps> = ({
  prompt,
  onPromptChange,

  generating,
  generatingProgress,

  outputCount,
  onChangeOutputCount,

  onAddFiles,
  imageCount,
  maxFiles,

  onGenerate,
  canGenerate,

  canOpenHistory,
  onOpenHistory,

  initialAspectRatio = '智能',
  onAspectRatioChange,
}) => {
  // 内部 UI 状态：比例/下拉、折叠、拖拽
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio);
  const [showAspectRatioDropdown, setShowAspectRatioDropdown] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    const handleDragMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      setDragOffset({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };

    const handleDragMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('mousemove', handleDragMouseMove);
    window.addEventListener('mouseup', handleDragMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleDragMouseMove);
      window.removeEventListener('mouseup', handleDragMouseUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;

    if (
      !isPanelCollapsed &&
      (target.closest('button, a, input, textarea') ||
        window.getComputedStyle(target).cursor === 'pointer')
    ) {
      return;
    }

    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: dragOffset.x,
      initialY: dragOffset.y,
    };
    document.body.style.cursor = 'grabbing';
    e.preventDefault();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowAspectRatioDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  const handleSelectRatio = (ratio: string) => {
    setAspectRatio(ratio);
    setShowAspectRatioDropdown(false);
    onAspectRatioChange?.(ratio);
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50"
      style={{
        transform: `translateX(-50%) translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`
          cyber-card bg-gray-800/80 backdrop-blur-md rounded-xl shadow-2xl shadow-black/50
          relative
          ${isPanelCollapsed ? 'cursor-grab' : 'cursor-grab'}
        `}
      >
        <div
          className={`
            transition-all duration-300 ease-in-out
            ${isPanelCollapsed ? 'w-[48px] h-[48px]' : 'w-[850px] max-w-[85vw] p-4'}
          `}
        >
          <div
            className={`
              w-full h-full
              transition-opacity duration-200
              ${isPanelCollapsed ? 'opacity-0' : 'opacity-100'}
            `}
          >
            <div className="flex items-start gap-4">
              <FloatingImageUploader
                onAddFiles={onAddFiles}
                imageCount={imageCount}
                maxFiles={maxFiles}
              />

              <div className="flex-grow min-w-0">
                <textarea
                  value={prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAspectRatioDropdown(!showAspectRatioDropdown);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg text-sm transition-colors"
                  >
                    <span>比例: {aspectRatio}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {showAspectRatioDropdown && (
                    <div className="absolute bottom-full mb-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10 w-32 max-h-60 overflow-y-auto">
                      {['智能', '1:1', '3:4', '2:3', '9:16', '4:3', '3:2', '16:9', '21:9'].map((ratio) => (
                        <button
                          key={ratio}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectRatio(ratio);
                          }}
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeOutputCount(Math.max(1, outputCount - 1));
                      }}
                      className="px-2 py-1 text-gray-300 hover:bg-gray-600/50 rounded-l-lg transition-colors"
                    >
                      -
                    </button>
                    <span className="px-3 text-sm text-white font-medium">{outputCount}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeOutputCount(Math.min(4, outputCount + 1));
                      }}
                      className="px-2 py-1 text-gray-300 hover:bg-gray-600/50 rounded-r-lg transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canOpenHistory) onOpenHistory();
                  }}
                  disabled={!canOpenHistory}
                  className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg hover:scale-105 transition-all"
                  title={canOpenHistory ? '生成记录' : '暂无生成记录'}
                >
                  <Clock className="w-5 h-5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (canGenerate) onGenerate();
                  }}
                  disabled={!canGenerate}
                  className="w-10 h-10 bg-neon-blue rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:bg-gray-600 disabled:cursor-not-allowed shadow-lg shadow-neon-blue/30 hover:scale-105 transition-all"
                  title="生成"
                >
                  {generating ? <Loader className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {generating && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden">
                <div
                  className="bg-neon-blue h-full"
                  style={{ width: `${generatingProgress}%`, transition: 'width 0.3s ease-in-out' }}
                ></div>
              </div>
            )}
          </div>
        </div>

        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setIsPanelCollapsed(!isPanelCollapsed);
          }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-gray-700/80 text-white hover:bg-gray-600 flex items-center justify-center z-10"
          title={isPanelCollapsed ? '展开' : '收起'}
        >
          {isPanelCollapsed ? <ChevronsLeft /> : <ChevronsRight />}
        </button>
      </div>
    </div>
  );
};

export default BottomGeneratePanel;
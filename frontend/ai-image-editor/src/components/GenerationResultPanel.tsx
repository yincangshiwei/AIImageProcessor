import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowRight, Check, ZoomIn, Download } from 'lucide-react';
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

type GenerationResultPanelProps = {
  isOpen: boolean;
  onClose: () => void;
  generatedImages: string[];
  onUseImage: (imageUrl: string) => void;
  onDownloadImage: (imageUrl: string, index: number) => void;
  onRegenerate: () => void;
};

type SizeMap = Record<string, { w: number; h: number }>;

export default function GenerationResultPanel({
  isOpen,
  onClose,
  generatedImages,
  onUseImage,
  onDownloadImage,
  onRegenerate,
}: GenerationResultPanelProps) {
  const lightboxRef = useRef<PhotoSwipeLightbox | null>(null);
  const galleryId = 'gen-gallery';

  // 预加载尺寸，确保 PhotoSwipe 能正确显示
  const [sizes, setSizes] = useState<SizeMap>({});

  useEffect(() => {
    if (!isOpen || generatedImages.length === 0) return;

    let cancelled = false;

    const loadSizes = async () => {
      const entries = await Promise.all(
        generatedImages.map(
          (url) =>
            new Promise<[string, { w: number; h: number }]>((resolve) => {
              const img = new Image();
              img.onload = () => {
                resolve([url, { w: img.naturalWidth || 1024, h: img.naturalHeight || 1024 }]);
              };
              img.onerror = () => {
                resolve([url, { w: 1024, h: 1024 }]);
              };
              img.src = url;
            })
        )
      );
      if (!cancelled) {
        const map: SizeMap = {};
        for (const [url, sz] of entries) map[url] = sz;
        setSizes(map);
      }
    };

    loadSizes();

    return () => {
      cancelled = true;
    };
  }, [isOpen, generatedImages]);

  // 初始化/销毁 Lightbox
  useEffect(() => {
    if (!isOpen) {
      // 面板关闭时销毁
      if (lightboxRef.current) {
        lightboxRef.current.destroy();
        lightboxRef.current = null;
      }
      return;
    }
    if (lightboxRef.current) {
      // 已存在则先销毁再重建，防止重复绑定
      lightboxRef.current.destroy();
      lightboxRef.current = null;
    }

    // 初始化 PhotoSwipeLightbox
    const lb = new PhotoSwipeLightbox({
      gallery: `#${galleryId}`,
      children: 'a',
      pswpModule: () => import('photoswipe'),
      showHideAnimationType: 'zoom',
      bgOpacity: 0.85,
    });
    lb.init();
    lightboxRef.current = lb;

    return () => {
      lb.destroy();
      lightboxRef.current = null;
    };
  }, [isOpen, generatedImages]);

  const handleZoomOpen = (index: number) => {
    lightboxRef.current?.loadAndOpen(index);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-900/80 backdrop-blur-sm">
      <div className="container mx-auto max-w-7xl px-4 py-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">生成记录</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div id={galleryId} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
          {generatedImages.map((imageUrl, index) => {
            const size = sizes[imageUrl] || { w: 1024, h: 1024 };
            return (
              <div key={index} className="relative group aspect-square">
                {/* PhotoSwipe v5 需要 a 标签作为子项，href 指向大图，且尽可能提供尺寸 */}
                <a
                  href={imageUrl}
                  data-pswp-width={size.w}
                  data-pswp-height={size.h}
                  className="block w-full h-full"
                  onClick={(e) => {
                    // 让 a 的点击自然触发 Lightbox；若希望只在点击图片时触发，可保留默认
                    e.preventDefault();
                    handleZoomOpen(index);
                  }}
                >
                  <img
                    src={imageUrl}
                    alt={`Generated result ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg border border-gray-600"
                  />
                </a>

                {/* 悬浮操作图标 */}
                <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onDownloadImage(imageUrl, index)}
                    className="w-7 h-7 flex items-center justify-center bg-black/50 text-white rounded-full hover:bg-black/80"
                    title="下载"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onUseImage(imageUrl)}
                    className="w-7 h-7 flex items-center justify-center bg-black/50 text-white rounded-full hover:bg-black/80"
                    title="使用此图"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <button
            onClick={onRegenerate}
            className="flex items-center gap-2 px-6 py-2 text-sm bg-gray-700 text-white rounded-full hover:bg-gray-600 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            <span>重新生成</span>
          </button>
        </div>
      </div>
    </div>
  );
}
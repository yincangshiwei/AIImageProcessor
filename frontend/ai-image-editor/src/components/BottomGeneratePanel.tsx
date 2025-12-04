import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FloatingImageUploader from './FloatingImageUploader';
import {
  Clock,
  Loader,
  ArrowUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Aperture,
  Link2,
  Bot,
  User2,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { useApi } from '../contexts/ApiContext';
import { useAuth } from '../contexts/AuthContext';
import type { AssistantProfile } from '../types';
import type { ResolutionOption } from '../services/modelCapabilities';
import {
  DEFAULT_ASPECT_RATIO_OPTIONS,
  RESOLUTION_OPTIONS,
  SMART_ASPECT_OPTION,
  SMART_ASPECT_VALUE,
  buildAspectRatioOption,
  findResolutionOption,
  getAvailableAspectRatiosForModel,
  getAvailableResolutionsForModel,
  getDefaultModelOptions,
  getDefaultResolutionId,
  getDimensionOverrideForModel,
  ResolutionId,
} from '../services/modelCapabilities';

interface ModelOption {
  value: string;
  alias: string;
  description: string;
  logo: React.ReactNode;
  orderIndex?: number;
}

const clampDimension = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(64, Math.min(4096, Math.round(value)));
};

const parseAspectRatioValue = (ratio: string) => {
  if (ratio === SMART_ASPECT_VALUE) {
    return { width: 1, height: 1 };
  }
  const [w, h] = ratio.split(':').map((num) => Number(num) || 1);
  return { width: w, height: h };
};

const computeDimensions = (ratio: string, resolution?: ResolutionOption) => {
  const override = resolution?.overrides?.[ratio];
  if (override) {
    return override;
  }

  const ratioValue = parseAspectRatioValue(ratio);
  const base = resolution?.shortEdge ?? 1024;
  if (ratioValue.height === 0) {
    return { width: base, height: base };
  }
  if (ratioValue.width >= ratioValue.height) {
    const height = base;
    const width = clampDimension((base * ratioValue.width) / ratioValue.height);
    return { width, height };
  }
  const width = base;
  const height = clampDimension((base * ratioValue.height) / ratioValue.width);
  return { width, height };
};

const resolveDimensionsForSelection = (ratio: string, resolutionId: ResolutionId, modelValue: string) => {
  const override = getDimensionOverrideForModel(modelValue, resolutionId, ratio);
  if (override) {
    return override;
  }
  return computeDimensions(ratio, findResolutionOption(resolutionId));
};

const MODEL_STORAGE_KEY = 'ai-image-editor:preferred-model';
const ASSISTANT_STORAGE_KEY = 'ai-image-editor:preferred-assistant';
type AssistantScope = 'all' | 'official' | 'custom' | 'favorites';

const ASSISTANT_SCOPE_OPTIONS: Array<{ value: AssistantScope; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'official', label: '官方库' },
  { value: 'custom', label: '创作者库' },
  { value: 'favorites', label: '收藏库' },
];

const ASSISTANT_FETCH_LIMIT = 24;

const isSameAssistant = (a: AssistantProfile | null, b: AssistantProfile | null) => {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.id === b.id && a.type === b.type;
};

interface StoredAssistantPreference {
  id: number;
  type: AssistantProfile['type'];
  models?: string[];
  name?: string;
}

type AssistantPreferenceMap = Record<string, StoredAssistantPreference>;

const readStoredAssistantPreferenceMap = (): AssistantPreferenceMap => {
  if (typeof window === 'undefined') {
    return {};
  }
  const raw = window.localStorage.getItem(ASSISTANT_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    if ('id' in (parsed as Record<string, unknown>) && 'type' in (parsed as Record<string, unknown>)) {
      // legacy shape，直接忽略并重新记录
      return {};
    }
    return parsed as AssistantPreferenceMap;
  } catch (error) {
    console.error('助手偏好解析失败', error);
    return {};
  }
};

const writeAssistantPreferenceMap = (map: AssistantPreferenceMap) => {
  if (typeof window === 'undefined') {
    return;
  }
  const keys = Object.keys(map);
  if (!keys.length) {
    window.localStorage.removeItem(ASSISTANT_STORAGE_KEY);
    return;
  }
  try {
    window.localStorage.setItem(ASSISTANT_STORAGE_KEY, JSON.stringify(map));
  } catch (error) {
    console.error('助手偏好持久化失败', error);
  }
};

const persistAssistantPreferenceForModel = (modelValue: string, assistant: AssistantProfile | null) => {
  if (typeof window === 'undefined' || !modelValue) {
    return;
  }
  const currentMap = readStoredAssistantPreferenceMap();
  if (!assistant) {
    if (currentMap[modelValue]) {
      delete currentMap[modelValue];
      writeAssistantPreferenceMap(currentMap);
    }
    return;
  }
  currentMap[modelValue] = {
    id: assistant.id,
    type: assistant.type,
    models: assistant.models,
    name: assistant.name,
  };
  writeAssistantPreferenceMap(currentMap);
};

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
  onDimensionsChange?: (size: { width: number; height: number }) => void;
  initialModel?: string;
  onModelChange?: (modelValue: string) => void;
  modelOptions?: ModelOption[];
  onAssistantChange?: (assistant: AssistantProfile | null) => void;
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

  initialAspectRatio = SMART_ASPECT_VALUE,
  onAspectRatioChange,
  onDimensionsChange,
  initialModel,
  onModelChange,
  modelOptions,
  onAssistantChange,
}) => {
  const { api } = useApi();
  const { user } = useAuth();

  const [remoteModelOptions, setRemoteModelOptions] = useState<ModelOption[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const modelPreferenceAppliedRef = useRef(false);
  const assistantPreferenceHydratedModelsRef = useRef<Set<string>>(new Set());
  const assistantChangeInitializedRef = useRef(false);

  const [assistantScope, setAssistantScope] = useState<AssistantScope>('all');
  const [showAssistantDropdown, setShowAssistantDropdown] = useState(false);
  const [assistantSearchInput, setAssistantSearchInput] = useState('');
  const [assistantSearchKeyword, setAssistantSearchKeyword] = useState('');
  const [assistantOptions, setAssistantOptions] = useState<AssistantProfile[]>([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [selectedAssistant, setSelectedAssistant] = useState<AssistantProfile | null>(null);
  const assistantSelectionByModelRef = useRef<Record<string, AssistantProfile | null>>({});
  const selectedAssistantRef = useRef<AssistantProfile | null>(null);

  const updateSelectedAssistant = useCallback(
    (modelKey: string, assistant: AssistantProfile | null) => {
      setSelectedAssistant((prev) => (isSameAssistant(prev, assistant) ? prev : assistant));
      selectedAssistantRef.current = assistant;
      if (!modelKey) {
        return;
      }
      if (assistant) {
        assistantSelectionByModelRef.current[modelKey] = assistant;
      } else if (assistantSelectionByModelRef.current[modelKey]) {
        delete assistantSelectionByModelRef.current[modelKey];
      }
    },
    []
  );

  // 内部 UI 状态：比例/下拉、折叠、拖拽
  const [aspectRatio, setAspectRatio] = useState(initialAspectRatio);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const defaultModelOptions = useMemo<ModelOption[]>(
    () =>
      getDefaultModelOptions()
        .map((option, index) => ({
          value: option.value,
          alias: option.alias,
          description: option.description,
          orderIndex: option.orderIndex ?? index + 1,
          logo: (
            <img
              src={option.logoUrl}
              alt={option.alias}
              className="w-10 h-10 rounded-full object-cover"
            />
          ),
        }))
        .sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER)),
    []
  );
  const resolvedModelOptions = useMemo(() => {
    const sortByOrder = (options: ModelOption[]) =>
      [...options].sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER));

    if (modelOptions?.length) {
      return sortByOrder(modelOptions);
    }
    if (remoteModelOptions.length) {
      return sortByOrder(remoteModelOptions);
    }
    return defaultModelOptions;
  }, [modelOptions, remoteModelOptions, defaultModelOptions]);
  const initialModelValueRef = useMemo(
    () => initialModel ?? resolvedModelOptions[0]?.value ?? '',
    [initialModel, resolvedModelOptions]
  );

  const createInitialDimensions = () =>
    resolveDimensionsForSelection(initialAspectRatio, getDefaultResolutionId(initialModelValueRef), initialModelValueRef);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      setModelLoading(true);
      try {
        const models = await api.getAssistantModels('image');
        if (cancelled) {
          return;
        }
        const imageOnly = models.filter((model) => model.modelType === 'image');
        const sourceList = imageOnly.length ? imageOnly : models;
        const normalized = sourceList.map((model, index) => {
          const alias = model.alias ?? model.name;
          const label = alias || model.name;
          const fallbackLogo = (
            <div className="w-10 h-10 rounded-full bg-gray-700/80 text-white/80 text-xs flex items-center justify-center uppercase">
              {label.slice(0, 2)}
            </div>
          );
          const orderIndex = typeof model.orderIndex === 'number' ? model.orderIndex : index + 1;
          return {
            value: model.name,
            alias: label,
            description: model.description ?? '暂无描述',
            orderIndex,
            logo: model.logoUrl ? (
              <img
                src={model.logoUrl}
                alt={label}
                className="w-10 h-10 rounded-full object-cover border border-white/10"
              />
            ) : (
              fallbackLogo
            ),
          };
        });
        const deduped = Array.from(new Map(normalized.map((item) => [item.value, item])).values()).sort(
          (a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER)
        );
        setRemoteModelOptions(deduped);
      } catch (error) {
        if (!cancelled) {
          console.error('模型列表加载失败', error);
        }
      } finally {
        if (!cancelled) {
          setModelLoading(false);
        }
      }
    };

    loadModels();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const [showRatioSettings, setShowRatioSettings] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ResolutionId>(() => getDefaultResolutionId(initialModelValueRef));
  const [dimensions, setDimensions] = useState(createInitialDimensions);
  const [dimensionInputs, setDimensionInputs] = useState(() => {
    const initial = createInitialDimensions();
    return {
      width: String(initial.width),
      height: String(initial.height),
    };
  });
  const [isDimensionLocked, setIsDimensionLocked] = useState(true);
  const [selectedModelValue, setSelectedModelValue] = useState(initialModelValueRef);

  const applyModelSelection = useCallback(
    (nextValue: string) => {
      if (!nextValue) {
        return;
      }
      setSelectedModelValue(nextValue);
      setSelectedResolution(getDefaultResolutionId(nextValue));
      onModelChange?.(nextValue);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(MODEL_STORAGE_KEY, nextValue);
      }
    },
    [onModelChange]
  );

  useEffect(() => {
    onDimensionsChange?.(dimensions);
  }, [dimensions, onDimensionsChange]);

  useEffect(() => {
    if (modelPreferenceAppliedRef.current) {
      return;
    }
    if (!resolvedModelOptions.length) {
      return;
    }
    if (typeof window === 'undefined') {
      modelPreferenceAppliedRef.current = true;
      return;
    }
    const storedValue = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (storedValue && resolvedModelOptions.some((option) => option.value === storedValue)) {
      applyModelSelection(storedValue);
      modelPreferenceAppliedRef.current = true;
      return;
    }
    modelPreferenceAppliedRef.current = true;
  }, [applyModelSelection, resolvedModelOptions]);

  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const selectedModel = resolvedModelOptions.find((option) => option.value === selectedModelValue) ?? resolvedModelOptions[0];
  const availableResolutionOptions = useMemo(() => {
    const allowedIds = getAvailableResolutionsForModel(selectedModelValue);
    return RESOLUTION_OPTIONS.filter((option) => allowedIds.includes(option.id));
  }, [selectedModelValue]);
  const selectedResolutionOption = useMemo(
    () =>
      availableResolutionOptions.find((option) => option.id === selectedResolution) ??
      availableResolutionOptions[0] ??
      RESOLUTION_OPTIONS[0],
    [availableResolutionOptions, selectedResolution]
  );
  const availableAspectRatioOptions = useMemo(() => {
    const overrideRatios = getAvailableAspectRatiosForModel(selectedModelValue, selectedResolution);
    if (!overrideRatios.length) {
      return DEFAULT_ASPECT_RATIO_OPTIONS;
    }
    const uniqueRatios = Array.from(new Set(overrideRatios.filter(Boolean)));
    const ratioOptions = uniqueRatios.map((ratio) => buildAspectRatioOption(ratio));
    return [SMART_ASPECT_OPTION, ...ratioOptions];
  }, [selectedModelValue, selectedResolution]);
  const isSmartAspect = aspectRatio === SMART_ASPECT_VALUE;

  useEffect(() => {
    if (modelPreferenceAppliedRef.current) {
      return;
    }
    if (initialModelValueRef && initialModelValueRef !== selectedModelValue) {
      applyModelSelection(initialModelValueRef);
    }
  }, [initialModelValueRef, selectedModelValue, applyModelSelection]);

  useEffect(() => {
    const allowed = getAvailableResolutionsForModel(selectedModelValue);
    if (!allowed.includes(selectedResolution)) {
      const fallback = allowed[0] ?? RESOLUTION_OPTIONS[0].id;
      setSelectedResolution(fallback);
    }
  }, [selectedModelValue, selectedResolution]);

  useEffect(() => {
    const nextDimensions = resolveDimensionsForSelection(aspectRatio, selectedResolution, selectedModelValue);
    setDimensions(nextDimensions);
    setDimensionInputs({ width: String(nextDimensions.width), height: String(nextDimensions.height) });
  }, [aspectRatio, selectedResolution, selectedModelValue]);

  useEffect(() => {
    if (aspectRatio === SMART_ASPECT_VALUE) {
      return;
    }
    const allowedValues = availableAspectRatioOptions.map((option) => option.value);
    if (!allowedValues.includes(aspectRatio)) {
      const nonSmartOption = availableAspectRatioOptions.find((option) => option.value !== SMART_ASPECT_VALUE);
      const nextRatio = nonSmartOption?.value ?? SMART_ASPECT_VALUE;
      setAspectRatio(nextRatio);
      onAspectRatioChange?.(nextRatio);
    }
  }, [aspectRatio, availableAspectRatioOptions, onAspectRatioChange]);

  useEffect(() => {
    if (aspectRatio === SMART_ASPECT_VALUE && !isDimensionLocked) {
      setIsDimensionLocked(true);
    }
  }, [aspectRatio, isDimensionLocked]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setAssistantSearchKeyword(assistantSearchInput.trim());
    }, 350);
    return () => window.clearTimeout(handler);
  }, [assistantSearchInput]);

  useEffect(() => {
    const handleDragMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      const dx = event.clientX - dragStartRef.current.startX;
      const dy = event.clientY - dragStartRef.current.startY;
      setDragOffset({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };

    const handleDragMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (typeof document !== 'undefined') {
          document.body.style.cursor = 'default';
        }
      }
    };

    const handleDragTouchMove = (event: TouchEvent) => {
      if (!isDragging) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - dragStartRef.current.startX;
      const dy = touch.clientY - dragStartRef.current.startY;
      setDragOffset({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
      event.preventDefault();
    };

    const handleDragTouchEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        if (typeof document !== 'undefined') {
          document.body.style.cursor = 'default';
        }
      }
    };

    const touchMoveListenerOptions: AddEventListenerOptions = { passive: false };

    window.addEventListener('mousemove', handleDragMouseMove);
    window.addEventListener('mouseup', handleDragMouseUp);
    window.addEventListener('touchmove', handleDragTouchMove, touchMoveListenerOptions);
    window.addEventListener('touchend', handleDragTouchEnd);
    window.addEventListener('touchcancel', handleDragTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleDragMouseMove);
      window.removeEventListener('mouseup', handleDragMouseUp);
      window.removeEventListener('touchmove', handleDragTouchMove, touchMoveListenerOptions);
      window.removeEventListener('touchend', handleDragTouchEnd);
      window.removeEventListener('touchcancel', handleDragTouchEnd);
    };
  }, [isDragging]);

  const shouldPreventDragFromTarget = (target: HTMLElement | null) => {
    if (!target) {
      return false;
    }
    if (!isPanelCollapsed) {
      if (target.closest('button, a, input, textarea')) {
        return true;
      }
      if (typeof window !== 'undefined') {
        const cursor = window.getComputedStyle(target).cursor;
        if (cursor === 'pointer') {
          return true;
        }
      }
    }
    return false;
  };

  const startDragSession = (clientX: number, clientY: number, updateCursor: boolean) => {
    setIsDragging(true);
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initialX: dragOffset.x,
      initialY: dragOffset.y,
    };
    if (updateCursor && typeof document !== 'undefined') {
      document.body.style.cursor = 'grabbing';
    }
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;

    if (shouldPreventDragFromTarget(target)) {
      return;
    }

    startDragSession(event.clientX, event.clientY, true);
    event.preventDefault();
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (shouldPreventDragFromTarget(target)) {
      return;
    }
    const touch = event.touches[0];
    startDragSession(touch.clientX, touch.clientY, false);
    event.preventDefault();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowRatioSettings(false);
        setShowModelDropdown(false);
        setShowAssistantDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!selectedModelValue) {
      setAssistantOptions([]);
      return;
    }

    assistantPreferenceHydratedModelsRef.current.delete(selectedModelValue);

    let cancelled = false;
    const loadAssistants = async () => {
      setAssistantLoading(true);
      setAssistantError(null);
      try {
        const response = await api.getAssistants({
          search: assistantSearchKeyword,
          coverType: 'image',
          officialPage: 1,
          customPage: 1,
          favoritesPage: 1,
          pageSize: ASSISTANT_FETCH_LIMIT,
          authCode: user?.code,
          customVisibility: 'all',
          category: '全部',
        });
        if (cancelled) {
          return;
        }
        const officialItems = response.official?.items ?? [];
        const customItems = response.custom?.items ?? [];
        const favoriteItems = response.favorites?.items ?? [];
        let scopedItems: AssistantProfile[];
        switch (assistantScope) {
          case 'official':
            scopedItems = officialItems;
            break;
          case 'custom':
            scopedItems = customItems;
            break;
          case 'favorites':
            scopedItems = favoriteItems;
            break;
          default:
            scopedItems = [...officialItems, ...customItems];
            break;
        }
        const filtered = scopedItems.filter((assistant) => assistant.models?.includes(selectedModelValue));
        setAssistantOptions(filtered);

        const currentSelection = selectedAssistantRef.current;
        const currentMatch = currentSelection
          ? filtered.find((assistant) => assistant.id === currentSelection.id && assistant.type === currentSelection.type)
          : null;

        const preferenceMap = readStoredAssistantPreferenceMap();
        const storedEntry = preferenceMap[selectedModelValue];
        let resolvedAssistant: AssistantProfile | null = currentMatch ?? null;
        let shouldClearStoredPreference = false;

        if (!resolvedAssistant && storedEntry) {
          const storedMatch = filtered.find(
            (assistant) => assistant.id === storedEntry.id && assistant.type === storedEntry.type
          );
          if (storedMatch) {
            resolvedAssistant = storedMatch;
          } else {
            shouldClearStoredPreference = true;
          }
        }

        if (resolvedAssistant) {
          updateSelectedAssistant(selectedModelValue, resolvedAssistant);
        } else if (currentSelection) {
          updateSelectedAssistant(selectedModelValue, null);
        }

        if (shouldClearStoredPreference) {
          persistAssistantPreferenceForModel(selectedModelValue, null);
        }

        assistantPreferenceHydratedModelsRef.current.add(selectedModelValue);
      } catch (error) {
        if (!cancelled) {
          console.error('助手数据加载失败', error);
          setAssistantOptions([]);
          setAssistantError(error instanceof Error ? error.message : '助手数据加载失败');
        }
      } finally {
        if (!cancelled) {
          setAssistantLoading(false);
        }
      }
    };

    loadAssistants();
    return () => {
      cancelled = true;
    };
  }, [api, assistantScope, assistantSearchKeyword, selectedModelValue, user?.code]);

  useEffect(() => {
    if (!assistantPreferenceHydratedModelsRef.current.has(selectedModelValue)) {
      return;
    }
    persistAssistantPreferenceForModel(selectedModelValue, selectedAssistant);
  }, [selectedAssistant, selectedModelValue]);

  const orderedAssistantOptions = useMemo(() => {
    if (!selectedAssistant) {
      return assistantOptions;
    }
    const matchIndex = assistantOptions.findIndex(
      (assistant) => assistant.id === selectedAssistant.id && assistant.type === selectedAssistant.type
    );
    if (matchIndex <= 0) {
      return assistantOptions;
    }
    const reordered = assistantOptions.slice();
    const [match] = reordered.splice(matchIndex, 1);
    return [match, ...reordered];
  }, [assistantOptions, selectedAssistant]);

  useEffect(() => {
    if (!assistantChangeInitializedRef.current) {
      assistantChangeInitializedRef.current = true;
      if (!selectedAssistant) {
        return;
      }
    }
    onAssistantChange?.(selectedAssistant ?? null);
  }, [selectedAssistant, onAssistantChange]);

  useEffect(() => {
    if (!selectedModelValue) {
      return;
    }
    const cachedAssistant = assistantSelectionByModelRef.current[selectedModelValue] ?? null;
    const currentAssistant = selectedAssistantRef.current;
    if (!cachedAssistant) {
      if (currentAssistant) {
        updateSelectedAssistant(selectedModelValue, null);
      }
      return;
    }
    if (!isSameAssistant(currentAssistant, cachedAssistant)) {
      updateSelectedAssistant(selectedModelValue, cachedAssistant);
    }
  }, [selectedModelValue, updateSelectedAssistant]);

  useEffect(() => {
    if (!selectedAssistant) {
      return;
    }
    if (!selectedAssistant.models?.includes(selectedModelValue)) {
      updateSelectedAssistant(selectedModelValue, null);
    }
  }, [selectedAssistant, selectedModelValue, updateSelectedAssistant]);

  const handleSelectRatio = (ratio: string) => {
    setAspectRatio(ratio);
    const nextDimensions = resolveDimensionsForSelection(ratio, selectedResolution, selectedModelValue);
    setDimensions(nextDimensions);
    setDimensionInputs({ width: String(nextDimensions.width), height: String(nextDimensions.height) });
    if (ratio === SMART_ASPECT_VALUE) {
      setIsDimensionLocked(true);
    }
    onAspectRatioChange?.(ratio);
  };

  const handleSelectResolution = (resolutionId: ResolutionId) => {
    setSelectedResolution(resolutionId);
  };

  const handleSelectAssistant = (assistant: AssistantProfile) => {
    if (!assistant || !selectedModelValue) {
      return;
    }
    if (isSameAssistant(selectedAssistantRef.current, assistant)) {
      updateSelectedAssistant(selectedModelValue, null);
      setShowAssistantDropdown(false);
      return;
    }
    const supportsCurrentModel = assistant.models?.includes(selectedModelValue);
    if (!supportsCurrentModel && assistant.models?.length) {
      applyModelSelection(assistant.models[0]);
    }
    updateSelectedAssistant(selectedModelValue, assistant);
    setShowAssistantDropdown(false);
  };

  const handleDimensionInput = (key: 'width' | 'height', value: string) => {
    if (isSmartAspect) return;

    const sanitized = value.replace(/[^0-9]/g, '');
    setDimensionInputs((prev) => ({ ...prev, [key]: sanitized }));

    if (!sanitized) return;

    const numeric = Number(sanitized);
    if (numeric < 64) return;

    const clamped = clampDimension(numeric);
    const ratioValue = parseAspectRatioValue(aspectRatio);

    if (!isDimensionLocked || ratioValue.width === 0 || ratioValue.height === 0) {
      const next = {
        width: key === 'width' ? clamped : dimensions.width,
        height: key === 'height' ? clamped : dimensions.height,
      };
      setDimensions(next);
      setDimensionInputs((prev) => ({ ...prev, [key]: String(clamped) }));
      return;
    }

    if (key === 'width') {
      const height = clampDimension((clamped * ratioValue.height) / ratioValue.width);
      setDimensions({ width: clamped, height });
      setDimensionInputs({ width: String(clamped), height: String(height) });
      return;
    }

    const width = clampDimension((clamped * ratioValue.width) / ratioValue.height);
    setDimensions({ width, height: clamped });
    setDimensionInputs({ width: String(width), height: String(clamped) });
  };

  const handleDimensionBlur = (key: 'width' | 'height') => {
    if (isSmartAspect) return;

    const value = dimensionInputs[key];
    if (!value) {
      setDimensionInputs((prev) => ({ ...prev, [key]: String(dimensions[key]) }));
      return;
    }
    handleDimensionInput(key, value);
  };

  const toggleDimensionLock = () => {
    if (isSmartAspect) return;
    setIsDimensionLocked((prev) => !prev);
  };

  const handleSelectModel = (model: ModelOption) => {
    const nextValue = model.value;
    if (nextValue !== selectedModelValue) {
      applyModelSelection(nextValue);
    }
    setShowModelDropdown(false);
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50"
      style={{
        transform: `translateX(-50%) translate(${dragOffset.x}px, ${dragOffset.y}px)`,
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
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

                <div className="mt-2">
                  <div className="flex flex-wrap gap-3">
                    <div className="relative dropdown-container inline-block">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowModelDropdown(!showModelDropdown);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg text-sm transition-colors min-w-[140px] max-w-[220px]"
                      >
                        <Aperture className="w-4 h-4 text-neon-blue flex-shrink-0" />
                        <span className="text-sm text-white font-medium truncate">
                          {selectedModel?.alias ?? '选择模型'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      </button>
                      {showModelDropdown && (
                        <div className="absolute bottom-full mb-2 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-20 w-72 max-h-80 overflow-y-auto p-2 space-y-2">
                          {modelLoading ? (
                            <div className="py-6 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                              <Loader className="w-4 h-4 animate-spin" />
                              加载模型中...
                            </div>
                          ) : (
                            resolvedModelOptions.map((option) => (
                              <button
                                key={option.value}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectModel(option);
                                }}
                                data-model-value={option.value}
                                className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${
                                  selectedModelValue === option.value
                                    ? 'border-neon-blue bg-neon-blue/10 shadow-lg shadow-neon-blue/20'
                                    : 'border-gray-700 bg-gray-800/50 hover:bg-gray-700/50'
                                }`}
                              >
                                {option.logo}
                                <div>
                                  <p className="text-sm font-semibold text-white">{option.alias}</p>
                                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{option.description}</p>
                                </div>
                                <span className="sr-only">{option.value}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div className="relative dropdown-container inline-block">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAssistantDropdown(!showAssistantDropdown);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-lg text-sm transition-colors min-w-[140px] max-w-[220px]"
                        title={selectedAssistant?.name ?? '选择图像助手'}
                      >
                        <Bot className="w-4 h-4 text-fuchsia-300 flex-shrink-0" />
                        <span className="text-sm text-white font-medium truncate">
                          {selectedAssistant?.name ?? '选择图像助手'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      </button>
                      {showAssistantDropdown && (
                        <div className="absolute bottom-full right-0 mb-2 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-30 w-[420px] max-h-[460px] overflow-hidden p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 flex-1 rounded-xl border border-gray-700 bg-gray-800/60 px-3 py-1.5">
                              <Search className="w-4 h-4 text-gray-400" />
                              <input
                                value={assistantSearchInput}
                                onChange={(e) => setAssistantSearchInput(e.target.value)}
                                className="w-full bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
                                placeholder="搜索助手或创作者关键词"
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              {ASSISTANT_SCOPE_OPTIONS.map((option) => {
                                const active = assistantScope === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAssistantScope(option.value);
                                    }}
                                    className={`px-2.5 py-1 rounded-full text-xs transition ${
                                      active
                                        ? 'bg-neon-blue/20 text-white border border-neon-blue/40'
                                        : 'text-gray-400 border border-gray-700 hover:text-white'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {assistantScope === 'custom' && !user?.code && (
                            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                              绑定授权码后可加载创作者库助手。
                            </div>
                          )}

                          {assistantScope === 'favorites' && !user?.code && (
                            <div className="rounded-xl border border-pink-400/40 bg-pink-500/10 px-3 py-2 text-xs text-pink-100">
                              绑定授权码后可查看收藏库助手。
                            </div>
                          )}

                          {assistantError && (
                            <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                              {assistantError}
                            </div>
                          )}

                          <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
                            {assistantLoading ? (
                              <div className="py-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                                <Loader className="w-4 h-4 animate-spin" />
                                加载助手中...
                              </div>
                            ) : orderedAssistantOptions.length ? (
                              orderedAssistantOptions.map((assistant) => {
                                const active = isSameAssistant(selectedAssistant, assistant);
                                return (
                                  <button
                                    key={`${assistant.type}-${assistant.id}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectAssistant(assistant);
                                    }}
                                    className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center gap-3 ${
                                      active
                                        ? 'border-neon-blue bg-neon-blue/10 shadow-lg shadow-neon-blue/20'
                                        : 'border-gray-700 bg-gray-800/40 hover:bg-gray-700/40'
                                    }`}
                                  >
                                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 flex-shrink-0">
                                      {assistant.coverUrl ? (
                                        <img
                                          src={assistant.coverUrl}
                                          alt={assistant.name}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gray-700 text-gray-400 text-xs">
                                          AI
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-white truncate">{assistant.name}</p>
                                      <p className="text-[11px] text-gray-400 truncate">
                                        {assistant.visibility === 'private' ? '私有' : '公开'} · {assistant.type === 'official' ? '官方' : '创作者'}
                                        {assistant.ownerDisplayName ? ` · ${assistant.ownerDisplayName}` : ''}
                                      </p>
                                      <p className="text-xs text-gray-500 line-clamp-2 mt-1">
                                        {assistant.definition || assistant.description || '暂无描述'}
                                      </p>
                                    </div>
                                    <div className="flex flex-col items-end text-[11px] text-gray-400 gap-1">
                                      {assistant.type === 'official' ? (
                                        <ShieldCheck className="w-4 h-4 text-neon-blue" />
                                      ) : (
                                        <User2 className="w-4 h-4 text-gray-400" />
                                      )}
                                      <span className="text-gray-500 truncate max-w-[80px]">
                                        {assistant.ownerDisplayName ?? '平台'}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="rounded-2xl border border-white/10 px-4 py-6 text-center text-sm text-gray-400">
                                当前模型暂无匹配助手
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-700/80 flex items-center justify-between">
              <div className="flex items-center gap-4">

                <div className="relative dropdown-container">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowRatioSettings(!showRatioSettings);
                    }}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg text-sm transition-colors w-[165px]"
                  >
                    <span className="text-sm text-white font-medium">{aspectRatio}</span>
                    <span className="text-gray-500 text-xs">|</span>
                    <span className="text-xs text-gray-300 truncate">{selectedResolutionOption?.label}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {showRatioSettings && (
                    <div className="absolute bottom-full right-0 mb-3 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl z-30 w-[360px] p-4 space-y-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-2">选择比例</p>
                        <div className="grid grid-cols-4 gap-2">
                          {availableAspectRatioOptions.map((option) => {
                            const previewAspect = option.value.includes(':')
                              ? option.value.replace(':', ' / ')
                              : '1 / 1';
                            return (
                              <button
                                key={option.value}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectRatio(option.value);
                                }}
                                className={`flex flex-col items-center justify-center px-2 py-2 rounded-xl border transition-all ${
                                  aspectRatio === option.value
                                    ? 'border-neon-blue bg-neon-blue/10 text-neon-blue'
                                    : 'border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white'
                                }`}
                              >
                                <div
                                  className="w-10 bg-gray-600 rounded-md mb-1"
                                  style={{
                                    aspectRatio: previewAspect,
                                    height: '18px',
                                  }}
                                ></div>
                                <span className="text-xs">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-gray-400 mb-2">选择分辨率</p>
                        <div className="flex flex-wrap gap-2">
                          {availableResolutionOptions.map((option) => (
                            <button
                              key={option.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectResolution(option.id);
                              }}
                              className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                                selectedResolution === option.id
                                  ? 'border-neon-blue bg-neon-blue/10 text-white'
                                  : 'border-gray-700 text-gray-300 hover:border-gray-600'
                              }`}
                            >
                              <span>{option.label}</span>
                              {option.extra && (
                                <span className="ml-2 text-xs text-gray-400">{option.extra}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-gray-400 mb-2">尺寸</p>
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-gray-500 mb-1 block">W</label>
                            <input
                              type="number"
                              value={dimensionInputs.width}
                              onChange={(e) => handleDimensionInput('width', e.target.value)}
                              onBlur={() => handleDimensionBlur('width')}
                              className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-sm text-white text-center focus:outline-none focus:border-neon-blue ${
                                isSmartAspect
                                  ? 'border-gray-700 text-gray-500 cursor-not-allowed opacity-80'
                                  : 'border-gray-700'
                              }`}
                              min={64}
                              max={4096}
                              disabled={isSmartAspect}
                              readOnly={isSmartAspect}
                            />
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleDimensionLock();
                            }}
                            disabled={isSmartAspect}
                            className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
                              isSmartAspect
                                ? 'border-gray-700 text-gray-500 cursor-not-allowed bg-gray-800/60'
                                : isDimensionLocked
                                  ? 'border-neon-blue text-neon-blue bg-neon-blue/10'
                                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
                            }`}
                          >
                            <Link2
                              className={`w-4 h-4 ${
                                isSmartAspect ? 'opacity-60' : isDimensionLocked ? '' : 'opacity-60'
                              }`}
                            />
                          </button>
                          <div className="flex-1">
                            <label className="text-xs text-gray-500 mb-1 block">H</label>
                            <input
                              type="number"
                              value={dimensionInputs.height}
                              onChange={(e) => handleDimensionInput('height', e.target.value)}
                              onBlur={() => handleDimensionBlur('height')}
                              className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-sm text-white text-center focus:outline-none focus:border-neon-blue ${
                                isSmartAspect
                                  ? 'border-gray-700 text-gray-500 cursor-not-allowed opacity-80'
                                  : 'border-gray-700'
                              }`}
                              min={64}
                              max={4096}
                              disabled={isSmartAspect}
                              readOnly={isSmartAspect}
                            />
                          </div>
                          <span className="text-xs text-gray-500 pb-2">PX</span>
                        </div>
                      </div>
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
          onTouchStart={(e) => e.stopPropagation()}
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
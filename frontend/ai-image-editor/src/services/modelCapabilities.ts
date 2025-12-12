export type ResolutionId = 'standard' | 'high' | 'ultra';

export interface Dimension {
  width: number;
  height: number;
}

export interface ModelResolutionOverrides {
  dimensionOverrides?: Record<string, Dimension>;
}

export interface ModelMetadata {
  alias: string;
  description: string;
  logoUrl: string;
  orderIndex?: number;
  creditCost?: number | null;
  discountCreditCost?: number | null;
  isFreeToUse?: boolean;
}

export interface ModelCapability {
  resolutionIds: ResolutionId[];
  overrides?: Partial<Record<ResolutionId, ModelResolutionOverrides>>;
  meta?: ModelMetadata;
}

const BASE_ASPECT_RATIO_VALUES = ['21:9', '16:9', '3:2', '4:3', '1:1', '3:4', '2:3', '9:16'];

const createAspectRatioOption = (ratio: string) => {
  const [w, h] = ratio.split(':').map((num) => Number(num) || 1);
  return {
    label: ratio,
    value: ratio,
    ratioValue: h === 0 ? 1 : w / h,
  };
};

export interface AspectRatioOption {
  label: string;
  value: string;
  ratioValue: number;
}

export const SMART_ASPECT_VALUE = '智能';

export const SMART_ASPECT_OPTION: AspectRatioOption = {
  label: SMART_ASPECT_VALUE,
  value: SMART_ASPECT_VALUE,
  ratioValue: 1,
};

export const DEFAULT_ASPECT_RATIO_OPTIONS: AspectRatioOption[] = [
  SMART_ASPECT_OPTION,
  ...BASE_ASPECT_RATIO_VALUES.map((ratio) => createAspectRatioOption(ratio)),
];

export const buildAspectRatioOption = (ratio: string): AspectRatioOption => {
  const existing = DEFAULT_ASPECT_RATIO_OPTIONS.find((option) => option.value === ratio);
  if (existing) {
    return existing;
  }
  return createAspectRatioOption(ratio);
};

export interface ModelOptionDefinition extends ModelMetadata {
  value: string;
}

export const getDefaultModelOptions = (): ModelOptionDefinition[] => {
  return Object.entries(MODEL_CAPABILITIES)
    .filter(([, capability]) => capability.meta)
    .map(([value, capability]) => ({
      value,
      ...(capability.meta as ModelMetadata),
    }))
    .sort((a, b) => (a.orderIndex ?? Number.MAX_SAFE_INTEGER) - (b.orderIndex ?? Number.MAX_SAFE_INTEGER));
};

const HIGH_RES_DIMENSION_OVERRIDES: Record<string, Dimension> = {
  '1:1': { width: 2048, height: 2048 },
  '3:4': { width: 1728, height: 2304 },
  '4:3': { width: 2304, height: 1728 },
  '2:3': { width: 1664, height: 2496 },
  '3:2': { width: 3072, height: 2048 },
  '9:16': { width: 1440, height: 2560 },
  '16:9': { width: 2560, height: 1440 },
  '21:9': { width: 3024, height: 1296 },
};

const SUPER_HIGH_RES_DIMENSION_OVERRIDES: Record<string, Dimension> = {
  '1:1': { width: 4096, height: 4096 },
  '3:4': { width: 3520, height: 4693 },
  '4:3': { width: 4693, height: 3520 },
  '2:3': { width: 3328, height: 4992 },
  '3:2': { width: 4992, height: 3328 },
  '9:16': { width: 3040, height: 5404 },
  '16:9': { width: 5404, height: 3040 },
  '21:9': { width: 6197, height: 2656 },
};

export interface ResolutionOption {
  id: ResolutionId;
  label: string;
  shortEdge: number;
  extra?: string;
  overrides?: Record<string, Dimension>;
}

export const RESOLUTION_OPTIONS: ResolutionOption[] = [
  { id: 'standard', label: '标准 1K', shortEdge: 1024 },
  { id: 'high', label: '高清 2K', shortEdge: 2048, overrides: HIGH_RES_DIMENSION_OVERRIDES },
  { id: 'ultra', label: '超清 4K', shortEdge: 4096, overrides: SUPER_HIGH_RES_DIMENSION_OVERRIDES },
];

export const RESOLUTION_TO_IMAGE_SIZE: Record<ResolutionId, '1K' | '2K' | '4K'> = {
  standard: '1K',
  high: '2K',
  ultra: '4K',
};

const DEFAULT_RESOLUTION_ORDER: ResolutionId[] = RESOLUTION_OPTIONS.map((option) => option.id);


export const findResolutionOption = (resolutionId: ResolutionId): ResolutionOption => {
  return RESOLUTION_OPTIONS.find((option) => option.id === resolutionId) ?? RESOLUTION_OPTIONS[0];
};

const MODEL_CAPABILITIES: Record<string, ModelCapability> = {
    'gemini-3-pro-image-preview': {
    resolutionIds: ['standard', 'high', 'ultra'],
    overrides: {
      standard: {
        dimensionOverrides: {
          '1:1': { width: 1024, height: 1024 },
          '2:3': { width: 848, height: 1264 },
          '3:2': { width: 1264, height: 848 },
          '3:4': { width: 896, height: 1200 },
          '4:3': { width: 1200, height: 896 },
          '4:5': { width: 928, height: 1152 },
          '5:4': { width: 1152, height: 928 },
          '9:16': { width: 768, height: 1376 },
          '16:9': { width: 1376, height: 768 },
          '21:9': { width: 1584, height: 672 },
        },
      },
      high: {
        dimensionOverrides: {
          '1:1': { width: 2048, height: 2048 },
          '2:3': { width: 1696, height: 2528 },
          '3:2': { width: 2528, height: 1696 },
          '3:4': { width: 1792, height: 2400 },
          '4:3': { width: 2400, height: 1792 },
          '4:5': { width: 1856, height: 2304 },
          '5:4': { width: 2304, height: 1856 },
          '9:16': { width: 1536, height: 2752 },
          '16:9': { width: 2752, height: 1536 },
          '21:9': { width: 3168, height: 1344 },
        },
      },
      ultra: {
        dimensionOverrides: {
          '1:1': { width: 4096, height: 4096 },
          '2:3': { width: 3392, height: 5056 },
          '3:2': { width: 5056, height: 3392 },
          '3:4': { width: 3584, height: 4800 },
          '4:3': { width: 4800, height: 3584 },
          '4:5': { width: 3712, height: 4608 },
          '5:4': { width: 4608, height: 3712 },
          '9:16': { width: 3072, height: 5504 },
          '16:9': { width: 5504, height: 3072 },
          '21:9': { width: 6336, height: 2688 },
        },
      },
    },
    meta: {
      alias: 'NanoBananaPro',
      description: 'Google Nano Banana系列最新版，最强的图像处理与理解能力，更好的质量',
      logoUrl: 'https://yh-it-1325210923.cos.ap-guangzhou.myqcloud.com/static/logo/Nano%20Banana%20%E5%9C%86%E5%BD%A2Logo_128.png',
      orderIndex: 1,
      creditCost: 12,
      discountCreditCost: 10,
      isFreeToUse: false,

    },
  },
  'gemini-2.5-flash-image': {
    resolutionIds: ['standard'],
    overrides: {
      standard: {
        dimensionOverrides: {
          '1:1': { width: 1024, height: 1024 },
          '2:3': { width: 832, height: 1248 },
          '3:2': { width: 1248, height: 832 },
          '3:4': { width: 864, height: 1184 },
          '4:3': { width: 1184, height: 864 },
          '4:5': { width: 896, height: 1152 },
          '5:4': { width: 1152, height: 896 },
          '9:16': { width: 768, height: 1344 },
          '16:9': { width: 1344, height: 768 },
          '21:9': { width: 1536, height: 672 },
        },
      },
    },
    meta: {
      alias: 'NanoBanana',
      description: 'Google Nano Banana系列第一代',
      logoUrl: 'https://yh-it-1325210923.cos.ap-guangzhou.myqcloud.com/static/logo/Nano%20Banana%20%E5%9C%86%E5%BD%A2Logo_128.png',
      orderIndex: 2,
      creditCost: 8,
      discountCreditCost: null,
      isFreeToUse: false,
    },
  },
  
};

const DEFAULT_MODEL_CAPABILITY: ModelCapability = {
  resolutionIds: DEFAULT_RESOLUTION_ORDER,
};

export const getModelCapability = (modelValue: string): ModelCapability => {
  return MODEL_CAPABILITIES[modelValue] ?? DEFAULT_MODEL_CAPABILITY;
};

export const getAvailableResolutionsForModel = (modelValue: string): ResolutionId[] => {
  const capability = getModelCapability(modelValue);
  return capability.resolutionIds.length ? capability.resolutionIds : DEFAULT_RESOLUTION_ORDER;
};

export const getDimensionOverrideForModel = (
  modelValue: string,
  resolutionId: ResolutionId,
  ratio: string,
): Dimension | undefined => {
  const capability = getModelCapability(modelValue);
  return capability.overrides?.[resolutionId]?.dimensionOverrides?.[ratio];
};

export const getAvailableAspectRatiosForModel = (modelValue: string, resolutionId: ResolutionId): string[] => {
  const capability = getModelCapability(modelValue);
  const overrides = capability.overrides?.[resolutionId]?.dimensionOverrides;
  return overrides ? Object.keys(overrides) : [];
};

export const getDefaultResolutionId = (modelValue: string): ResolutionId => {
  const available = getAvailableResolutionsForModel(modelValue);
  return available[0] ?? DEFAULT_RESOLUTION_ORDER[0];
};

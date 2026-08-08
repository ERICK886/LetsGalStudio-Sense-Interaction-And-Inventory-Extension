/**
 * design-resolution.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 扩展全局设计分辨率：默认 1920×1080、预设列表、钳制与 contain 布局。
 */

/** 默认设计宽度（Full HD） */
export const DEFAULT_DESIGN_WIDTH = 1920;

/** 默认设计高度（Full HD） */
export const DEFAULT_DESIGN_HEIGHT = 1080;

/** 可配置最小边长 */
export const DESIGN_SIZE_MIN = 320;

/** 可配置最大边长 */
export const DESIGN_SIZE_MAX = 7680;

/** settings 字段名：设计宽 */
export const SETTINGS_DESIGN_WIDTH = "designWidth";

/** settings 字段名：设计高 */
export const SETTINGS_DESIGN_HEIGHT = "designHeight";

/**
 * 设计分辨率（像素）。
 */
export interface DesignSize {
  /** 设计宽度（CSS / 设计像素） */
  width: number;

  /** 设计高度（CSS / 设计像素） */
  height: number;
}

/**
 * 分辨率预设项。
 */
export interface DesignResolutionPreset {
  /** 宽 */
  width: number;

  /** 高 */
  height: number;

  /** 下拉显示标签 */
  label: string;

  /** 分组：16:9 / 16:10 / 4:3 */
  group: "16:9" | "16:10" | "4:3";
}

/**
 * 与 Studio 宿主列表对齐的预设（不含自定义）。
 */
export const DESIGN_RESOLUTION_PRESETS: readonly DesignResolutionPreset[] = [
  { width: 3840, height: 2160, label: "3840 × 2160 (4K UHD)", group: "16:9" },
  { width: 2560, height: 1440, label: "2560 × 1440 (2K QHD)", group: "16:9" },
  { width: 1920, height: 1080, label: "1920 × 1080 (Full HD)", group: "16:9" },
  { width: 1600, height: 900, label: "1600 × 900", group: "16:9" },
  { width: 1366, height: 768, label: "1366 × 768", group: "16:9" },
  { width: 1280, height: 720, label: "1280 × 720 (HD)", group: "16:9" },
  { width: 1920, height: 1200, label: "1920 × 1200 (16:10)", group: "16:10" },
  { width: 1280, height: 800, label: "1280 × 800 (16:10)", group: "16:10" },
  { width: 1024, height: 768, label: "1024 × 768 (4:3)", group: "4:3" },
  { width: 800, height: 600, label: "800 × 600 (4:3)", group: "4:3" },
] as const;

/**
 * 钳制设计边长到合法范围并取整。
 *
 * @param n - 原始值
 * @returns [DESIGN_SIZE_MIN, DESIGN_SIZE_MAX] 内的整数；非有限数回退默认宽
 *
 * @example
 * clampDesignEdge(100); // 320
 * clampDesignEdge(1920.4); // 1920
 */
export function clampDesignEdge(n: number): number {
  if (!Number.isFinite(n)) {
    return DEFAULT_DESIGN_WIDTH;
  }

  return Math.round(
    Math.min(DESIGN_SIZE_MAX, Math.max(DESIGN_SIZE_MIN, n)),
  );
}

/**
 * 规范化设计尺寸；非法时回退默认 Full HD。
 *
 * @param width - 宽
 * @param height - 高
 * @returns DesignSize
 *
 * @example
 * normalizeDesignSize(1920, 1080); // { width: 1920, height: 1080 }
 */
export function normalizeDesignSize(
  width: unknown,
  height: unknown,
): DesignSize {
  const w =
    typeof width === "number" && Number.isFinite(width) && width > 0
      ? clampDesignEdge(width)
      : DEFAULT_DESIGN_WIDTH;
  const h =
    typeof height === "number" && Number.isFinite(height) && height > 0
      ? clampDesignEdge(height)
      : DEFAULT_DESIGN_HEIGHT;

  return { width: w, height: h };
}

/**
 * 格式化为下拉按钮文案。
 *
 * @param size - 设计尺寸
 * @returns 如 `1920 × 1080`
 */
export function formatDesignSizeLabel(size: DesignSize): string {
  return `${size.width} × ${size.height}`;
}

/**
 * 是否匹配某一预设。
 *
 * @param size - 当前尺寸
 * @param preset - 预设
 * @returns 宽高均相等则为 true
 */
export function matchesPreset(
  size: DesignSize,
  preset: DesignResolutionPreset,
): boolean {
  return size.width === preset.width && size.height === preset.height;
}

/**
 * 在世界矩形内计算 contain 后的精灵尺寸与偏移（居中）。
 *
 * @param worldW - 世界宽
 * @param worldH - 世界高
 * @param imageW - 底图宽
 * @param imageH - 底图高
 * @returns `{ width, height, x, y }`（左上角位置）
 *
 * @example
 * containInWorld(1920, 1080, 2048, 2048);
 */
export function containInWorld(
  worldW: number,
  worldH: number,
  imageW: number,
  imageH: number,
): { width: number; height: number; x: number; y: number } {
  const iw = Math.max(1, imageW);
  const ih = Math.max(1, imageH);
  const ww = Math.max(1, worldW);
  const wh = Math.max(1, worldH);
  const scale = Math.min(ww / iw, wh / ih);
  const width = iw * scale;
  const height = ih * scale;

  return {
    width,
    height,
    x: (ww - width) / 2,
    y: (wh - height) / 2,
  };
}

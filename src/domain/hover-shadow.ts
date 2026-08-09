/**
 * hover-shadow.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 交互点悬停效果的默认值、JSON 规范化与 CSS 拼装。
 * 支持光晕/底影双层、过渡、缩放、亮度/饱和度/对比度与光标。
 */

import type {
  HotspotHoverCursor,
  HotspotHoverShadow,
  HoverShadowLayer,
} from "./types";

/** 光晕层默认色（场景 UI 预设） */
const DEFAULT_GLOW_COLOR = "#DCDAD3";

/** 底影层默认色 */
const DEFAULT_BASE_COLOR = "#000000";

/** 默认过渡毫秒 */
const DEFAULT_TRANSITION_MS = 120;

/** 合法光标枚举 */
const HOVER_CURSORS: readonly HotspotHoverCursor[] = [
  "pointer",
  "default",
  "grab",
  "crosshair",
  "help",
  "zoom-in",
];

/**
 * 将数值限制在 [min, max]；非有限数回退为 min。
 *
 * @param n - 待限制的值
 * @param min - 下限（含）
 * @param max - 上限（含）
 * @returns 限制后的有限数
 */
function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.min(max, Math.max(min, n));
}

/**
 * 解析 CSS 十六进制颜色为 RGB 分量。
 *
 * @param color - 待解析的颜色字符串
 * @returns RGB 分量对象，或 null（非法）
 */
function parseCssHexToRgb(
  color: string,
): { r: number; g: number; b: number } | null {
  const trimmed = color.trim();
  const shortMatch = /^#([0-9A-Fa-f]{3})$/.exec(trimmed);

  if (shortMatch) {
    const hex = shortMatch[1];
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }

  const longMatch = /^#([0-9A-Fa-f]{6})$/.exec(trimmed);

  if (longMatch) {
    const hex = longMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
}

/**
 * 将合法十六进制颜色规范化为 `#RRGGBB` 大写。
 *
 * @param color - 已通过 parseCssHexToRgb 校验的颜色串
 * @returns 六位大写十六进制颜色
 */
function normalizeHexToUpper(color: string): string {
  const rgb = parseCssHexToRgb(color);

  if (rgb === null) {
    return color;
  }

  const toHex = (n: number): string =>
    n.toString(16).padStart(2, "0").toUpperCase();

  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * 返回指定层的默认 HoverShadowLayer。
 *
 * @param kind - 层类型：`"glow"` 光晕 或 `"base"` 底影
 * @returns 该层完整默认配置
 */
export function defaultHoverShadowLayer(
  kind: "glow" | "base",
): HoverShadowLayer {
  if (kind === "glow") {
    return {
      enabled: true,
      color: DEFAULT_GLOW_COLOR,
      opacity: 0.85,
      offsetX: 0,
      offsetY: 0,
      blur: 10,
      intensity: 1,
    };
  }

  return {
    enabled: true,
    color: DEFAULT_BASE_COLOR,
    opacity: 0.45,
    offsetX: 0,
    offsetY: 2,
    blur: 6,
    intensity: 1,
  };
}

/**
 * 返回交互点悬停效果的完整默认配置。
 *
 * @returns 默认 HotspotHoverShadow
 */
export function defaultHotspotHoverShadow(): HotspotHoverShadow {
  return {
    useGlobal: true,
    enabled: true,
    glow: defaultHoverShadowLayer("glow"),
    base: defaultHoverShadowLayer("base"),
    transitionMs: DEFAULT_TRANSITION_MS,
    hoverScale: 1,
    brightness: 1,
    saturate: 1,
    contrast: 1,
    cursor: "pointer",
  };
}

/**
 * @param value - 原始 color
 * @param fallback - 失败回退
 * @returns `#RRGGBB` 或 fallback
 */
function normalizeLayerColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const rgb = parseCssHexToRgb(value);

  if (rgb === null) {
    return fallback;
  }

  return normalizeHexToUpper(value);
}

/**
 * @param value - 原始 opacity
 * @param fallback - 非法回退
 * @returns 0–1
 */
function normalizeOpacity(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, 0, 1);
}

/**
 * @param value - 原始 intensity
 * @param fallback - 非法回退
 * @returns 0–2
 */
function normalizeIntensity(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, 0, 2);
}

/**
 * @param value - 原始 blur
 * @param fallback - 非法回退
 * @returns ≥ 0
 */
function normalizeBlur(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, value);
}

/**
 * @param value - 原始 offset
 * @param fallback - 非法回退
 * @returns 有限偏移
 */
function normalizeOffset(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

/**
 * @param value - 原始过渡毫秒
 * @param fallback - 非法回退
 * @returns 0–2000 整数
 */
function normalizeTransitionMs(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(clamp(value, 0, 2000));
}

/**
 * @param value - 原始缩放/滤镜倍率
 * @param fallback - 非法回退
 * @param min - 下限
 * @param max - 上限
 * @returns clamp 后的倍率
 */
function normalizeFactor(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, min, max);
}

/**
 * @param value - 原始光标
 * @param fallback - 非法回退
 * @returns 合法光标
 */
function normalizeCursor(
  value: unknown,
  fallback: HotspotHoverCursor,
): HotspotHoverCursor {
  if (
    typeof value === "string" &&
    (HOVER_CURSORS as readonly string[]).includes(value)
  ) {
    return value as HotspotHoverCursor;
  }

  return fallback;
}

/**
 * 将任意 JSON 输入规范化为单层 HoverShadowLayer。
 *
 * @param raw - 原始层对象或 undefined
 * @param kind - 层类型
 * @returns 规范化后的单层配置
 */
function normalizeHoverShadowLayer(
  raw: unknown,
  kind: "glow" | "base",
): HoverShadowLayer {
  const defaults = defaultHoverShadowLayer(kind);

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  return {
    enabled:
      obj.enabled === undefined ? defaults.enabled : Boolean(obj.enabled),
    color: normalizeLayerColor(obj.color, defaults.color),
    opacity: normalizeOpacity(obj.opacity, defaults.opacity),
    offsetX: normalizeOffset(obj.offsetX, defaults.offsetX),
    offsetY: normalizeOffset(obj.offsetY, defaults.offsetY),
    blur: normalizeBlur(obj.blur, defaults.blur),
    intensity: normalizeIntensity(obj.intensity, defaults.intensity),
  };
}

/**
 * 将任意 JSON 输入规范化为 HotspotHoverShadow。
 *
 * @param raw - 原始 hoverShadow 对象或任意值
 * @returns 规范化后的悬停配置
 */
export function normalizeHotspotHoverShadow(raw: unknown): HotspotHoverShadow {
  const defaults = defaultHotspotHoverShadow();

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;

  const shadow: HotspotHoverShadow = {
    enabled: obj.enabled === undefined ? true : Boolean(obj.enabled),
    glow: normalizeHoverShadowLayer(obj.glow, "glow"),
    base: normalizeHoverShadowLayer(obj.base, "base"),
    transitionMs: normalizeTransitionMs(
      obj.transitionMs,
      defaults.transitionMs ?? DEFAULT_TRANSITION_MS,
    ),
    hoverScale: normalizeFactor(obj.hoverScale, defaults.hoverScale ?? 1, 0.5, 2),
    brightness: normalizeFactor(
      obj.brightness,
      defaults.brightness ?? 1,
      0,
      3,
    ),
    saturate: normalizeFactor(obj.saturate, defaults.saturate ?? 1, 0, 3),
    contrast: normalizeFactor(obj.contrast, defaults.contrast ?? 1, 0, 3),
    cursor: normalizeCursor(obj.cursor, defaults.cursor ?? "pointer"),
  };

  shadow.useGlobal = obj.useGlobal !== false;

  return shadow;
}

/**
 * 将单层配置转为 CSS drop-shadow 片段；层关闭或颜色非法时返回 null。
 *
 * @param layer - 单层悬停阴影配置
 * @returns drop-shadow(...) 字符串，或 null
 */
function layerToDropShadow(layer: HoverShadowLayer): string | null {
  if (!layer.enabled) {
    return null;
  }

  const rgb = parseCssHexToRgb(layer.color);

  if (rgb === null) {
    return null;
  }

  const alpha = clamp(layer.opacity * layer.intensity, 0, 1);
  const blur = Math.max(0, layer.blur);

  return `drop-shadow(${layer.offsetX}px ${layer.offsetY}px ${blur}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha}))`;
}

/**
 * 根据 HotspotHoverShadow 拼装 CSS filter 字符串（阴影 + 可选色调滤镜）。
 *
 * @param shadow - 规范化后的悬停配置
 * @param active - 是否处于悬停激活态
 * @returns 非空 filter；无有效效果时 undefined
 */
export function buildHoverShadowFilter(
  shadow: HotspotHoverShadow,
  active = true,
): string | undefined {
  if (!shadow.enabled || !active) {
    return undefined;
  }

  const parts: string[] = [];
  const glow = layerToDropShadow(shadow.glow);
  const base = layerToDropShadow(shadow.base);

  if (glow) {
    parts.push(glow);
  }

  if (base) {
    parts.push(base);
  }

  const brightness = shadow.brightness ?? 1;
  const saturate = shadow.saturate ?? 1;
  const contrast = shadow.contrast ?? 1;

  if (Math.abs(brightness - 1) > 0.001) {
    parts.push(`brightness(${brightness})`);
  }

  if (Math.abs(saturate - 1) > 0.001) {
    parts.push(`saturate(${saturate})`);
  }

  if (Math.abs(contrast - 1) > 0.001) {
    parts.push(`contrast(${contrast})`);
  }

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(" ");
}

/**
 * 运行时悬停样式（filter / transform / transition / cursor）。
 */
export interface HoverRuntimeStyle {
  filter?: string;
  transform?: string;
  transition: string;
  cursor?: HotspotHoverCursor;
}

/**
 * 根据悬停配置生成运行时样式片段。
 *
 * 注意：不对 filter / transform 做 CSS transition。
 * Blink/WebKit 把 `filter: none → drop-shadow(...)` 插值时，常被看成「从小放大」；
 * 转场显现叠加上去会更明显。悬停缩放改为瞬时切换。
 *
 * @param shadow - 已 resolve / normalize 的配置
 * @param active - 当前是否悬停在可交互区域
 * @returns 可合并进 HotspotView style 的字段
 *
 * @example
 * ```ts
 * const s = buildHoverRuntimeStyle(resolved, interactiveHover);
 * // style={{ ...s, filter: s.filter }}
 * ```
 */
export function buildHoverRuntimeStyle(
  shadow: HotspotHoverShadow,
  active: boolean,
): HoverRuntimeStyle {
  const scale = normalizeFactor(shadow.hoverScale, 1, 0.5, 2);
  const effectActive = Boolean(shadow.enabled) && active;
  const filter = buildHoverShadowFilter(shadow, effectActive);
  const scaleDelta = Math.abs(scale - 1) > 0.001;

  const result: HoverRuntimeStyle = {
    transition: "none",
    cursor: shadow.cursor ?? "pointer",
  };

  if (filter !== undefined) {
    result.filter = filter;
  }

  if (effectActive && scaleDelta) {
    result.transform = `scale(${scale})`;
  }

  return result;
}

/** 供 schema 下拉使用的光标选项 */
export const HOTSPOT_HOVER_CURSOR_OPTIONS: ReadonlyArray<{
  value: HotspotHoverCursor;
  label: string;
}> = [
  { value: "pointer", label: "手型（pointer）" },
  { value: "default", label: "默认箭头" },
  { value: "grab", label: "抓取（grab）" },
  { value: "crosshair", label: "十字准星" },
  { value: "help", label: "帮助" },
  { value: "zoom-in", label: "放大" },
];

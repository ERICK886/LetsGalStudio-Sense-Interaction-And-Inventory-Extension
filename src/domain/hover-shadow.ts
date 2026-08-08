/**
 * hover-shadow.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 交互点悬停阴影的默认值、JSON 规范化与 CSS filter 拼装。
 * 支持光晕（glow）与底影（base）双层独立开关；总开关优先。
 * 交互点实例可选 useGlobal 跟随 SceneUiConfig.hotspotHover。
 */

import type { HotspotHoverShadow, HoverShadowLayer } from "./types";

/** 光晕层默认色（对齐运行时旧硬编码 rgb(255, 236, 160)） */
const DEFAULT_GLOW_COLOR = "#FFECA0";

/** 底影层默认色 */
const DEFAULT_BASE_COLOR = "#000000";

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
 * 支持 `#RGB` 与 `#RRGGBB` 格式；非法输入返回 null。
 *
 * @param color - 待解析的颜色字符串
 * @returns RGB 分量对象，或 null（非法）
 *
 * @example
 * parseCssHexToRgb("#FFECA0"); // { r: 255, g: 236, b: 160 }
 * parseCssHexToRgb("#FA0");    // { r: 255, g: 170, b: 0 }
 * parseCssHexToRgb("red");     // null
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

  const toHex = (n: number): string => n.toString(16).padStart(2, "0").toUpperCase();

  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * 返回指定层的默认 HoverShadowLayer。
 *
 * @param kind - 层类型：`"glow"` 光晕 或 `"base"` 底影
 * @returns 该层完整默认配置
 *
 * @example
 * defaultHoverShadowLayer("glow").color; // "#FFECA0"
 * defaultHoverShadowLayer("base").offsetY; // 2
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
 * 返回交互点悬停阴影的完整默认配置（总开关开 + 双层默认）。
 *
 * @returns 默认 HotspotHoverShadow
 *
 * @example
 * const shadow = defaultHotspotHoverShadow();
 * buildHoverShadowFilter(shadow);
 * // "drop-shadow(0 0 10px rgba(255, 236, 160, 0.85)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.45))"
 */
export function defaultHotspotHoverShadow(): HotspotHoverShadow {
  return {
    useGlobal: true,
    enabled: true,
    glow: defaultHoverShadowLayer("glow"),
    base: defaultHoverShadowLayer("base"),
  };
}

/**
 * 规范化单层颜色字段。
 *
 * @param value - 原始 color 值
 * @param fallback - 解析失败时的默认色
 * @returns 合法 `#RRGGBB` 大写或 fallback
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
 * 规范化 opacity（0–1）；非有限数回退默认。
 *
 * @param value - 原始 opacity
 * @param fallback - 非法时的默认值
 * @returns clamp 后的 opacity
 */
function normalizeOpacity(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, 0, 1);
}

/**
 * 规范化 intensity（0–2）；非有限数回退默认。
 *
 * @param value - 原始 intensity
 * @param fallback - 非法时的默认值
 * @returns clamp 后的 intensity
 */
function normalizeIntensity(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, 0, 2);
}

/**
 * 规范化 blur（>= 0）；非有限数回退默认。
 *
 * @param value - 原始 blur
 * @param fallback - 非法时的默认值
 * @returns 非负 blur
 */
function normalizeBlur(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, value);
}

/**
 * 规范化偏移量；非有限数回退默认。
 *
 * @param value - 原始 offset
 * @param fallback - 非法时的默认值
 * @returns 有限偏移
 */
function normalizeOffset(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

/**
 * 将任意 JSON 输入规范化为单层 HoverShadowLayer。
 *
 * @param raw - 原始层对象或 undefined
 * @param kind - 层类型，用于缺省字段回退
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
 * - 入参缺失或非对象 → 完整默认
 * - 仅有 `{ enabled }` 的旧数据 → 保留总开关，glow/base 填默认层
 * - 部分层字段缺失 → 按字段回退该层默认并 clamp
 * - 实例路径始终写出具体布尔 `useGlobal`（`obj.useGlobal !== false`）；全局预设经 strip 剥离该字段
 *
 * @param raw - 原始 hoverShadow 对象或任意值
 * @returns 规范化后的悬停阴影配置
 *
 * @example
 * normalizeHotspotHoverShadow(undefined);
 * // 完整默认，总开关 true
 *
 * normalizeHotspotHoverShadow({ enabled: false });
 * // enabled false，glow/base 仍为完整默认层
 *
 * normalizeHotspotHoverShadow({ enabled: true });
 * // 与旧库 { enabled: true } 等价于双层硬编码默认
 */
export function normalizeHotspotHoverShadow(raw: unknown): HotspotHoverShadow {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaultHotspotHoverShadow();
  }

  const obj = raw as Record<string, unknown>;

  const shadow: HotspotHoverShadow = {
    enabled: obj.enabled === undefined ? true : Boolean(obj.enabled),
    glow: normalizeHoverShadowLayer(obj.glow, "glow"),
    base: normalizeHoverShadowLayer(obj.base, "base"),
  };

  // 实例 normalize 始终给出具体布尔，供表单 Boolean(raw) 与运行时 !== false 判定一致
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
 * 根据 HotspotHoverShadow 拼装 CSS filter 字符串。
 *
 * 总开关关、或两层均关/无效时返回 undefined。
 *
 * @param shadow - 规范化后的悬停阴影配置
 * @returns 非空 filter 字符串；无有效层时 undefined
 *
 * @example
 * buildHoverShadowFilter(defaultHotspotHoverShadow());
 * // 双层 drop-shadow，对齐旧 DEFAULT_HOVER_DROP_SHADOW
 *
 * buildHoverShadowFilter({ ...defaultHotspotHoverShadow(), enabled: false });
 * // undefined
 */
export function buildHoverShadowFilter(
  shadow: HotspotHoverShadow,
): string | undefined {
  if (!shadow.enabled) {
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

  if (parts.length === 0) {
    return undefined;
  }

  return parts.join(" ");
}

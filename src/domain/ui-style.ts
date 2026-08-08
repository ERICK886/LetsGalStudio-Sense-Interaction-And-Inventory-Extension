/**
 * ui-style.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 自由布局 HUD/背包节点的矩形与样式规范化，以及 React CSS 映射。
 */
import type { CSSProperties } from "react";

import { normalizeHexColor } from "../schema/color-utils";

import type { UiBoxStyle, UiRect, UiTextStyle } from "./types";

/** accentAlpha 非法 accent 时的默认回退色 */
const DEFAULT_ACCENT = "#64e0d0";

/**
 * 判断数值是否为有限数。
 *
 * @param value - 待检测值
 * @returns 是否为有限 number
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 将坐标值钳制到 [0, max]；max 非有限时仅保证非负。
 *
 * @param value - 原始坐标
 * @param max - 可选上界（如容器宽/高）
 * @returns 钳制后的坐标
 */
function clampCoordinate(value: number, max?: number): number {
  const lowerBounded = Math.max(0, value);

  if (max !== undefined && isFiniteNumber(max)) {
    return Math.min(lowerBounded, max);
  }

  return lowerBounded;
}

/**
 * 规范化 w/h：有限且 > 0 时至少为 1，否则回退 fallback 对应字段。
 *
 * @param rawValue - 原始宽或高
 * @param provided - raw 是否显式提供了该字段
 * @param fallbackValue - 回退值
 * @returns 规范化后的尺寸
 */
function normalizeDimension(
  rawValue: unknown,
  provided: boolean,
  fallbackValue: number | undefined,
): number | undefined {
  if (!provided) {
    return fallbackValue;
  }

  if (!isFiniteNumber(rawValue) || rawValue <= 0) {
    return fallbackValue;
  }

  return Math.max(1, rawValue);
}

/**
 * 将任意输入规范化为 UiRect。
 *
 * - x/y 非有限数回退 fallback
 * - 可选 bounds 将 x/y 钳进 [0, bounds.w] / [0, bounds.h]
 * - w/h 若 raw 提供：有限且 > 0 则 Math.max(1, value)，否则回退 fallback
 *
 * @param raw - 原始矩形或部分字段
 * @param fallback - 缺省/非法字段的回退矩形
 * @param bounds - 可选容器尺寸，用于钳制 x/y 上界
 * @returns 规范化后的 UiRect
 *
 * @example
 * ```ts
 * normalizeUiRect({ x: 10, y: 20, w: -1 }, { x: 0, y: 0, w: 100, h: 50 });
 * // { x: 10, y: 20, w: 100, h: 50 }
 * ```
 */
export function normalizeUiRect(
  raw: Partial<UiRect> | undefined,
  fallback: UiRect,
  bounds?: Pick<UiRect, "w" | "h">,
): UiRect {
  const source = raw ?? {};

  const x = isFiniteNumber(source.x) ? source.x : fallback.x;
  const y = isFiniteNumber(source.y) ? source.y : fallback.y;

  const w = normalizeDimension(source.w, source.w !== undefined, fallback.w);
  const h = normalizeDimension(source.h, source.h !== undefined, fallback.h);

  return {
    x: clampCoordinate(x, bounds?.w),
    y: clampCoordinate(y, bounds?.h),
    w,
    h,
  };
}

/**
 * 将 opacity 钳制到 [0, 1]；非法时返回 undefined（表示不写 CSS）。
 *
 * @param value - 原始透明度
 * @returns 0–1 之间的数，或 undefined
 */
function normalizeOpacity(value: unknown): number | undefined {
  if (!isFiniteNumber(value)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, value));
}

/**
 * 将 shadow 强度钳制到 [0, 1]；非法时返回 undefined。
 *
 * @param value - 原始阴影强度
 * @returns 0–1 之间的数，或 undefined
 */
function normalizeShadow(value: unknown): number | undefined {
  if (!isFiniteNumber(value)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, value));
}

/**
 * 将任意输入规范化为 UiBoxStyle。
 *
 * @param raw - 原始样式或部分字段
 * @param fallback - 缺省/非法字段的回退样式
 * @returns 规范化后的 UiBoxStyle
 */
export function normalizeUiBoxStyle(
  raw: Partial<UiBoxStyle> | undefined,
  fallback: UiBoxStyle,
): UiBoxStyle {
  const source = raw ?? {};

  const opacity =
    source.opacity !== undefined
      ? normalizeOpacity(source.opacity) ?? fallback.opacity
      : fallback.opacity;

  const shadow =
    source.shadow !== undefined
      ? normalizeShadow(source.shadow) ?? fallback.shadow
      : fallback.shadow;

  const borderWidth =
    source.borderWidth !== undefined
      ? isFiniteNumber(source.borderWidth) && source.borderWidth >= 0
        ? source.borderWidth
        : fallback.borderWidth
      : fallback.borderWidth;

  const borderRadius =
    source.borderRadius !== undefined
      ? isFiniteNumber(source.borderRadius) && source.borderRadius >= 0
        ? source.borderRadius
        : fallback.borderRadius
      : fallback.borderRadius;

  return {
    background:
      typeof source.background === "string"
        ? source.background
        : fallback.background,
    borderColor:
      typeof source.borderColor === "string"
        ? source.borderColor
        : fallback.borderColor,
    borderWidth,
    borderRadius,
    opacity,
    shadow,
  };
}

/**
 * 将任意输入规范化为 UiTextStyle。
 *
 * @param raw - 原始文本样式或部分字段
 * @param fallback - 缺省/非法字段的回退样式
 * @returns 规范化后的 UiTextStyle
 */
export function normalizeUiTextStyle(
  raw: Partial<UiTextStyle> | undefined,
  fallback: UiTextStyle,
): UiTextStyle {
  const source = raw ?? {};

  const fontSize =
    source.fontSize !== undefined
      ? isFiniteNumber(source.fontSize) && source.fontSize > 0
        ? source.fontSize
        : fallback.fontSize
      : fallback.fontSize;

  const fontWeight =
    source.fontWeight !== undefined
      ? isFiniteNumber(source.fontWeight) && source.fontWeight > 0
        ? source.fontWeight
        : fallback.fontWeight
      : fallback.fontWeight;

  return {
    color: typeof source.color === "string" ? source.color : fallback.color,
    fontSize,
    fontWeight,
    label: typeof source.label === "string" ? source.label : fallback.label,
  };
}

/**
 * 将 UiBoxStyle 映射为 React 内联样式。
 *
 * - shadow 映射为 `0 ${8*s}px ${24*s}px rgba(0,0,0,${0.35*s})`
 * - opacity 未设置时不写入 CSS
 *
 * @param style - 盒模型样式
 * @returns React CSSProperties
 *
 * @example
 * ```ts
 * applyUiBoxStyle({ shadow: 0.5 });
 * // { boxShadow: "0 4px 12px rgba(0,0,0,0.175)" }
 * ```
 */
export function applyUiBoxStyle(style: UiBoxStyle): CSSProperties {
  const css: CSSProperties = {};

  if (style.background !== undefined) {
    css.backgroundColor = style.background;
  }

  if (style.borderColor !== undefined) {
    css.borderColor = style.borderColor;
  }

  if (style.borderWidth !== undefined) {
    css.borderWidth = style.borderWidth;
    css.borderStyle = "solid";
  }

  if (style.borderRadius !== undefined) {
    css.borderRadius = style.borderRadius;
  }

  if (style.opacity !== undefined) {
    css.opacity = style.opacity;
  }

  if (style.shadow !== undefined && style.shadow > 0) {
    const s = style.shadow;
    css.boxShadow = `0 ${8 * s}px ${24 * s}px rgba(0,0,0,${0.35 * s})`;
  }

  return css;
}

/**
 * 将 UiTextStyle 映射为 React 内联样式（label 为领域字段，不写入 CSS）。
 *
 * @param style - 文本样式
 * @returns React CSSProperties
 */
export function applyUiTextStyle(style: UiTextStyle): CSSProperties {
  const css: CSSProperties = {};

  if (style.color !== undefined) {
    css.color = style.color;
  }

  if (style.fontSize !== undefined) {
    css.fontSize = style.fontSize;
  }

  if (style.fontWeight !== undefined) {
    css.fontWeight = style.fontWeight;
  }

  return css;
}

/**
 * 将 6 位 accent 色与 2 位 hex alpha 拼接为 8 位 #RRGGBBAA。
 *
 * @param accent - 强调色（支持 #RGB / #RRGGBB / #RRGGBBAA，八位时截断 alpha）
 * @param hexAlpha - 两位十六进制 alpha（如 `"22"`）
 * @returns 8 位 hex；非法 accent 回退 `#64e0d0` + alpha
 *
 * @example
 * ```ts
 * accentAlpha("#64e0d0", "22"); // "#64e0d022"（大小写保留 normalizeHexColor 结果）
 * accentAlpha("bad", "ff");     // "#64e0d0ff"
 * ```
 */
export function accentAlpha(accent: string, hexAlpha: string): string {
  const normalized = normalizeHexColor(accent);
  const alpha = hexAlpha.trim().toLowerCase();

  const base =
    normalized === null
      ? DEFAULT_ACCENT
      : normalized.length === 9
        ? normalized.slice(0, 7)
        : normalized;

  return `${base}${alpha}`;
}

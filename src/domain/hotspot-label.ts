/**
 * hotspot-label.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 交互点悬浮/常驻名称标签的默认值、规范化与全局/本地外观解析。
 */
import {
  DEFAULT_DESIGN_HEIGHT,
  DEFAULT_DESIGN_WIDTH,
} from "./design-resolution";
import { defaultElementMotion, normalizeElementMotion } from "./motion";
import type {
  HotspotElement,
  HotspotLabel,
  HotspotLabelMode,
  HotspotLabelStyleConfig,
  UiBoxStyle,
  UiTextStyle,
} from "./types";
import { normalizeUiBoxStyle, normalizeUiTextStyle } from "./ui-style";

/** 默认布局参照宽 */
const DEFAULT_REF_W = DEFAULT_DESIGN_WIDTH;

/** 默认布局参照高 */
const DEFAULT_REF_H = DEFAULT_DESIGN_HEIGHT;

const VALID_MODES: readonly HotspotLabelMode[] = ["hover", "always", "hidden"];

/**
 * 判断 value 是否为合法 HotspotLabelMode。
 *
 * @param value - 待校验值
 * @returns 是否为合法标签显示模式
 */
function isValidLabelMode(value: unknown): value is HotspotLabelMode {
  return (
    typeof value === "string" &&
    (VALID_MODES as readonly string[]).includes(value)
  );
}

/**
 * 将偏移量规范化为有限数；非法时返回 undefined。
 *
 * @param value - 原始偏移
 * @returns 有限数或 undefined
 */
function normalizeOffset(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

/**
 * 将非负有限数规范化；非法时回退 fallback。
 *
 * @param value - 原始值
 * @param fallback - 回退
 * @returns ≥ 0 的有限数
 */
function normalizeNonNegative(
  value: unknown,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }

  return value;
}

/**
 * 返回与历史硬编码观感一致的默认标签外观（基准 1920×1080）。
 *
 * @returns 默认 HotspotLabelStyleConfig
 */
export function defaultHotspotLabelStyleConfig(): HotspotLabelStyleConfig {
  return {
    style: {
      background: "rgba(12, 16, 14, 0.82)",
      borderRadius: 4,
      color: "#F2F4F3",
      fontSize: 12,
      fontWeight: 400,
    },
    paddingX: 8,
    paddingY: 2,
    maxWidth: 220,
  };
}

/**
 * 将标签外观从一套设计分辨率缩放到另一套。
 *
 * @param cfg - 源配置
 * @param fromW - 源设计宽
 * @param fromH - 源设计高
 * @param toW - 目标设计宽
 * @param toH - 目标设计高
 * @returns 新配置
 */
export function scaleHotspotLabelStyleConfig(
  cfg: HotspotLabelStyleConfig,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): HotspotLabelStyleConfig {
  const fw = Math.max(1, fromW);
  const fh = Math.max(1, fromH);
  const tw = Math.max(1, toW);
  const th = Math.max(1, toH);

  if (fw === tw && fh === th) {
    return cfg;
  }

  const s = Math.min(tw / fw, th / fh);
  const style: UiBoxStyle & UiTextStyle = { ...cfg.style };

  if (typeof style.borderRadius === "number") {
    style.borderRadius = Math.max(0, Math.round(style.borderRadius * s));
  }

  if (typeof style.fontSize === "number") {
    style.fontSize = Math.max(1, Math.round(style.fontSize * s));
  }

  if (typeof style.borderWidth === "number") {
    style.borderWidth = Math.max(0, Math.round(style.borderWidth * s));
  }

  return {
    style,
    paddingX: Math.max(0, Math.round(cfg.paddingX * s)),
    paddingY: Math.max(0, Math.round(cfg.paddingY * s)),
    maxWidth: Math.max(1, Math.round(cfg.maxWidth * s)),
  };
}

/**
 * 按设计尺寸返回默认标签外观（非 1920×1080 时等比缩放）。
 *
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
 * @returns 默认外观
 */
export function defaultHotspotLabelStyleConfigForDesign(
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): HotspotLabelStyleConfig {
  const base = defaultHotspotLabelStyleConfig();

  if (refW === DEFAULT_REF_W && refH === DEFAULT_REF_H) {
    return base;
  }

  return scaleHotspotLabelStyleConfig(
    base,
    DEFAULT_REF_W,
    DEFAULT_REF_H,
    refW,
    refH,
  );
}

/**
 * 将任意输入规范化为 HotspotLabelStyleConfig。
 *
 * @param raw - 原始对象或部分字段
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
 * @returns 规范化后的外观配置
 */
export function normalizeHotspotLabelStyleConfig(
  raw: unknown,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): HotspotLabelStyleConfig {
  const defaults = defaultHotspotLabelStyleConfigForDesign(refW, refH);

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaults;
  }

  const obj = raw as Record<string, unknown>;
  const styleRaw =
    obj.style !== undefined && typeof obj.style === "object" && obj.style !== null
      ? (obj.style as Partial<UiBoxStyle & UiTextStyle>)
      : (obj as Partial<UiBoxStyle & UiTextStyle>);

  const box = normalizeUiBoxStyle(styleRaw, defaults.style);
  const text = normalizeUiTextStyle(styleRaw, defaults.style);

  return {
    style: { ...box, ...text },
    paddingX: normalizeNonNegative(obj.paddingX, defaults.paddingX),
    paddingY: normalizeNonNegative(obj.paddingY, defaults.paddingY),
    maxWidth: Math.max(1, normalizeNonNegative(obj.maxWidth, defaults.maxWidth)),
  };
}

/**
 * 返回标签默认值（hover 模式 + 默认外观 + 默认动效）。
 *
 * @param refW - 参考设计宽（影响默认字号等）
 * @param refH - 参考设计高
 * @returns 默认 HotspotLabel
 */
export function defaultHotspotLabel(
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): HotspotLabel {
  const appearance = defaultHotspotLabelStyleConfigForDesign(refW, refH);

  return {
    text: "",
    mode: "hover",
    useGlobalStyle: true,
    style: { ...appearance.style },
    paddingX: appearance.paddingX,
    paddingY: appearance.paddingY,
    maxWidth: appearance.maxWidth,
    customCss: "",
    motion: defaultElementMotion(),
  };
}

/**
 * 将任意 JSON 输入规范化为 HotspotLabel；完全非法时返回 undefined。
 *
 * @param raw - 原始 label 对象或 undefined
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
 * @returns 规范化后的标签，或 undefined（表示不显示标签配置）
 *
 * @example
 * normalizeHotspotLabel(undefined); // undefined
 * normalizeHotspotLabel({ text: "门" }); // mode 默认 hover，跟随全局外观
 */
export function normalizeHotspotLabel(
  raw: unknown,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): HotspotLabel | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  if (typeof raw !== "object") {
    return undefined;
  }

  const obj = raw as Record<string, unknown>;
  const defaults = defaultHotspotLabel(refW, refH);
  const offsetX = normalizeOffset(obj.offsetX);
  const offsetY = normalizeOffset(obj.offsetY);
  const appearance = normalizeHotspotLabelStyleConfig(
    {
      style: obj.style,
      paddingX: obj.paddingX,
      paddingY: obj.paddingY,
      maxWidth: obj.maxWidth,
    },
    refW,
    refH,
  );

  const label: HotspotLabel = {
    text: typeof obj.text === "string" ? obj.text : defaults.text,
    mode: isValidLabelMode(obj.mode) ? obj.mode : defaults.mode,
    useGlobalStyle: obj.useGlobalStyle !== false,
    style: appearance.style,
    paddingX: appearance.paddingX,
    paddingY: appearance.paddingY,
    maxWidth: appearance.maxWidth,
    customCss:
      typeof obj.customCss === "string" ? obj.customCss : defaults.customCss,
    motion: normalizeElementMotion(obj.motion),
  };

  if (offsetX !== undefined) {
    label.offsetX = offsetX;
  }

  if (offsetY !== undefined) {
    label.offsetY = offsetY;
  }

  return label;
}

/**
 * 运行时解析后的标签外观（供 HotspotView 渲染）。
 */
export interface ResolvedHotspotLabelAppearance {
  style: UiBoxStyle & UiTextStyle;
  paddingX: number;
  paddingY: number;
  maxWidth: number;
  customCss: string;
}

/**
 * 根据交互点本地 label 与全局预设，解析运行时提示文本外观。
 *
 * - `local.useGlobalStyle === false` → 使用本地 style / padding / maxWidth
 * - 否则 → 使用全局 `hotspotLabel`
 * - `customCss` 始终取自本地（空则无）
 *
 * @param hotspot - 含 label 的交互点（或 Pick）
 * @param globalLabel - `SceneUiConfig.hotspotLabel`
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
 * @returns 解析后的外观
 */
export function resolveHotspotLabelAppearance(
  hotspot: Pick<HotspotElement, "label">,
  globalLabel: HotspotLabelStyleConfig,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): ResolvedHotspotLabelAppearance {
  const local = normalizeHotspotLabel(hotspot.label, refW, refH);
  const global = normalizeHotspotLabelStyleConfig(globalLabel, refW, refH);

  if (local !== undefined && local.useGlobalStyle === false) {
    return {
      style: local.style,
      paddingX: local.paddingX ?? global.paddingX,
      paddingY: local.paddingY ?? global.paddingY,
      maxWidth: local.maxWidth ?? global.maxWidth,
      customCss: local.customCss,
    };
  }

  return {
    style: global.style,
    paddingX: global.paddingX,
    paddingY: global.paddingY,
    maxWidth: global.maxWidth,
    customCss: local?.customCss ?? "",
  };
}

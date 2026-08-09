/**
 * scene-return-button-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景返回按钮（SceneUiConfig.sceneReturn）的默认值与 JSON 规范化。
 */

import {
  DEFAULT_DESIGN_HEIGHT,
  DEFAULT_DESIGN_WIDTH,
} from "./design-resolution";
import type {
  SceneReturnButtonConfig,
  UiBoxStyle,
  UiRect,
  UiTextStyle,
} from "./types";
import {
  normalizeUiBoxStyle,
  normalizeUiRect,
  normalizeUiTextStyle,
} from "./ui-style";

/** 默认布局参照宽 */
const DEFAULT_REF_W = DEFAULT_DESIGN_WIDTH;

/** 默认布局参照高 */
const DEFAULT_REF_H = DEFAULT_DESIGN_HEIGHT;

/** 默认按钮矩形（设计像素，左上角附近，基准 1920×1080） */
const DEFAULT_RECT: UiRect = { x: 24, y: 24, w: 120, h: 48 };

/** 默认按钮盒模型样式 */
const DEFAULT_BOX_STYLE: UiBoxStyle = {
  background: "rgba(0,0,0,0.55)",
  borderColor: "rgba(255,255,255,0.35)",
  borderWidth: 1,
  borderRadius: 8,
};

/** 默认按钮文本样式 */
const DEFAULT_TEXT_STYLE: UiTextStyle = {
  color: "#ffffff",
  fontSize: 16,
  fontWeight: 600,
  label: "返回",
};

/** 默认文案（与 style.label 对齐） */
const DEFAULT_LABEL = "返回";

/**
 * 将返回按钮布局从一套设计分辨率缩放到另一套。
 *
 * @param cfg - 源配置
 * @param fromW - 源设计宽
 * @param fromH - 源设计高
 * @param toW - 目标设计宽
 * @param toH - 目标设计高
 * @returns 新配置
 */
export function scaleSceneReturnButtonConfig(
  cfg: SceneReturnButtonConfig,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): SceneReturnButtonConfig {
  const fw = Math.max(1, fromW);
  const fh = Math.max(1, fromH);
  const tw = Math.max(1, toW);
  const th = Math.max(1, toH);

  if (fw === tw && fh === th) {
    return cfg;
  }

  const sx = tw / fw;
  const sy = th / fh;
  const s = Math.min(sx, sy);
  const rect = cfg.rect;
  const style = { ...cfg.style };

  if (typeof style.borderRadius === "number") {
    style.borderRadius = Math.max(0, Math.round(style.borderRadius * s));
  }

  if (typeof style.borderWidth === "number") {
    style.borderWidth = Math.max(0, Math.round(style.borderWidth * s));
  }

  if (typeof style.fontSize === "number") {
    style.fontSize = Math.max(1, Math.round(style.fontSize * s));
  }

  return {
    ...cfg,
    rect: {
      x: Math.round(rect.x * sx),
      y: Math.round(rect.y * sy),
      w:
        typeof rect.w === "number"
          ? Math.max(1, Math.round(rect.w * sx))
          : rect.w,
      h:
        typeof rect.h === "number"
          ? Math.max(1, Math.round(rect.h * sy))
          : rect.h,
    },
    style,
  };
}

/**
 * 返回场景返回按钮的完整默认配置（基准 1920×1080；其它设计尺寸等比缩放）。
 *
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
 * @returns 启用状态、默认矩形与可读底/边/字色
 *
 * @example
 * ```ts
 * const cfg = defaultSceneReturnButtonConfig();
 * // cfg.enabled === true, cfg.label === "返回"
 * ```
 */
export function defaultSceneReturnButtonConfig(
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): SceneReturnButtonConfig {
  const base: SceneReturnButtonConfig = {
    enabled: true,
    rect: { ...DEFAULT_RECT },
    label: DEFAULT_LABEL,
    style: {
      ...DEFAULT_BOX_STYLE,
      ...DEFAULT_TEXT_STYLE,
    },
  };

  if (refW === DEFAULT_REF_W && refH === DEFAULT_REF_H) {
    return base;
  }

  return scaleSceneReturnButtonConfig(
    base,
    DEFAULT_REF_W,
    DEFAULT_REF_H,
    refW,
    refH,
  );
}

/**
 * 规范化可选的非空字符串字段（非法则 undefined）。
 *
 * @param value - 原始值
 * @returns trim 后的非空串，或 undefined
 */
function normalizeOptionalNonEmptyString(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed !== "" ? trimmed : undefined;
}

/**
 * 规范化 Partial 悬停样式（相对默认 style 合并盒/字字段）。
 *
 * @param raw - 原始 hoverStyle
 * @param fallbackStyle - 常态 style，作字段回退
 * @returns 规范化后的 Partial，无有效字段时 undefined
 */
function normalizeHoverStyle(
  raw: unknown,
  fallbackStyle: UiBoxStyle & UiTextStyle,
): Partial<UiBoxStyle & UiTextStyle> | undefined {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return undefined;
  }

  const obj = raw as Record<string, unknown>;
  const box = normalizeUiBoxStyle(
    obj as Partial<UiBoxStyle>,
    fallbackStyle,
  );
  const text = normalizeUiTextStyle(
    obj as Partial<UiTextStyle>,
    fallbackStyle,
  );

  const result: Partial<UiBoxStyle & UiTextStyle> = {
    ...box,
    ...text,
  };

  const hasOwn = Object.keys(result).length > 0;

  return hasOwn ? result : undefined;
}

/**
 * 将任意输入规范化为 `SceneReturnButtonConfig`。
 *
 * - 非对象 / null / undefined → 完整默认
 * - `enabled` 非 boolean → 默认 true
 * - `rect` 经 `normalizeUiRect`，保证有限 x/y 与正 w/h
 * - `label` 字符串（可空）；缺省字段时用默认「返回」
 * - `style` 合并默认盒/字样式
 * - `imageSrc` / `hoverImageSrc` 非空字符串才保留
 * - `hoverStyle` 相对默认 style 规范化 Partial
 *
 * @param raw - 原始 JSON 解析结果或部分字段
 * @returns 规范化后的返回按钮配置
 *
 * @example
 * ```ts
 * normalizeSceneReturnButtonConfig(null); // defaultSceneReturnButtonConfig()
 * normalizeSceneReturnButtonConfig({ label: "  " }).label; // ""
 * ```
 */
export function normalizeSceneReturnButtonConfig(
  raw: unknown,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): SceneReturnButtonConfig {
  const defaults = defaultSceneReturnButtonConfig(refW, refH);

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaultSceneReturnButtonConfig(refW, refH);
  }

  const obj = raw as Record<string, unknown>;

  const enabled =
    typeof obj.enabled === "boolean" ? obj.enabled : defaults.enabled;

  const rect = normalizeUiRect(
    obj.rect as Partial<UiRect> | undefined,
    defaults.rect,
  );

  // 允许空文案（纯图标 / 纯皮肤）；仅缺省字段时用默认「返回」
  const label =
    typeof obj.label === "string" ? obj.label.trim() : defaults.label;

  const style: UiBoxStyle & UiTextStyle = {
    ...normalizeUiBoxStyle(
      obj.style as Partial<UiBoxStyle> | undefined,
      defaults.style,
    ),
    ...normalizeUiTextStyle(
      obj.style as Partial<UiTextStyle> | undefined,
      { ...defaults.style, label: label },
    ),
  };

  const imageSrc = normalizeOptionalNonEmptyString(obj.imageSrc);
  const hoverImageSrc = normalizeOptionalNonEmptyString(obj.hoverImageSrc);
  const pressedImageSrc = normalizeOptionalNonEmptyString(obj.pressedImageSrc);
  const hoverStyle = normalizeHoverStyle(obj.hoverStyle, style);

  const result: SceneReturnButtonConfig = {
    enabled,
    rect,
    label,
    style,
  };

  if (imageSrc !== undefined) {
    result.imageSrc = imageSrc;
  }

  if (hoverStyle !== undefined) {
    result.hoverStyle = hoverStyle;
  }

  if (hoverImageSrc !== undefined) {
    result.hoverImageSrc = hoverImageSrc;
  }

  if (pressedImageSrc !== undefined) {
    result.pressedImageSrc = pressedImageSrc;
  }

  return result;
}

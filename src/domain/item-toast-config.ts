/**
 * item-toast-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 获得物品 Toast 的默认值、JSON 规范化、动作级覆盖合并与锚点几何计算。
 */

import {
  DEFAULT_DESIGN_HEIGHT,
  DEFAULT_DESIGN_WIDTH,
} from "./design-resolution";
import type {
  ItemToastConfig,
  ToastPlacement,
  UiBoxStyle,
  UiTextStyle,
} from "./types";
import { normalizeUiBoxStyle, normalizeUiTextStyle } from "./ui-style";

/** 默认布局参照宽 */
const DEFAULT_REF_W = DEFAULT_DESIGN_WIDTH;

/** 默认布局参照高 */
const DEFAULT_REF_H = DEFAULT_DESIGN_HEIGHT;

/** 合法的 Toast 方位枚举，用于 normalize / resolve 校验 */
const PLACEMENTS: ToastPlacement[] = [
  "above",
  "below",
  "left",
  "right",
  "center",
];

/**
 * 动作级 Toast 覆盖（可选字段；未提供则沿用全局配置）。
 */
export interface ItemToastOverrides {
  placement?: ToastPlacement;
  offsetX?: number;
  offsetY?: number;
  gap?: number;
  style?: Partial<UiBoxStyle & UiTextStyle>;
  /** 透传到 ToastRequest；不参与外观 merge */
  screenCenter?: boolean;
}

/**
 * 合并全局配置与动作覆盖后的最终 Toast 外观（运行时渲染用）。
 */
export interface ResolvedItemToastAppearance {
  placement: ToastPlacement;
  offsetX: number;
  offsetY: number;
  gap: number;
  style: UiBoxStyle & UiTextStyle;
}

/**
 * 将 Toast 尺寸字段从一套设计分辨率缩放到另一套。
 *
 * @param cfg - 源配置
 * @param fromW - 源设计宽
 * @param fromH - 源设计高
 * @param toW - 目标设计宽
 * @param toH - 目标设计高
 * @returns 新配置
 */
export function scaleItemToastConfig(
  cfg: ItemToastConfig,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): ItemToastConfig {
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
  const style = { ...cfg.style };

  if (typeof style.borderRadius === "number") {
    style.borderRadius = Math.max(0, Math.round(style.borderRadius * s));
  }

  if (typeof style.fontSize === "number") {
    style.fontSize = Math.max(1, Math.round(style.fontSize * s));
  }

  return {
    ...cfg,
    offsetX: Math.round(cfg.offsetX * sx),
    offsetY: Math.round(cfg.offsetY * sy),
    gap: Math.max(0, Math.round(cfg.gap * s)),
    style,
  };
}

/**
 * 返回获得物品 Toast 的默认配置（对齐旧版 HUD 观感；其它设计尺寸等比缩放）。
 *
 * @param refW - 参考设计宽
 * @param refH - 参考设计高
 * @returns 默认 `ItemToastConfig`（version 1，placement above，gap 48@1920）
 *
 * @example
 * ```ts
 * const cfg = defaultItemToastConfig();
 * // cfg.placement === "above", cfg.gap === 48
 * ```
 */
export function defaultItemToastConfig(
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): ItemToastConfig {
  const base: ItemToastConfig = {
    version: 1,
    placement: "above",
    offsetX: 0,
    offsetY: 0,
    gap: 48,
    style: {
      background: "rgba(10, 14, 12, 0.88)",
      borderRadius: 8,
      shadow: 1,
      color: "#F5F7F6",
      fontSize: 30,
      fontWeight: 600,
    },
  };

  if (refW === DEFAULT_REF_W && refH === DEFAULT_REF_H) {
    return base;
  }

  return scaleItemToastConfig(base, DEFAULT_REF_W, DEFAULT_REF_H, refW, refH);
}

/**
 * 将任意输入规范化为 `ItemToastConfig`。
 *
 * - 非对象 / null / undefined → 完整默认配置
 * - `placement` 非法 → 默认 `"above"`
 * - `offsetX` / `offsetY` 须为有限数，否则回退默认
 * - `gap` 须为有限且 >= 0，否则回退默认
 * - `style` 经 `normalizeUiBoxStyle` / `normalizeUiTextStyle` 相对默认 style 合并
 *
 * @param raw - 原始 JSON 解析结果或部分字段
 * @param refW - 参考设计宽（影响缺省字段）
 * @param refH - 参考设计高
 * @returns 规范化后的配置（version 恒为 1）
 *
 * @example
 * ```ts
 * normalizeItemToastConfig({ placement: "nope" }).placement; // "above"
 * normalizeItemToastConfig(null); // 等同 defaultItemToastConfig()
 * ```
 */
export function normalizeItemToastConfig(
  raw: unknown,
  refW: number = DEFAULT_REF_W,
  refH: number = DEFAULT_REF_H,
): ItemToastConfig {
  const defaults = defaultItemToastConfig(refW, refH);

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return defaultItemToastConfig(refW, refH);
  }

  const obj = raw as Record<string, unknown>;

  const placement =
    typeof obj.placement === "string" &&
    PLACEMENTS.includes(obj.placement as ToastPlacement)
      ? (obj.placement as ToastPlacement)
      : defaults.placement;

  const offsetX =
    typeof obj.offsetX === "number" && Number.isFinite(obj.offsetX)
      ? obj.offsetX
      : defaults.offsetX;

  const offsetY =
    typeof obj.offsetY === "number" && Number.isFinite(obj.offsetY)
      ? obj.offsetY
      : defaults.offsetY;

  const gap =
    typeof obj.gap === "number" && Number.isFinite(obj.gap) && obj.gap >= 0
      ? obj.gap
      : defaults.gap;

  const styleRaw =
    obj.style !== null && typeof obj.style === "object"
      ? (obj.style as Partial<UiBoxStyle & UiTextStyle>)
      : undefined;

  const style = {
    ...normalizeUiBoxStyle(styleRaw, defaults.style),
    ...normalizeUiTextStyle(styleRaw, defaults.style),
  };

  return {
    version: 1,
    placement,
    offsetX,
    offsetY,
    gap,
    style,
  };
}

/**
 * 解析 HUD 设置中的 Toast JSON 字符串。
 *
 * - `undefined` / `null` / 空串 → 默认配置
 * - 非法 JSON → 默认配置
 * - 合法 JSON → 经 `normalizeItemToastConfig` 规范化
 *
 * @param json - 设置项中的 JSON 字符串
 * @returns 规范化后的 `ItemToastConfig`
 *
 * @example
 * ```ts
 * parseItemToastJson(""); // defaultItemToastConfig()
 * parseItemToastJson('{"placement":"below"}').placement; // "below"
 * ```
 */
export function parseItemToastJson(
  json: string | undefined | null,
  refW?: number,
  refH?: number,
): ItemToastConfig {
  const dw = refW ?? DEFAULT_REF_W;
  const dh = refH ?? DEFAULT_REF_H;

  if (json === undefined || json === null || json.trim() === "") {
    return defaultItemToastConfig(dw, dh);
  }

  try {
    return normalizeItemToastConfig(JSON.parse(json), dw, dh);
  } catch {
    return defaultItemToastConfig(dw, dh);
  }
}

/**
 * 将配置序列化为 JSON 字符串（写入前会先 normalize）。
 *
 * @param config - 待序列化的配置（可为部分字段）
 * @returns `JSON.stringify(normalizeItemToastConfig(config))` 的结果
 *
 * @example
 * ```ts
 * stringifyItemToast(defaultItemToastConfig());
 * // '{"version":1,"placement":"above",...}'
 * ```
 */
export function stringifyItemToast(config: ItemToastConfig): string {
  return JSON.stringify(normalizeItemToastConfig(config));
}

/**
 * 合并全局 Toast 配置与动作级覆盖，得到运行时最终外观。
 *
 * - 覆盖字段缺失或非法时沿用 `global` 对应值
 * - `style` 部分覆盖时与全局 style 深合并（经 normalizeUi*）
 *
 * @param global - 全局 `ItemToastConfig`（来自 HUD 设置）
 * @param overrides - 动作级可选覆盖；`null` / `undefined` 视为无覆盖
 * @returns 解析后的 `ResolvedItemToastAppearance`
 *
 * @example
 * ```ts
 * const g = defaultItemToastConfig();
 * resolveItemToastAppearance(g, { placement: "below" }).placement; // "below"
 * resolveItemToastAppearance(g, null); // 与 global 各字段相同
 * ```
 */
export function resolveItemToastAppearance(
  global: ItemToastConfig,
  overrides?: ItemToastOverrides | null,
): ResolvedItemToastAppearance {
  const o = overrides ?? {};
  const baseStyle = global.style;
  const mergedStyle =
    o.style !== undefined
      ? {
          ...normalizeUiBoxStyle(o.style, baseStyle),
          ...normalizeUiTextStyle(o.style, baseStyle),
        }
      : baseStyle;

  return {
    placement:
      o.placement !== undefined && PLACEMENTS.includes(o.placement)
        ? o.placement
        : global.placement,
    offsetX:
      typeof o.offsetX === "number" && Number.isFinite(o.offsetX)
        ? o.offsetX
        : global.offsetX,
    offsetY:
      typeof o.offsetY === "number" && Number.isFinite(o.offsetY)
        ? o.offsetY
        : global.offsetY,
    gap:
      typeof o.gap === "number" && Number.isFinite(o.gap) && o.gap >= 0
        ? o.gap
        : global.gap,
    style: mergedStyle,
  };
}

/**
 * 根据热区锚点与设计像素坐标，计算 Toast 容器的 `left` / `top` / `transform`。
 *
 * - `above` / `below` / `left` / `right`：沿对应方向偏移 `gap` 像素
 * - `center`：不应用 gap，仅使用 `offsetX` / `offsetY`
 * - 水平居中类 placement 使用 `translate(-50%, …)` 对齐锚点
 *
 * @param anchor - 热区锚点 `{ x, y }`（设计像素）
 * @param appearance - 已解析的方位、偏移与间距（不含 style）
 * @returns React/CSS 绝对定位用的 `{ left, top, transform }`
 *
 * @example
 * ```ts
 * computeToastAnchorStyle(
 *   { x: 100, y: 200 },
 *   { placement: "above", gap: 48, offsetX: 0, offsetY: 0 },
 * );
 * // { left: 100, top: 152, transform: "translate(-50%, -100%)" }
 * ```
 */
export function computeToastAnchorStyle(
  anchor: { x: number; y: number },
  appearance: Pick<
    ResolvedItemToastAppearance,
    "placement" | "offsetX" | "offsetY" | "gap"
  >,
): { left: number; top: number; transform: string } {
  const { placement, offsetX, offsetY, gap } = appearance;
  const g = placement === "center" ? 0 : gap;

  switch (placement) {
    case "above":
      return {
        left: anchor.x + offsetX,
        top: anchor.y - g + offsetY,
        transform: "translate(-50%, -100%)",
      };
    case "below":
      return {
        left: anchor.x + offsetX,
        top: anchor.y + g + offsetY,
        transform: "translate(-50%, 0)",
      };
    case "left":
      return {
        left: anchor.x - g + offsetX,
        top: anchor.y + offsetY,
        transform: "translate(-100%, -50%)",
      };
    case "right":
      return {
        left: anchor.x + g + offsetX,
        top: anchor.y + offsetY,
        transform: "translate(0, -50%)",
      };
    case "center":
      return {
        left: anchor.x + offsetX,
        top: anchor.y + offsetY,
        transform: "translate(-50%, -50%)",
      };
  }
}

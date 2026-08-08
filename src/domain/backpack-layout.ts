/**
 * backpack-layout.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 将 BackpackScreenConfig（v2 nodes）解析为编辑器画布与运行时共用的绝对布局。
 */

import { defaultBackpackScreen } from "./backpack-screen-config";
import type {
  BackpackScreenConfig,
  UiBoxStyle,
  UiRect,
  UiTextStyle,
} from "./types";

/**
 * 解析后的全屏背包布局（设计像素坐标，rect 必含 w/h）。
 */
export interface ResolvedBackpackLayout {
  /** 强调色 */
  accent: string;

  /** 全屏遮罩样式（inset 0） */
  backdrop: { style: UiBoxStyle };

  /** 主面板底板 */
  panelChrome: { rect: Required<UiRect>; style: UiBoxStyle };

  /** 标题区：几何 + 三段文案样式 */
  titleBlock: {
    rect: Required<UiRect>;
    eyebrow: UiTextStyle;
    title: UiTextStyle;
    modeLink: UiTextStyle;
  };

  /** 关闭按钮 */
  closeButton: { rect: Required<UiRect>; style: UiBoxStyle & UiTextStyle };

  /** 物品网格 */
  itemGrid: {
    rect: Required<UiRect>;
    cellMin: number;
    style: UiBoxStyle;
    selectedStyle: UiBoxStyle;
  };

  /** 详情面板 */
  detailPanel: {
    rect: Required<UiRect>;
    heroHeight: number;
    padding: number;
    style: UiBoxStyle;
  };

  /** 合成按钮（相对详情底边偏移） */
  craftButton: { offsetY: number; style: UiBoxStyle & UiTextStyle };
}

/**
 * 将可选尺寸矩形补齐为必含 w/h 的 UiRect。
 *
 * @param rect - 源矩形（w/h 可缺）
 * @param fallback - 缺省/非法 w/h 时的回退矩形（须含正数 w/h）
 * @returns 必含 x/y/w/h 的矩形副本
 */
function requireRect(rect: UiRect, fallback: Required<UiRect>): Required<UiRect> {
  const w =
    typeof rect.w === "number" && Number.isFinite(rect.w) && rect.w > 0
      ? rect.w
      : fallback.w;
  const h =
    typeof rect.h === "number" && Number.isFinite(rect.h) && rect.h > 0
      ? rect.h
      : fallback.h;

  return {
    x: typeof rect.x === "number" && Number.isFinite(rect.x) ? rect.x : fallback.x,
    y: typeof rect.y === "number" && Number.isFinite(rect.y) ? rect.y : fallback.y,
    w,
    h,
  };
}

/**
 * 浅拷贝盒样式。
 *
 * @param style - 源样式
 * @returns 独立副本
 */
function cloneBox(style: UiBoxStyle): UiBoxStyle {
  return { ...style };
}

/**
 * 浅拷贝文本样式。
 *
 * @param style - 源样式；undefined 时返回空对象
 * @returns 独立副本
 */
function cloneText(style: UiTextStyle | undefined): UiTextStyle {
  return style !== undefined ? { ...style } : {};
}

/**
 * 浅拷贝盒 + 文本交叉样式。
 *
 * @param style - 源样式
 * @returns 独立副本
 */
function cloneBoxAndText(style: UiBoxStyle & UiTextStyle): UiBoxStyle & UiTextStyle {
  return { ...style };
}

/**
 * 将 BackpackScreenConfig 解析为共享绝对布局。
 *
 * 缺省节点尺寸回退 `defaultBackpackScreen()` 对应节点；
 * `selectedStyle` / 文案样式 / `craftButton.offsetY` 缺省亦回退默认。
 *
 * @param cfg - v2 背包屏配置
 * @returns ResolvedBackpackLayout
 *
 * @example
 * ```ts
 * const layout = resolveBackpackLayout(defaultBackpackScreen());
 * // layout.panelChrome.rect.w > 0
 * // layout.itemGrid.cellMin === 104（默认）
 * ```
 *
 * @throws 无
 */
export function resolveBackpackLayout(
  cfg: BackpackScreenConfig,
): ResolvedBackpackLayout {
  const defaults = defaultBackpackScreen();
  const d = defaults.nodes;

  const panelFallback: Required<UiRect> = {
    x: d.panelChrome.rect.x,
    y: d.panelChrome.rect.y,
    w: d.panelChrome.rect.w ?? 1,
    h: d.panelChrome.rect.h ?? 1,
  };
  const titleFallback: Required<UiRect> = {
    x: d.titleBlock.rect.x,
    y: d.titleBlock.rect.y,
    w: d.titleBlock.rect.w ?? 1,
    h: d.titleBlock.rect.h ?? 1,
  };
  const closeFallback: Required<UiRect> = {
    x: d.closeButton.rect.x,
    y: d.closeButton.rect.y,
    w: d.closeButton.rect.w ?? 44,
    h: d.closeButton.rect.h ?? 44,
  };
  const gridFallback: Required<UiRect> = {
    x: d.itemGrid.rect.x,
    y: d.itemGrid.rect.y,
    w: d.itemGrid.rect.w ?? 1,
    h: d.itemGrid.rect.h ?? 1,
  };
  const detailFallback: Required<UiRect> = {
    x: d.detailPanel.rect.x,
    y: d.detailPanel.rect.y,
    w: d.detailPanel.rect.w ?? 1,
    h: d.detailPanel.rect.h ?? 1,
  };

  return {
    accent: cfg.accent,
    backdrop: {
      style: cloneBox(cfg.nodes.backdrop.style),
    },
    panelChrome: {
      rect: requireRect(cfg.nodes.panelChrome.rect, panelFallback),
      style: cloneBox(cfg.nodes.panelChrome.style),
    },
    titleBlock: {
      rect: requireRect(cfg.nodes.titleBlock.rect, titleFallback),
      eyebrow: cloneText(cfg.nodes.titleBlock.eyebrow ?? d.titleBlock.eyebrow),
      title: cloneText(cfg.nodes.titleBlock.title ?? d.titleBlock.title),
      modeLink: cloneText(cfg.nodes.titleBlock.modeLink ?? d.titleBlock.modeLink),
    },
    closeButton: {
      rect: requireRect(cfg.nodes.closeButton.rect, closeFallback),
      style: cloneBoxAndText(cfg.nodes.closeButton.style),
    },
    itemGrid: {
      rect: requireRect(cfg.nodes.itemGrid.rect, gridFallback),
      cellMin: cfg.nodes.itemGrid.cellMin,
      style: cloneBox(cfg.nodes.itemGrid.style),
      selectedStyle: cloneBox(
        cfg.nodes.itemGrid.selectedStyle ?? d.itemGrid.selectedStyle ?? {},
      ),
    },
    detailPanel: {
      rect: requireRect(cfg.nodes.detailPanel.rect, detailFallback),
      heroHeight: cfg.nodes.detailPanel.heroHeight,
      padding: cfg.nodes.detailPanel.padding,
      style: cloneBox(cfg.nodes.detailPanel.style),
    },
    craftButton: {
      offsetY: cfg.nodes.craftButton.offsetY ?? d.craftButton.offsetY ?? 0,
      style: cloneBoxAndText(cfg.nodes.craftButton.style),
    },
  };
}

/**
 * hud-layout.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 将 InventoryHudConfig（v2 nodes）解析为编辑器画布与运行时共用的槽位 / 按钮几何。
 * 含 HUD 轴对齐包围盒，供紧凑 ui.show 宿主使用。
 */

import { QUICKBAR_SLOTS } from "./inventory";
import type {
  InventoryHudConfig,
  UiBoxStyle,
  UiButtonSkin,
  UiTextStyle,
} from "./types";
import { cloneUiButtonSkin } from "./ui-button-skin";

/**
 * 解析后的快捷栏 HUD 布局（舞台 / 设计像素坐标）。
 */
export interface ResolvedHudLayout {
  /** 快捷栏根：原点、排布方向、槽尺寸与间距 */
  root: {
    x: number;
    y: number;
    direction: "column" | "row";
    slotSize: number;
    gap: number;
  };

  /** 8 个槽位矩形（舞台坐标） */
  slots: Array<{ x: number; y: number; w: number; h: number }>;

  /** 「打开背包」按钮矩形（舞台坐标） */
  openBagButton: { x: number; y: number; w: number; h: number };

  /** 强调色 */
  accent: string;

  /** 槽位盒样式 */
  slotStyle: UiBoxStyle;

  /** 数量角标样式 */
  badgeStyle: UiBoxStyle & UiTextStyle;

  /** 打开背包按钮样式 */
  openBagStyle: UiBoxStyle & UiTextStyle;

  /** 打开背包按钮图片三态 */
  openBagSkin: UiButtonSkin;

  /** 自定义 CSS 原文 */
  customCss: string;
}

/**
 * 槽位矩形描述。
 */
interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 根据 fontSize 计算按钮主轴外的次尺寸（至少 32）。
 *
 * @param fontSize - 文本字号；非法时按 12
 * @returns max(32, fontSize + 16)
 */
function buttonSecondarySize(fontSize: number | undefined): number {
  const size =
    typeof fontSize === "number" && Number.isFinite(fontSize) ? fontSize : 12;

  return Math.max(32, size + 16);
}

/**
 * 计算 8 个快捷栏槽位的舞台矩形。
 *
 * @param rootX - 根原点 x
 * @param rootY - 根原点 y
 * @param direction - 排布方向
 * @param slotSize - 槽边长
 * @param gap - 槽间距
 * @returns 长度固定为 QUICKBAR_SLOTS 的矩形数组
 */
function resolveSlots(
  rootX: number,
  rootY: number,
  direction: "column" | "row",
  slotSize: number,
  gap: number,
): SlotRect[] {
  const slots: SlotRect[] = [];
  const step = slotSize + gap;

  for (let i = 0; i < QUICKBAR_SLOTS; i += 1) {
    if (direction === "row") {
      slots.push({
        x: rootX + i * step,
        y: rootY,
        w: slotSize,
        h: slotSize,
      });
    } else {
      slots.push({
        x: rootX,
        y: rootY + i * step,
        w: slotSize,
        h: slotSize,
      });
    }
  }

  return slots;
}

/**
 * 解析 belowRoot 模式下打开背包按钮矩形。
 *
 * - column：`y = root.y + 8*(slot+gap) + 4`，`x = root.x`，`w = slotSize`，`h = max(32, fontSize+16)`
 * - row：对称，`x = root.x + 8*(slot+gap) + 4`，`y = root.y`，`h = slotSize`，`w = max(32, fontSize+16)`
 *
 * @param rootX - 根原点 x
 * @param rootY - 根原点 y
 * @param direction - 快捷栏方向
 * @param slotSize - 槽边长
 * @param gap - 槽间距
 * @param fontSize - 按钮字号
 * @returns 按钮矩形
 */
function resolveBelowRootButton(
  rootX: number,
  rootY: number,
  direction: "column" | "row",
  slotSize: number,
  gap: number,
  fontSize: number | undefined,
  sizeOverride?: { w?: number; h?: number },
): SlotRect {
  const secondary = buttonSecondarySize(fontSize);
  const afterSlots = QUICKBAR_SLOTS * (slotSize + gap) + 4;
  const overrideW =
    sizeOverride !== undefined &&
    typeof sizeOverride.w === "number" &&
    Number.isFinite(sizeOverride.w) &&
    sizeOverride.w > 0
      ? sizeOverride.w
      : undefined;
  const overrideH =
    sizeOverride !== undefined &&
    typeof sizeOverride.h === "number" &&
    Number.isFinite(sizeOverride.h) &&
    sizeOverride.h > 0
      ? sizeOverride.h
      : undefined;

  if (direction === "row") {
    return {
      x: rootX + afterSlots,
      y: rootY,
      w: overrideW ?? secondary,
      h: overrideH ?? slotSize,
    };
  }

  return {
    x: rootX,
    y: rootY + afterSlots,
    w: overrideW ?? slotSize,
    h: overrideH ?? secondary,
  };
}

/**
 * 解析 absolute 模式下打开背包按钮矩形；缺省 w/h 回退到 belowRoot 尺寸约定。
 *
 * @param rect - 配置中的 rect（可缺 w/h）
 * @param slotSize - 槽边长（用作默认宽）
 * @param fontSize - 按钮字号（用于默认高）
 * @returns 按钮矩形
 */
function resolveAbsoluteButton(
  rect: { x: number; y: number; w?: number; h?: number } | undefined,
  slotSize: number,
  fontSize: number | undefined,
): SlotRect {
  const fallbackH = buttonSecondarySize(fontSize);
  const x =
    rect !== undefined && typeof rect.x === "number" && Number.isFinite(rect.x)
      ? rect.x
      : 0;
  const y =
    rect !== undefined && typeof rect.y === "number" && Number.isFinite(rect.y)
      ? rect.y
      : 0;
  const w =
    rect !== undefined &&
    typeof rect.w === "number" &&
    Number.isFinite(rect.w) &&
    rect.w > 0
      ? rect.w
      : slotSize;
  const h =
    rect !== undefined &&
    typeof rect.h === "number" &&
    Number.isFinite(rect.h) &&
    rect.h > 0
      ? rect.h
      : fallbackH;

  return { x, y, w, h };
}

/**
 * 将 InventoryHudConfig 解析为共享布局（8 槽 + 打开背包按钮）。
 *
 * @param cfg - v2 HUD 配置
 * @returns ResolvedHudLayout
 *
 * @example
 * ```ts
 * const layout = resolveHudLayout(defaultInventoryHud());
 * // layout.slots.length === 8
 * // layout.openBagButton.y >= layout.slots[7].y + layout.slots[7].h
 * ```
 *
 * @throws 无（非法数值在调用方 normalize 后应已钳制；此处按有限数使用）
 */
export function resolveHudLayout(cfg: InventoryHudConfig): ResolvedHudLayout {
  const rootNode = cfg.nodes.quickbarRoot;
  const buttonNode = cfg.nodes.openBagButton;
  const rootX = rootNode.rect.x;
  const rootY = rootNode.rect.y;
  const direction = rootNode.direction;
  const slotSize = rootNode.slotSize;
  const gap = rootNode.gap;
  const slots = resolveSlots(rootX, rootY, direction, slotSize, gap);

  const openBagButton =
    buttonNode.layout === "absolute"
      ? resolveAbsoluteButton(buttonNode.rect, slotSize, buttonNode.style.fontSize)
      : resolveBelowRootButton(
          rootX,
          rootY,
          direction,
          slotSize,
          gap,
          buttonNode.style.fontSize,
          buttonNode.rect,
        );

  return {
    root: {
      x: rootX,
      y: rootY,
      direction,
      slotSize,
      gap,
    },
    slots,
    openBagButton,
    accent: cfg.accent,
    slotStyle: { ...rootNode.slotStyle },
    badgeStyle: { ...rootNode.badgeStyle },
    openBagStyle: { ...buttonNode.style },
    openBagSkin: cloneUiButtonSkin(buttonNode),
    customCss: cfg.customCss,
  };
}

/**
 * 计算快捷栏 HUD（全部槽位 + 打开背包按钮）的轴对齐包围盒。
 *
 * @param layout - {@link resolveHudLayout} 结果
 * @param padding - 外扩像素，默认 8，避免贴边裁切阴影
 * @param openBagRect - 可选：chrome overlay 按钮矩形（优先于 layout.openBagButton）
 * @returns 设计坐标下的 `{ x, y, w, h }`
 *
 * @example
 * ```ts
 * const b = computeHudAxisAlignedBounds(resolveHudLayout(cfg));
 * // b 可用于 ui.show 的 position/size（再换算为 %）
 * ```
 */
export function computeHudAxisAlignedBounds(
  layout: ResolvedHudLayout,
  padding = 8,
  openBagRect?: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  /**
   * @param r - 矩形
   */
  const include = (r: { x: number; y: number; w: number; h: number }): void => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  };

  for (const slot of layout.slots) {
    include(slot);
  }

  include(openBagRect ?? layout.openBagButton);

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0, w: 64, h: 64 };
  }

  const pad = Math.max(0, padding);
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const w = Math.max(1, maxX - minX + pad * 2);
  const h = Math.max(1, maxY - minY + pad * 2);

  return { x, y, w, h };
}

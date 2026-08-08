/**
 * backpack-screen-config.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.8
 *
 * 全屏背包布局默认值与规范化（供编辑器可视化编辑 / 运行时读取）。
 */

import type { BackpackScreenConfig } from "./types";

const DEFAULT_PAGE_PADDING_X = 48;
const DEFAULT_PAGE_PADDING_Y = 40;
const DEFAULT_DETAIL_RATIO = 0.36;
const DEFAULT_GRID_CELL_MIN = 104;
const DEFAULT_HERO_HEIGHT = 280;
const DEFAULT_ACCENT = "#64e0d0";

/**
 * @param value - 原始数
 * @param fallback - 回退
 * @param min - 下限
 * @param max - 上限
 * @returns 钳制后的有限数
 */
function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

/**
 * 返回全屏背包默认布局。
 *
 * @returns BackpackScreenConfig
 *
 * @example
 * ```ts
 * const cfg = defaultBackpackScreen();
 * ```
 */
export function defaultBackpackScreen(): BackpackScreenConfig {
  return {
    pagePaddingX: DEFAULT_PAGE_PADDING_X,
    pagePaddingY: DEFAULT_PAGE_PADDING_Y,
    detailRatio: DEFAULT_DETAIL_RATIO,
    gridCellMin: DEFAULT_GRID_CELL_MIN,
    heroHeight: DEFAULT_HERO_HEIGHT,
    accent: DEFAULT_ACCENT,
  };
}

/**
 * 规范化任意输入为 BackpackScreenConfig。
 *
 * @param raw - JSON 对象或未知
 * @returns 规范化配置
 */
export function normalizeBackpackScreen(raw: unknown): BackpackScreenConfig {
  const defaults = defaultBackpackScreen();

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;
  const accent =
    typeof obj.accent === "string" && obj.accent.trim().length > 0
      ? obj.accent.trim()
      : defaults.accent;

  return {
    pagePaddingX: clampNumber(obj.pagePaddingX, defaults.pagePaddingX, 8, 160),
    pagePaddingY: clampNumber(obj.pagePaddingY, defaults.pagePaddingY, 8, 120),
    detailRatio: clampNumber(obj.detailRatio, defaults.detailRatio, 0.25, 0.5),
    gridCellMin: clampNumber(obj.gridCellMin, defaults.gridCellMin, 64, 180),
    heroHeight: clampNumber(obj.heroHeight, defaults.heroHeight, 120, 420),
    accent,
  };
}

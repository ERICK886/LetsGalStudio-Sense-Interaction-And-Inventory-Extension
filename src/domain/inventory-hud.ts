/**
 * inventory-hud.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 物品栏 HUD 外观默认值与 JSON 规范化。
 */
import type { InventoryHudConfig } from "./types";

/** 快捷栏左边距默认值（设计像素） */
const DEFAULT_LEFT = 24;

/** 快捷栏顶边距默认值（设计像素） */
const DEFAULT_TOP = 120;

/** 槽位尺寸默认值（设计像素） */
const DEFAULT_SLOT_SIZE = 64;

/** 槽位间距默认值（设计像素） */
const DEFAULT_GAP = 8;

/** 打开背包按钮默认文案 */
const DEFAULT_OPEN_BAG_LABEL = "打开背包";

/**
 * 将数值钳制为非负有限数，非法时回退 defaultValue。
 *
 * @param value - 原始输入
 * @param defaultValue - 非法时的默认值
 * @returns 非负有限数
 */
function clampNonNegativeNumber(value: unknown, defaultValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.max(0, value);
}

/**
 * 返回 v0.1 约定的物品栏 HUD 默认配置。
 *
 * @returns 默认 InventoryHudConfig
 *
 * @example
 * const hud = defaultInventoryHud();
 * // { left: 24, top: 120, slotSize: 64, gap: 8, openBagLabel: "打开背包", customCss: "" }
 */
export function defaultInventoryHud(): InventoryHudConfig {
  return {
    left: DEFAULT_LEFT,
    top: DEFAULT_TOP,
    slotSize: DEFAULT_SLOT_SIZE,
    gap: DEFAULT_GAP,
    openBagLabel: DEFAULT_OPEN_BAG_LABEL,
    customCss: "",
  };
}

/**
 * 将任意 JSON 输入规范化为 InventoryHudConfig。
 *
 * @param raw - 原始对象或 undefined
 * @returns 规范化后的 HUD 配置；非法字段回退 defaultInventoryHud 对应项
 *
 * @example
 * normalizeInventoryHud({ left: -10, openBagLabel: 123 });
 * // left 回退 24，openBagLabel 回退 "打开背包"
 */
export function normalizeInventoryHud(raw: unknown): InventoryHudConfig {
  const defaults = defaultInventoryHud();

  if (raw === null || raw === undefined || typeof raw !== "object") {
    return { ...defaults };
  }

  const obj = raw as Record<string, unknown>;

  return {
    left: clampNonNegativeNumber(obj.left, defaults.left),
    top: clampNonNegativeNumber(obj.top, defaults.top),
    slotSize: clampNonNegativeNumber(obj.slotSize, defaults.slotSize),
    gap: clampNonNegativeNumber(obj.gap, defaults.gap),
    openBagLabel:
      typeof obj.openBagLabel === "string"
        ? obj.openBagLabel
        : defaults.openBagLabel,
    customCss:
      typeof obj.customCss === "string" ? obj.customCss : defaults.customCss,
  };
}

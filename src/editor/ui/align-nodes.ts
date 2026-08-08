/**
 * align-nodes.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 多选节点显式对齐：左/右/顶/底/水平居中/垂直居中（纯函数，设计像素）。
 */

import type { UiRect } from "../../domain/types";

/** 对齐模式 */
export type AlignMode =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "centerX"
  | "centerY";

/**
 * 带稳定 id 的矩形条目（对齐入参）。
 */
export interface AlignableRect {
  /** 节点 id */
  id: string;

  /** 设计像素矩形（须含 w/h） */
  rect: Required<UiRect>;
}

/**
 * 对多个矩形做对齐，返回各 id 的新矩形（未参与对齐的 id 不会出现）。
 *
 * 规则：以选中集合的包围盒为基准；
 * - left：各节点左缘 = 包围盒左缘
 * - right：各节点右缘 = 包围盒右缘
 * - top / bottom：同理
 * - centerX：各节点中心 x = 包围盒中心 x
 * - centerY：各节点中心 y = 包围盒中心 y
 *
 * @param items - 至少 2 个可对齐矩形
 * @param mode - 对齐模式
 * @returns id → 新矩形；items 不足 2 个时返回空 Map
 *
 * @example
 * ```ts
 * const next = alignRects(
 *   [
 *     { id: "a", rect: { x: 10, y: 10, w: 40, h: 40 } },
 *     { id: "b", rect: { x: 80, y: 20, w: 40, h: 40 } },
 *   ],
 *   "left",
 * );
 * // next.get("a").x === 10 && next.get("b").x === 10
 * ```
 */
export function alignRects(
  items: readonly AlignableRect[],
  mode: AlignMode,
): Map<string, Required<UiRect>> {
  const result = new Map<string, Required<UiRect>>();

  if (items.length < 2) {
    return result;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    const { x, y, w, h } = item.rect;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const centerX = minX + boxW / 2;
  const centerY = minY + boxH / 2;

  for (const item of items) {
    const { x, y, w, h } = item.rect;
    let nextX = x;
    let nextY = y;

    switch (mode) {
      case "left":
        nextX = minX;
        break;
      case "right":
        nextX = maxX - w;
        break;
      case "top":
        nextY = minY;
        break;
      case "bottom":
        nextY = maxY - h;
        break;
      case "centerX":
        nextX = centerX - w / 2;
        break;
      case "centerY":
        nextY = centerY - h / 2;
        break;
      default: {
        const _exhaustive: never = mode;
        void _exhaustive;
        break;
      }
    }

    result.set(item.id, {
      x: Math.max(0, Math.round(nextX)),
      y: Math.max(0, Math.round(nextY)),
      w,
      h,
    });
  }

  return result;
}

/**
 * 单击替换选中；Shift+单击切换多选。
 *
 * @typeParam T - 节点 id 字面量类型
 * @param current - 当前选中列表
 * @param id - 目标 id
 * @param shiftKey - 是否 Shift
 * @returns 新选中列表
 *
 * @example
 * ```ts
 * toggleOrReplaceSelection(["a"], "b", true); // ["a","b"]
 * toggleOrReplaceSelection(["a","b"], "a", true); // ["b"]
 * toggleOrReplaceSelection(["a","b"], "c", false); // ["c"]
 * ```
 */
export function toggleOrReplaceSelection<T extends string>(
  current: readonly T[],
  id: T,
  shiftKey: boolean,
): T[] {
  if (shiftKey) {
    if (current.includes(id)) {
      return current.filter((x) => x !== id);
    }

    return [...current, id];
  }

  return [id];
}

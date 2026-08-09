/**
 * layer-order.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * UI 编辑器节点侧栏完整叠放顺序（固定节点 + overlays）。
 */

import type { UiOverlayElement } from "./types";
import {
  cloneUiOverlayElement,
  overlaySelectionId,
  parseOverlaySelectionId,
  sortOverlaysByZ,
} from "./ui-overlay";

/**
 * 由固定节点 + 图层构建默认侧栏顺序（上=后、下=前；z 升序）。
 *
 * @param fixedIds - 固定功能节点 id
 * @param overlays - 图层
 * @param preferredOrder - 可选优先顺序（仅重排已存在 id；其余按 naive 追加）
 * @returns selection id 列表
 */
export function buildDefaultLayerOrder(
  fixedIds: readonly string[],
  overlays: readonly UiOverlayElement[] | undefined,
  preferredOrder?: readonly string[],
): string[] {
  const overlayIds = sortOverlaysByZ(overlays ?? []).map((el) =>
    overlaySelectionId(el.id),
  );
  const naive = [...fixedIds, ...overlayIds];

  if (!preferredOrder || preferredOrder.length === 0) {
    return naive;
  }

  const allowed = new Set(naive);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of preferredOrder) {
    if (!allowed.has(id) || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ordered.push(id);
  }

  for (const id of naive) {
    if (!seen.has(id)) {
      ordered.push(id);
    }
  }

  return ordered;
}

/**
 * 规范化 layerOrder：去重、只保留合法 id，并补齐缺失项。
 *
 * @param raw - 原始顺序
 * @param fixedIds - 固定节点
 * @param overlays - 图层
 * @param preferredOrder - 缺省 / 补齐时使用的优先顺序
 * @returns 完整合法顺序
 */
export function normalizeLayerOrder(
  raw: unknown,
  fixedIds: readonly string[],
  overlays: readonly UiOverlayElement[] | undefined,
  preferredOrder?: readonly string[],
): string[] {
  const allowed = new Set<string>([
    ...fixedIds,
    ...(overlays ?? []).map((el) => overlaySelectionId(el.id)),
  ]);
  const fallback = buildDefaultLayerOrder(fixedIds, overlays, preferredOrder);

  if (!Array.isArray(raw)) {
    return fallback;
  }

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const id = item.trim();

    if (!allowed.has(id) || seen.has(id)) {
      continue;
    }

    seen.add(id);
    ordered.push(id);
  }

  for (const id of fallback) {
    if (!seen.has(id)) {
      ordered.push(id);
    }
  }

  return ordered;
}

/**
 * 按侧栏完整顺序重排 overlays，并令 zIndex = 在 layerOrder 中的下标。
 *
 * @param overlays - 当前图层
 * @param layerOrder - 完整顺序（含固定节点 id）
 * @returns 新 overlays
 */
export function syncOverlaysZIndexFromLayerOrder(
  overlays: readonly UiOverlayElement[],
  layerOrder: readonly string[],
): UiOverlayElement[] {
  const indexBySel = new Map(layerOrder.map((id, index) => [id, index]));

  return overlays.map((el) => {
    const sel = overlaySelectionId(el.id);
    const index = indexBySel.get(sel);

    return {
      ...cloneUiOverlayElement(el),
      zIndex: typeof index === "number" ? index : el.zIndex,
    };
  });
}

/**
 * 读取某节点 / 图层在 layerOrder 中的叠放值（下标；越大越靠上）。
 *
 * @param layerOrder - 顺序
 * @param id - 固定节点 id 或 `overlay:<id>`
 * @param fallback - 未找到时
 */
export function layerZIndex(
  layerOrder: readonly string[] | undefined,
  id: string,
  fallback: number,
): number {
  if (!layerOrder || layerOrder.length === 0) {
    return fallback;
  }

  const index = layerOrder.indexOf(id);

  return index >= 0 ? index : fallback;
}

/**
 * 按 layerOrder 排列侧栏条目；未知项追加末尾。
 *
 * @param items - 条目（含 id）
 * @param layerOrder - 顺序
 */
export function sortItemsByLayerOrder<T extends { id: string }>(
  items: readonly T[],
  layerOrder: readonly string[],
): T[] {
  const rank = new Map(layerOrder.map((id, index) => [id, index]));

  return items
    .map((item, index) => ({
      item,
      index,
      rank: rank.has(item.id) ? rank.get(item.id)! : layerOrder.length + index,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.item);
}

/**
 * @param selectionId - 侧栏 id
 * @returns 是否为 overlay 选中 id
 */
export function isOverlayLayerSelectionId(selectionId: string): boolean {
  return parseOverlaySelectionId(selectionId) !== null;
}

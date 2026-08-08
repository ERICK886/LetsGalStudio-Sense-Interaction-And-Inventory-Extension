/**
 * item-registry.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 物品库查找：按 id 在 ItemDefinition 列表中检索定义。
 */
import type { ItemDefinition } from "./types";

/**
 * 在物品列表中按 id 查找定义。
 *
 * @param items - 物品定义数组（通常来自 ItemsLibraryFile.items）
 * @param id - 目标物品 id
 * @returns 匹配的 ItemDefinition；未找到时 undefined
 *
 * @example
 * const potion = findItem(library.items, "potion");
 * if (potion) giveItemToInventory(state, potion, 1, Date.now());
 */
export function findItem(
  items: ItemDefinition[],
  id: string,
): ItemDefinition | undefined {
  return items.find((item) => item.id === id);
}

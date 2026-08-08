/**
 * crafting.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 配方合成纯逻辑：聚合原料需求、判断可否合成、在库存中执行合成。
 */
import {
  consumeItemFromInventory,
  getItemCount,
  giveItemToInventory,
} from "./inventory";
import { findItem } from "./item-registry";
import type {
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
} from "./types";

/** craftRecipeInInventory 的成功/失败联合结果 */
export type CraftRecipeResult =
  | { ok: true; state: InventoryState }
  | { ok: false; reason: string };

/**
 * 将配方原料按 itemId 累加为需求 Map。
 *
 * @param recipe - 配方定义
 * @returns Map<itemId, 总需求数量>；同一 itemId 多行会求和
 *
 * @example
 * // ingredients: herb×2, water×1, herb×1 → herb:3, water:1
 * const needs = aggregateRecipeNeeds(recipe);
 *
 * @throws 无抛出
 */
export function aggregateRecipeNeeds(
  recipe: RecipeDefinition,
): Map<string, number> {
  const needs = new Map<string, number>();

  for (const line of recipe.ingredients) {
    const prev = needs.get(line.itemId) ?? 0;
    needs.set(line.itemId, prev + line.count);
  }

  return needs;
}

/**
 * 判断库存是否满足配方全部原料需求。
 *
 * @param state - 当前库存状态
 * @param recipe - 配方定义
 * @returns 每种需求 itemId 的 getItemCount 均 >= 需求时为 true
 *
 * @example
 * if (canCraftRecipe(state, recipe)) { ... }
 *
 * @throws 无抛出
 */
export function canCraftRecipe(
  state: InventoryState,
  recipe: RecipeDefinition,
): boolean {
  const needs = aggregateRecipeNeeds(recipe);

  for (const [itemId, need] of needs) {
    if (getItemCount(state, itemId) < need) {
      return false;
    }
  }

  return true;
}

/**
 * 在库存中执行一次合成：校验物品定义 → 校验材料 → 扣原料 → 发产物。
 *
 * 步骤：
 * 1. 每个 ingredient/product 的 itemId 必须在 `items` 中存在，否则 `missing-item`
 * 2. 若 !canCraft → `insufficient`
 * 3. 按聚合需求依次 consume（不可变链式更新）
 * 4. 按每条 product 调用 giveItemToInventory
 * 5. 返回 `{ ok: true, state }`
 *
 * @param state - 当前库存状态
 * @param recipe - 要合成的配方
 * @param items - 可用物品定义列表（用于查找 ItemDefinition）
 * @param nowMs - 产物获得时间戳（毫秒），传入 giveItemToInventory
 * @returns 成功时带新 state；失败时带 reason，不修改入参
 *
 * @example
 * const r = craftRecipeInInventory(state, recipe, items, Date.now());
 * if (r.ok) state = r.state;
 *
 * @throws 无抛出；错误以 `{ ok: false, reason }` 返回
 */
export function craftRecipeInInventory(
  state: InventoryState,
  recipe: RecipeDefinition,
  items: ItemDefinition[],
  nowMs: number,
): CraftRecipeResult {
  const referencedIds = new Set<string>();

  for (const line of recipe.ingredients) {
    referencedIds.add(line.itemId);
  }

  for (const line of recipe.products) {
    referencedIds.add(line.itemId);
  }

  for (const itemId of referencedIds) {
    if (!findItem(items, itemId)) {
      return { ok: false, reason: "missing-item" };
    }
  }

  if (!canCraftRecipe(state, recipe)) {
    return { ok: false, reason: "insufficient" };
  }

  let next = state;
  const needs = aggregateRecipeNeeds(recipe);

  for (const [itemId, need] of needs) {
    const consumed = consumeItemFromInventory(next, itemId, need);

    if (!consumed.ok) {
      return { ok: false, reason: consumed.reason };
    }

    next = consumed.state;
  }

  for (const line of recipe.products) {
    const def = findItem(items, line.itemId);

    // 上方已校验存在；此处再断言便于类型收窄
    if (!def) {
      return { ok: false, reason: "missing-item" };
    }

    next = giveItemToInventory(next, def, line.count, nowMs);
  }

  return { ok: true, state: next };
}

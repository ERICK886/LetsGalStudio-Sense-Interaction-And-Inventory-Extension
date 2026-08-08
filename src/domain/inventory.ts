/**
 * inventory.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 库存状态：发放/消耗物品、堆叠合并、计数与快捷栏 top 8 查询。
 */
import { createId } from "./id";
import type {
  InventoryEntry,
  InventoryState,
  ItemDefinition,
} from "./types";
import { logError } from "../shared/logger";

/** 快捷栏可见槽位数（v0.1 固定为 8） */
export const QUICKBAR_SLOTS = 8;

/**
 * 将条目按 lastGainedAt 降序排列（最近获得在前）。
 *
 * @param entries - 原始库存条目列表
 * @returns 新数组，不修改入参
 *
 * @example
 * sortEntriesRecentFirst([{ lastGainedAt: 1 }, { lastGainedAt: 3 }]);
 * // [{ lastGainedAt: 3 }, { lastGainedAt: 1 }]
 */
export function sortEntriesRecentFirst(
  entries: InventoryEntry[],
): InventoryEntry[] {
  return [...entries].sort((a, b) => b.lastGainedAt - a.lastGainedAt);
}

/**
 * 统计指定 itemId 在库存中的总数量（堆叠 count + unique 条数）。
 *
 * @param state - 当前库存状态
 * @param itemId - 物品 id
 * @returns 总数量；无该物品时为 0
 */
export function getItemCount(state: InventoryState, itemId: string): number {
  return state.entries.reduce((total, entry) => {
    if (entry.itemId !== itemId) {
      return total;
    }

    if (entry.kind === "stack") {
      return total + entry.count;
    }

    return total + 1;
  }, 0);
}

/**
 * 判断库存是否持有指定 itemId（数量 > 0）。
 *
 * @param state - 当前库存状态
 * @param itemId - 物品 id
 * @returns 是否持有
 */
export function hasItem(state: InventoryState, itemId: string): boolean {
  return getItemCount(state, itemId) > 0;
}

/**
 * 返回快捷栏条目：按最近获得排序后取前 QUICKBAR_SLOTS 条。
 *
 * @param state - 当前库存状态
 * @returns 最多 8 条 InventoryEntry 副本
 */
export function getQuickbarEntries(state: InventoryState): InventoryEntry[] {
  return sortEntriesRecentFirst(state.entries).slice(0, QUICKBAR_SLOTS);
}

/**
 * 堆叠溢出时记录错误日志。
 *
 * @param itemId - 物品 id
 * @param overflow - 被丢弃的数量
 */
function logStackOverflow(itemId: string, overflow: number): void {
  logError(
    "inventory",
    `stack overflow for "${itemId}": discarded ${overflow}`,
  );
}

/**
 * 向库存发放可堆叠物品（不可变更新）。
 *
 * @param state - 当前库存状态
 * @param item - 物品定义（stackable 应为 true）
 * @param amount - 发放数量（已规范化 >= 1）
 * @param nowMs - 本次获得时间戳（毫秒）
 * @returns 新的 InventoryState
 */
function giveStackableItem(
  state: InventoryState,
  item: ItemDefinition,
  amount: number,
  nowMs: number,
): InventoryState {
  const maxStack = item.maxStack ?? Number.MAX_SAFE_INTEGER;
  const stackIndex = state.entries.findIndex(
    (entry) => entry.kind === "stack" && entry.itemId === item.id,
  );

  const entries = [...state.entries];

  if (stackIndex >= 0) {
    const existing = entries[stackIndex] as Extract<
      InventoryEntry,
      { kind: "stack" }
    >;
    const rawTotal = existing.count + amount;
    const newCount = Math.min(rawTotal, maxStack);
    const overflow = rawTotal - newCount;

    if (overflow > 0) {
      logStackOverflow(item.id, overflow);
    }

    entries[stackIndex] = {
      kind: "stack",
      itemId: item.id,
      count: newCount,
      lastGainedAt: nowMs,
    };
  } else {
    const newCount = Math.min(amount, maxStack);
    const overflow = amount - newCount;

    if (overflow > 0) {
      logStackOverflow(item.id, overflow);
    }

    entries.push({
      kind: "stack",
      itemId: item.id,
      count: newCount,
      lastGainedAt: nowMs,
    });
  }

  return { entries };
}

/**
 * 向库存发放不可堆叠物品：每次获得新建 unique 实例（不可变更新）。
 *
 * @param state - 当前库存状态
 * @param item - 物品定义（stackable 应为 false）
 * @param amount - 发放数量（已规范化 >= 1）
 * @param nowMs - 本次获得时间戳（毫秒）
 * @returns 新的 InventoryState
 */
function giveUniqueItems(
  state: InventoryState,
  item: ItemDefinition,
  amount: number,
  nowMs: number,
): InventoryState {
  const newEntries: InventoryEntry[] = [];

  for (let i = 0; i < amount; i++) {
    newEntries.push({
      kind: "unique",
      instanceId: createId("inst"),
      itemId: item.id,
      lastGainedAt: nowMs,
    });
  }

  return { entries: [...state.entries, ...newEntries] };
}

/**
 * 向库存发放物品（不可变；返回新 state）。
 *
 * @param state - 当前库存状态
 * @param item - 物品定义
 * @param amount - 发放数量；小于 1 时视为 1
 * @param nowMs - 本次获得时间戳（毫秒）
 * @returns 新的 InventoryState；不修改入参 state
 *
 * @example
 * let inv: InventoryState = { entries: [] };
 * inv = giveItemToInventory(inv, potion, 2, Date.now());
 */
export function giveItemToInventory(
  state: InventoryState,
  item: ItemDefinition,
  amount: number,
  nowMs: number,
): InventoryState {
  const qty = amount < 1 ? 1 : amount;

  if (item.stackable) {
    return giveStackableItem(state, item, qty, nowMs);
  }

  return giveUniqueItems(state, item, qty, nowMs);
}

/** consumeItemFromInventory 的成功/失败联合结果 */
export type ConsumeItemResult =
  | { ok: true; state: InventoryState }
  | { ok: false; reason: string };

/**
 * 从库存消耗指定数量的物品（不可变；返回新 state）。
 *
 * 规则：
 * - count < 1 → `{ ok: false, reason: "invalid-count" }`
 * - 持有量不足 → `{ ok: false, reason: "insufficient" }`，不改 state
 * - 堆叠：找到 `kind==="stack" && itemId`，减 count，≤0 则移除条目
 * - unique：同 itemId 按 lastGainedAt **升序**去掉前 count 条（最旧先扣）
 *
 * @param state - 当前库存状态
 * @param itemId - 要消耗的物品 id
 * @param count - 消耗数量（必须 >= 1）
 * @returns 成功时带新 state；失败时带 reason，且不修改入参
 *
 * @example
 * const r = consumeItemFromInventory(state, "herb", 2);
 * if (r.ok) state = r.state;
 *
 * @throws 无抛出；错误以 `{ ok: false, reason }` 返回
 */
export function consumeItemFromInventory(
  state: InventoryState,
  itemId: string,
  count: number,
): ConsumeItemResult {
  if (count < 1) {
    return { ok: false, reason: "invalid-count" };
  }

  if (getItemCount(state, itemId) < count) {
    return { ok: false, reason: "insufficient" };
  }

  const stackIndex = state.entries.findIndex(
    (entry) => entry.kind === "stack" && entry.itemId === itemId,
  );

  // 堆叠路径：存在同 itemId 的 stack 条目时按堆叠扣减
  if (stackIndex >= 0) {
    const existing = state.entries[stackIndex] as Extract<
      InventoryEntry,
      { kind: "stack" }
    >;
    const nextCount = existing.count - count;
    const entries = [...state.entries];

    if (nextCount <= 0) {
      entries.splice(stackIndex, 1);
    } else {
      entries[stackIndex] = {
        ...existing,
        count: nextCount,
      };
    }

    return { ok: true, state: { entries } };
  }

  // unique 路径：按 lastGainedAt 升序去掉最旧的 count 条
  const uniqueIndices = state.entries
    .map((entry, index) => ({ entry, index }))
    .filter(
      ({ entry }) => entry.kind === "unique" && entry.itemId === itemId,
    )
    .sort((a, b) => a.entry.lastGainedAt - b.entry.lastGainedAt);

  const removeIndexSet = new Set(
    uniqueIndices.slice(0, count).map(({ index }) => index),
  );

  const entries = state.entries.filter((_, index) => !removeIndexSet.has(index));

  return { ok: true, state: { entries } };
}

/**
 * inventory-consume.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * consumeItemFromInventory：堆叠扣减、不足失败、unique 最旧先扣。
 */
import { describe, expect, it } from "vitest";
import {
  consumeItemFromInventory,
  giveItemToInventory,
  getItemCount,
} from "../../src/domain/inventory";
import type { ItemDefinition, InventoryState } from "../../src/domain/types";

const stackItem: ItemDefinition = {
  id: "herb",
  name: "草药",
  description: "",
  icon: "",
  detailImage: "",
  stackable: true,
  maxStack: 99,
};

const uniqueItem: ItemDefinition = {
  id: "key",
  name: "钥匙",
  description: "",
  icon: "",
  detailImage: "",
  stackable: false,
};

describe("consumeItemFromInventory", () => {
  it("堆叠不足则失败且不改动", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, stackItem, 2, 1000);
    const r = consumeItemFromInventory(state, "herb", 3);
    expect(r.ok).toBe(false);
    expect(getItemCount(state, "herb")).toBe(2);
  });

  it("堆叠扣减成功", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, stackItem, 5, 1000);
    const r = consumeItemFromInventory(state, "herb", 3);
    expect(r.ok).toBe(true);
    if (r.ok) expect(getItemCount(r.state, "herb")).toBe(2);
  });

  it("unique 按 lastGainedAt 升序先扣最旧", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, uniqueItem, 1, 100);
    state = giveItemToInventory(state, uniqueItem, 1, 200);
    const r = consumeItemFromInventory(state, "key", 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.entries).toHaveLength(1);
      expect(r.state.entries[0]!.lastGainedAt).toBe(200);
    }
  });
});

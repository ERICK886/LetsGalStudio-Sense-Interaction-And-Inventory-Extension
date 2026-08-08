/**
 * inventory.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 库存发放、堆叠合并与快捷栏 top 8 单测。
 */
import { describe, it, expect } from "vitest";
import {
  giveItemToInventory,
  getQuickbarEntries,
  getItemCount,
  QUICKBAR_SLOTS,
} from "../../src/domain/inventory";
import type { InventoryState, ItemDefinition } from "../../src/domain/types";

const potion: ItemDefinition = {
  id: "potion",
  name: "药水",
  description: "",
  icon: "",
  detailImage: "",
  stackable: true,
  maxStack: 99,
};

const key: ItemDefinition = {
  id: "key",
  name: "钥匙",
  description: "",
  icon: "",
  detailImage: "",
  stackable: false,
};

describe("giveItemToInventory", () => {
  it("可堆叠合并并刷新 lastGainedAt", () => {
    let s: InventoryState = { entries: [] };
    s = giveItemToInventory(s, potion, 2, 1000);
    s = giveItemToInventory(s, potion, 1, 2000);
    expect(getItemCount(s, "potion")).toBe(3);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({ kind: "stack", lastGainedAt: 2000 });
  });

  it("不可堆叠每次新建 unique", () => {
    let s: InventoryState = { entries: [] };
    s = giveItemToInventory(s, key, 2, 1000);
    expect(s.entries).toHaveLength(2);
    expect(s.entries.every((e) => e.kind === "unique")).toBe(true);
  });

  it("快捷栏最多 8 且最近在前", () => {
    let s: InventoryState = { entries: [] };
    for (let i = 0; i < 10; i++) {
      s = giveItemToInventory(
        s,
        { ...key, id: `k${i}`, name: `k${i}` },
        1,
        i,
      );
    }
    const q = getQuickbarEntries(s);
    expect(q).toHaveLength(QUICKBAR_SLOTS);
    expect(q[0]?.itemId).toBe("k9");
  });
});

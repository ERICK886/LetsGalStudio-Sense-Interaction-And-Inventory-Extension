/**
 * inventory.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 库存发放、堆叠合并与快捷栏 top 8 单测。
 */
import { describe, it, expect, vi } from "vitest";
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

/** 捕获 logError → console.error 的 spy，便于断言是否记录错误 */
function spyConsoleError(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

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

  it("amount 为 0 或负数时视为发放 1", () => {
    let s: InventoryState = { entries: [] };

    s = giveItemToInventory(s, potion, 0, 1000);
    expect(getItemCount(s, "potion")).toBe(1);

    s = giveItemToInventory(s, key, -3, 2000);
    expect(s.entries.filter((e) => e.itemId === "key")).toHaveLength(1);
  });

  it("堆叠超出 maxStack 时截断、丢弃溢出并 logError", () => {
    const smallStack: ItemDefinition = {
      ...potion,
      id: "small-potion",
      maxStack: 5,
    };
    const spy = spyConsoleError();

    let s: InventoryState = { entries: [] };
    s = giveItemToInventory(s, smallStack, 4, 1000);
    s = giveItemToInventory(s, smallStack, 3, 2000);

    expect(getItemCount(s, "small-potion")).toBe(5);
    // logError 无 err 时不向 console.error 追加 undefined
    expect(spy).toHaveBeenCalledWith(
      "[scene-interaction]",
      "inventory",
      'stack overflow for "small-potion": discarded 2',
    );

    spy.mockRestore();
  });

  it("不修改入参 state.entries", () => {
    const original: InventoryState = {
      entries: [
        {
          kind: "stack",
          itemId: "potion",
          count: 2,
          lastGainedAt: 500,
        },
      ],
    };
    const entriesRef = original.entries;
    const snapshot = structuredClone(original.entries);

    const next = giveItemToInventory(original, potion, 1, 1000);

    expect(original.entries).toBe(entriesRef);
    expect(original.entries).toEqual(snapshot);
    expect(next).not.toBe(original);
    expect(getItemCount(next, "potion")).toBe(3);
  });
});

/**
 * crafting.test.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 配方聚合、可否合成、合成扣料加产物、findRecipe 查找。
 */
import { describe, expect, it } from "vitest";
import {
  aggregateRecipeNeeds,
  canCraftRecipe,
  craftRecipeInInventory,
} from "../../src/domain/crafting";
import { findRecipe } from "../../src/domain/recipe-registry";
import {
  giveItemToInventory,
  getItemCount,
} from "../../src/domain/inventory";
import type {
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
} from "../../src/domain/types";

const herb: ItemDefinition = {
  id: "herb",
  name: "草药",
  description: "",
  icon: "",
  detailImage: "",
  stackable: true,
  maxStack: 99,
};

const water: ItemDefinition = {
  id: "water",
  name: "清水",
  description: "",
  icon: "",
  detailImage: "",
  stackable: true,
  maxStack: 99,
};

const potion: ItemDefinition = {
  id: "potion",
  name: "药水",
  description: "",
  icon: "",
  detailImage: "",
  stackable: true,
  maxStack: 99,
};

const items: ItemDefinition[] = [herb, water, potion];

const brewPotion: RecipeDefinition = {
  id: "brew-potion",
  name: "调制药水",
  ingredients: [
    { itemId: "herb", count: 2 },
    { itemId: "water", count: 1 },
    { itemId: "herb", count: 1 },
  ],
  products: [{ itemId: "potion", count: 1 }],
};

describe("aggregateRecipeNeeds", () => {
  it("按 itemId 累加原料数量", () => {
    const needs = aggregateRecipeNeeds(brewPotion);
    expect(needs.get("herb")).toBe(3);
    expect(needs.get("water")).toBe(1);
  });
});

describe("canCraftRecipe", () => {
  it("材料充足时返回 true", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, herb, 3, 1000);
    state = giveItemToInventory(state, water, 1, 1000);
    expect(canCraftRecipe(state, brewPotion)).toBe(true);
  });

  it("材料不足时返回 false", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, herb, 2, 1000);
    state = giveItemToInventory(state, water, 1, 1000);
    expect(canCraftRecipe(state, brewPotion)).toBe(false);
  });
});

describe("craftRecipeInInventory", () => {
  it("合成成功：扣原料并加产物", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, herb, 5, 1000);
    state = giveItemToInventory(state, water, 2, 1000);

    const r = craftRecipeInInventory(state, brewPotion, items, 2000);
    expect(r.ok).toBe(true);

    if (r.ok) {
      expect(getItemCount(r.state, "herb")).toBe(2);
      expect(getItemCount(r.state, "water")).toBe(1);
      expect(getItemCount(r.state, "potion")).toBe(1);
    }
  });

  it("缺少物品定义时返回 missing-item", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, herb, 3, 1000);
    state = giveItemToInventory(state, water, 1, 1000);

    const r = craftRecipeInInventory(state, brewPotion, [herb, water], 2000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("missing-item");
  });

  it("材料不足时返回 insufficient", () => {
    let state: InventoryState = { entries: [] };
    state = giveItemToInventory(state, herb, 1, 1000);

    const r = craftRecipeInInventory(state, brewPotion, items, 2000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("insufficient");
  });
});

describe("findRecipe", () => {
  const recipes: RecipeDefinition[] = [brewPotion];

  it("按 id 查找", () => {
    expect(findRecipe(recipes, "brew-potion")?.name).toBe("调制药水");
  });

  it("按 name 查找", () => {
    expect(findRecipe(recipes, "调制药水")?.id).toBe("brew-potion");
  });

  it("空 key 返回 undefined", () => {
    expect(findRecipe(recipes, "")).toBeUndefined();
    expect(findRecipe(recipes, "   ")).toBeUndefined();
  });
});

/**
 * inventory-methods.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.2
 *
 * 场景交互扩展剧本 methods：给予物品、扣除物品、是否持有、数量查询、配方合成。
 * 物品/配方定义从 editor settings（cross）读取；
 * 库存优先写已绑定会话（玩家 slot 或预览 settings 沙箱），否则写 this.save。
 *
 * runImmediately / skip：无 UI；与 run 共用写档 / 只读查询（giveItem / craft 等）。
 */

import { method, type ExtensionContext, type SaveAPI } from "@avg-studio/sdk";
import { craftRecipeInInventory } from "../domain/crafting";
import {
  getItemCount as domainGetItemCount,
  giveItemToInventory,
  consumeItemFromInventory,
  hasItem as domainHasItem,
} from "../domain/inventory";
import { findItem } from "../domain/item-registry";
import { findRecipe } from "../domain/recipe-registry";
import {
  parseInventoryJson,
  parseItemsLibraryJson,
  parseRecipesLibraryJson,
  stringifyInventory,
} from "../domain/serialize";
import type {
  InventoryState,
  ItemsLibraryFile,
  RecipesLibraryFile,
} from "../domain/types";
import { logError } from "../shared/logger";
import { readAuthorSetting } from "../store/author-settings";
import {
  getInventorySession,
  isInventoryPersistenceBound,
  setInventorySession,
} from "../store/inventory-session";
import { readItemsLibraryJson } from "../store/items-persistence";
import { readRecipesLibraryJson } from "../store/recipes-persistence";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { registerSlotSave, writeSlotField } from "../store/slot-save-bridge";

/**
 * 将 method run 回调内的 this.save 收窄为本扩展存档形状。
 *
 * @param save - ExtensionBase.save
 * @returns 强类型 SaveAPI<SceneInteractionSaveMap>
 */
function narrowSave(save: unknown): SaveAPI<SceneInteractionSaveMap> {
  return save as SaveAPI<SceneInteractionSaveMap>;
}

type MethodThis = { save: unknown };

/**
 * 读取当前库存：已绑定会话（含预览沙箱）优先，否则读宿主 save。
 *
 * @param save - 宿主 SaveAPI
 * @returns InventoryState
 */
function readInventoryState(
  save: SaveAPI<SceneInteractionSaveMap>,
): InventoryState {
  if (isInventoryPersistenceBound()) {
    return getInventorySession();
  }

  return parseInventoryJson(save.get("inventoryJson"));
}

/**
 * 写回库存：已绑定会话则走 setInventorySession（同步沙箱/slot），否则写宿主 save。
 *
 * @param save - 宿主 SaveAPI
 * @param next - 新库存
 */
function writeInventoryState(
  save: SaveAPI<SceneInteractionSaveMap>,
  next: InventoryState,
): void {
  registerSlotSave(save, { authoritative: true });

  if (isInventoryPersistenceBound()) {
    setInventorySession(next);

    return;
  }

  writeSlotField(
    "inventoryJson",
    stringifyInventory(next),
    save,
  );
}

/**
 * 可选地将布尔结果写入剧本变量。
 *
 * @param ctx - 扩展运行时上下文
 * @param resultVariable - 变量名；空或未传则跳过
 * @param ok - 操作是否成功 / 查询结果
 */
function writeBoolResult(
  ctx: ExtensionContext,
  resultVariable: string | undefined,
  ok: boolean,
): void {
  const name = resultVariable?.trim();

  if (name === undefined || name.length === 0) {
    return;
  }

  ctx.variables.set(name, ok);
}

/**
 * 可选地将数字结果写入剧本变量。
 *
 * @param ctx - 扩展运行时上下文
 * @param targetVariable - 变量名；空或未传则跳过
 * @param value - 数值
 */
function writeNumber(
  ctx: ExtensionContext,
  targetVariable: string | undefined,
  value: number,
): void {
  const name = targetVariable?.trim();

  if (name === undefined || name.length === 0) {
    return;
  }

  ctx.variables.set(name, value);
}

/**
 * 规范化物品 id 参数。
 *
 * @param raw - schema 原始值
 * @returns trim 后非空字符串；无效则 null
 */
function normalizeItemId(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  const id = String(raw).trim();

  if (id.length === 0 || id === "undefined" || id === "null") {
    return null;
  }

  return id;
}

/**
 * 从项目设置加载作者端物品库。
 *
 * @param ctx - 扩展上下文
 * @returns 解析后的 ItemsLibraryFile
 */
function loadItemsLibrary(ctx: ExtensionContext): ItemsLibraryFile {
  try {
    const raw = readItemsLibraryJson((key) => readAuthorSetting(ctx, key));

    return parseItemsLibraryJson(raw);
  } catch (err) {
    logError("inventory-methods", "读取 settings.itemsLibraryJson 失败", err);

    return parseItemsLibraryJson('{"version":1,"items":[]}');
  }
}

/**
 * 从项目设置加载作者端配方库（editor 模块 / cross）。
 *
 * @param ctx - 扩展上下文
 * @returns 解析后的 RecipesLibraryFile
 */
function loadRecipesLibrary(ctx: ExtensionContext): RecipesLibraryFile {
  try {
    const raw = readRecipesLibraryJson((key) => readAuthorSetting(ctx, key));

    return parseRecipesLibraryJson(raw);
  } catch (err) {
    logError(
      "inventory-methods",
      "读取 settings.recipesLibraryJson 失败",
      err,
    );

    return parseRecipesLibraryJson('{"version":1,"recipes":[]}');
  }
}

type GiveItemParams = {
  itemId: string;
  amount: number;
  resultVariable: string;
};

/**
 * 场景动作 giveItem 的存档副作用：写 inventoryJson。
 *
 * @param this - 方法 this（取 save）
 * @param ctx - 扩展上下文
 * @param params - 方法参数
 */
function applyGiveItem(
  this: MethodThis,
  ctx: ExtensionContext,
  params: GiveItemParams,
): void {
  const save = narrowSave(this.save);
  const itemId = normalizeItemId(params.itemId);

  if (itemId === null) {
    logError("inventory-methods", "giveItem: itemId 无效");
    writeBoolResult(ctx, params.resultVariable, false);

    return;
  }

  const lib = loadItemsLibrary(ctx);
  const item = findItem(lib.items, itemId);

  if (item === undefined) {
    logError("inventory-methods", `giveItem: 未找到物品: ${itemId}`);
    writeBoolResult(ctx, params.resultVariable, false);

    return;
  }

  const amountRaw = params.amount;
  const amount =
    typeof amountRaw === "number" && Number.isFinite(amountRaw)
      ? Math.max(1, Math.floor(amountRaw))
      : 1;

  const inventory = readInventoryState(save);
  const next = giveItemToInventory(inventory, item, amount, Date.now());

  writeInventoryState(save, next);
  writeBoolResult(ctx, params.resultVariable, true);
}

/**
 * 向玩家库存发放物品（按物品库定义堆叠 / 唯一实例）。
 *
 * @param params.itemId - 物品 id（必填）
 * @param params.amount - 数量；缺省 1
 * @param params.resultVariable - 可选；写入是否发放成功
 */
export const giveItem = method({
  id: "give-item",
  title: "给予物品",
  description: "写入 save.inventoryJson（对齐场景动作 giveItem）",
  schema: {
    itemId: { type: "string", label: "物品 ID", required: true },
    amount: { type: "number", label: "数量", default: 1, required: false },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  run: applyGiveItem,
  runImmediately: applyGiveItem,
  skip: applyGiveItem,
});

type RemoveItemParams = {
  itemId: string;
  amount: number;
  resultVariable: string;
};

/** 按指定数量扣除库存；无效参数或数量不足时不写库存。 */
function applyRemoveItem(
  this: MethodThis,
  ctx: ExtensionContext,
  params: RemoveItemParams,
): void {
  const itemId = normalizeItemId(params.itemId);
  const amount = params.amount === undefined ? 1 : params.amount;

  if (itemId === null || !Number.isSafeInteger(amount) || amount < 1) {
    logError("inventory-methods", "removeItem: 物品 ID 或数量无效，数量须为正整数");
    writeBoolResult(ctx, params.resultVariable, false);
    return;
  }

  const save = narrowSave(this.save);
  const result = consumeItemFromInventory(readInventoryState(save), itemId, amount);

  if (!result.ok) {
    logError("inventory-methods", `removeItem: 扣除失败 (${itemId} x${amount}): ${result.reason}`);
    writeBoolResult(ctx, params.resultVariable, false);
    return;
  }

  writeInventoryState(save, result.state);
  writeBoolResult(ctx, params.resultVariable, true);
}

/** 剧情 block 扣除物品，与场景动作共用扣物规则及玩家库存。 */
export const removeItem = method({
  id: "remove-item",
  title: "扣除物品",
  description: "按数量扣除玩家物品；数量不足时不扣除，可将成功与否写入变量",
  schema: {
    itemId: { type: "string", label: "物品 ID", required: true },
    amount: { type: "number", label: "数量", default: 1, min: 1, step: 1, required: false },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  run: applyRemoveItem,
  runImmediately: applyRemoveItem,
  skip: applyRemoveItem,
});

type HasItemParams = {
  itemId: string;
  resultVariable: string;
};

/**
 * 只读查询是否持有（不改 save）。
 *
 * @param this - 方法 this
 * @param ctx - 扩展上下文
 * @param params - 方法参数
 */
function applyHasItem(
  this: MethodThis,
  ctx: ExtensionContext,
  params: HasItemParams,
): void {
  const save = narrowSave(this.save);
  const itemId = normalizeItemId(params.itemId);

  if (itemId === null) {
    writeBoolResult(ctx, params.resultVariable, false);

    return;
  }

  const inventory = readInventoryState(save);
  const owned = domainHasItem(inventory, itemId);

  writeBoolResult(ctx, params.resultVariable, owned);
}

/**
 * 判断库存是否持有指定物品（数量 > 0）。
 *
 * @param params.itemId - 物品 id（必填）
 * @param params.resultVariable - 可选；写入是否持有（boolean）
 */
export const hasItem = method({
  id: "has-item",
  title: "是否持有物品",
  description: "只读 inventoryJson / 会话库存，不改存档",
  schema: {
    itemId: { type: "string", label: "物品 ID", required: true },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  run: applyHasItem,
  runImmediately: applyHasItem,
  skip: applyHasItem,
});

type GetItemCountParams = {
  itemId: string;
  targetVariable: string;
};

/**
 * 只读数量查询（不改 save）。
 *
 * @param this - 方法 this
 * @param ctx - 扩展上下文
 * @param params - 方法参数
 */
function applyGetItemCount(
  this: MethodThis,
  ctx: ExtensionContext,
  params: GetItemCountParams,
): void {
  const save = narrowSave(this.save);
  const itemId = normalizeItemId(params.itemId);

  if (itemId === null) {
    writeNumber(ctx, params.targetVariable, 0);

    return;
  }

  const inventory = readInventoryState(save);
  const count = domainGetItemCount(inventory, itemId);

  writeNumber(ctx, params.targetVariable, count);
}

/**
 * 读取指定物品在库存中的总数量，写入剧本变量。
 *
 * @param params.itemId - 物品 id（必填）
 * @param params.targetVariable - 写入变量名（必填）
 */
export const getItemCount = method({
  id: "get-item-count",
  title: "获取物品数量",
  description: "只读 inventoryJson / 会话库存，不改存档",
  schema: {
    itemId: { type: "string", label: "物品 ID", required: true },
    targetVariable: { type: "string", label: "写入变量", required: true },
  },
  run: applyGetItemCount,
  runImmediately: applyGetItemCount,
  skip: applyGetItemCount,
});

type CraftRecipeParams = {
  recipeIdOrName: string;
  resultVariable: string;
};

/**
 * 场景合成副作用：扣原料 + 发产物，写 inventoryJson（对齐 removeItem+giveItem）。
 *
 * @param this - 方法 this
 * @param ctx - 扩展上下文
 * @param params - 方法参数
 */
function applyCraftRecipe(
  this: MethodThis,
  ctx: ExtensionContext,
  params: CraftRecipeParams,
): void {
  const save = narrowSave(this.save);
  const key = normalizeItemId(params.recipeIdOrName);

  if (key === null) {
    logError(
      "inventory-methods",
      "craftRecipe: recipeIdOrName 无效（请用「值」填写配方 id/名称，勿用未绑定变量）",
    );
    writeBoolResult(ctx, params.resultVariable, false);

    return;
  }

  const recipesLib = loadRecipesLibrary(ctx);
  const recipe = findRecipe(recipesLib.recipes, key);

  if (recipe === undefined) {
    logError("inventory-methods", `craftRecipe: 未找到配方: ${key}`);
    writeBoolResult(ctx, params.resultVariable, false);

    return;
  }

  const itemsLib = loadItemsLibrary(ctx);
  const inventory = readInventoryState(save);
  const result = craftRecipeInInventory(
    inventory,
    recipe,
    itemsLib.items,
    Date.now(),
  );

  if (!result.ok) {
    logError(
      "inventory-methods",
      `craftRecipe: 合成失败 (${key}): ${result.reason}`,
    );
    writeBoolResult(ctx, params.resultVariable, false);

    return;
  }

  writeInventoryState(save, result.state);
  writeBoolResult(ctx, params.resultVariable, true);
}

/**
 * 按配方 id 或名称在库存中执行一次合成。
 *
 * @param params.recipeIdOrName - 配方 id 或显示名（必填）
 * @param params.resultVariable - 可选；写入是否合成成功（boolean）
 *
 * @remarks
 * 读 editor 配方库 + 物品库，扣原料并发产物，写回 save.inventoryJson。
 * 原料不足 / 配方不存在 / 产物未定义 → 失败且不改库存。
 *
 * @example
 * // 剧本：调用扩展方法 craft-recipe，recipeIdOrName = "brew-potion"
 */
export const craftRecipe = method({
  id: "craft-recipe",
  title: "合成配方",
  description: "写入 save.inventoryJson（扣原料+发产物）",
  schema: {
    recipeIdOrName: {
      type: "string",
      label: "配方 ID 或名称",
      required: true,
    },
    resultVariable: {
      type: "string",
      label: "结果写入变量",
      required: false,
    },
  },
  run: applyCraftRecipe,
  runImmediately: applyCraftRecipe,
  skip: applyCraftRecipe,
});

/**
 * inventory-methods.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互扩展剧本 methods：给予物品、是否持有、数量查询。
 * 物品定义从 settings.itemsLibraryJson 读取；库存读写 save.inventoryJson。
 */

import { method, type ExtensionContext, type SaveAPI } from "@avg-studio/sdk";
import {
  getItemCount as domainGetItemCount,
  giveItemToInventory,
  hasItem as domainHasItem,
} from "../domain/inventory";
import { findItem } from "../domain/item-registry";
import {
  parseInventoryJson,
  parseItemsLibraryJson,
  stringifyInventory,
} from "../domain/serialize";
import type { ItemsLibraryFile } from "../domain/types";
import { logError } from "../shared/logger";
import { readItemsLibraryJson } from "../store/items-persistence";
import { notifySaveField } from "../store/save-sync";
import type { SceneInteractionSaveMap } from "../store/save-types";

/**
 * 将 method run 回调内的 this.save 收窄为本扩展存档形状。
 *
 * @param save - ExtensionBase.save
 * @returns 强类型 SaveAPI<SceneInteractionSaveMap>
 */
function narrowSave(save: unknown): SaveAPI<SceneInteractionSaveMap> {
  return save as SaveAPI<SceneInteractionSaveMap>;
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
    const raw = readItemsLibraryJson((key) => ctx.settings.get(key));

    return parseItemsLibraryJson(raw);
  } catch (err) {
    logError("inventory-methods", "读取 settings.itemsLibraryJson 失败", err);

    return parseItemsLibraryJson('{"version":1,"items":[]}');
  }
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
  schema: {
    itemId: { type: "string", label: "物品 ID", required: true },
    amount: { type: "number", label: "数量", default: 1, required: false },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  run(ctx, params) {
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

    const inventory = parseInventoryJson(save.get("inventoryJson"));
    const next = giveItemToInventory(inventory, item, amount, Date.now());

    save.set("inventoryJson", stringifyInventory(next));
    notifySaveField("inventoryJson");
    writeBoolResult(ctx, params.resultVariable, true);
  },
});

/**
 * 判断库存是否持有指定物品（数量 > 0）。
 *
 * @param params.itemId - 物品 id（必填）
 * @param params.resultVariable - 可选；写入是否持有（boolean）
 */
export const hasItem = method({
  id: "has-item",
  title: "是否持有物品",
  schema: {
    itemId: { type: "string", label: "物品 ID", required: true },
    resultVariable: { type: "string", label: "结果写入变量", required: false },
  },
  run(ctx, params) {
    const save = narrowSave(this.save);
    const itemId = normalizeItemId(params.itemId);

    if (itemId === null) {
      writeBoolResult(ctx, params.resultVariable, false);

      return;
    }

    const inventory = parseInventoryJson(save.get("inventoryJson"));
    const owned = domainHasItem(inventory, itemId);

    writeBoolResult(ctx, params.resultVariable, owned);
  },
});

/**
 * 读取指定物品在库存中的总数量，写入剧本变量。
 *
 * @param params.itemId - 物品 id（必填）
 * @param params.targetVariable - 写入变量名（必填）
 */
export const getItemCount = method({
  id: "get-item-count",
  title: "获取物品数量",
  schema: {
    itemId: { type: "string", label: "物品 ID", required: true },
    targetVariable: { type: "string", label: "写入变量", required: true },
  },
  run(ctx, params) {
    const save = narrowSave(this.save);
    const itemId = normalizeItemId(params.itemId);

    if (itemId === null) {
      writeNumber(ctx, params.targetVariable, 0);

      return;
    }

    const inventory = parseInventoryJson(save.get("inventoryJson"));
    const count = domainGetItemCount(inventory, itemId);

    writeNumber(ctx, params.targetVariable, count);
  },
});

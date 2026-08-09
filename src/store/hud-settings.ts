/**
 * hud-settings.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * HUD / 全屏背包布局 settings 读写。
 * - 快捷栏 / toast：`backpack-hud`
 * - 全屏背包布局：`backpack`（回退读旧 `backpack-hud` 数据）
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import {
  BACKPACK_HUD_MODULE_ID,
  BACKPACK_MODULE_ID,
} from "../shared/module-ids";
import { logError } from "../shared/logger";

/** 快捷栏 HUD 外观 JSON */
export const INVENTORY_HUD_JSON_KEY = "inventoryHudJson";

/** 全屏背包布局 JSON */
export const BACKPACK_SCREEN_JSON_KEY = "backpackScreenJson";

/** 获得物品提示 Toast JSON */
export const ITEM_TOAST_JSON_KEY = "itemToastJson";

/**
 * 判断 setting 是否空。
 *
 * @param value - 原始值
 * @returns true 表示空
 */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return true;
  }

  return false;
}

/**
 * 某 key 应写入的模块 id。
 *
 * @param key - 字段名
 * @returns 模块 id
 */
function ownerModuleId(key: string): string {
  if (key === BACKPACK_SCREEN_JSON_KEY) {
    return BACKPACK_MODULE_ID;
  }

  return BACKPACK_HUD_MODULE_ID;
}

/**
 * 读取 HUD / 背包相关 setting。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名
 * @returns 原始值
 */
export function readHudSetting(
  ctx: ExtensionContext,
  key: string,
): unknown {
  const primary = ownerModuleId(key);

  try {
    const fromPrimary = ctx.settings.cross.get(primary, key);

    if (!isBlank(fromPrimary)) {
      return fromPrimary;
    }
  } catch (err) {
    logError(
      "hud-settings",
      `settings.cross.get("${primary}", "${key}") 失败`,
      err,
    );
  }

  /**
   * 迁移：全屏背包 JSON 曾挂在 backpack-hud 下。
   */
  if (key === BACKPACK_SCREEN_JSON_KEY && primary === BACKPACK_MODULE_ID) {
    try {
      const legacy = ctx.settings.cross.get(BACKPACK_HUD_MODULE_ID, key);

      if (!isBlank(legacy)) {
        return legacy;
      }
    } catch {
      // 忽略
    }
  }

  try {
    return ctx.settings.get(key);
  } catch (err) {
    logError("hud-settings", `settings.get("${key}") 失败`, err);

    return undefined;
  }
}

/**
 * 写入 HUD / 背包相关 setting（落到所属模块）。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名
 * @param value - 新值
 */
export function writeHudSetting(
  ctx: ExtensionContext,
  key: string,
  value: unknown,
): void {
  const moduleId = ownerModuleId(key);

  try {
    ctx.settings.cross.set(moduleId, key, value);

    return;
  } catch (err) {
    logError(
      "hud-settings",
      `settings.cross.set("${moduleId}", "${key}") 失败，尝试本地`,
      err,
    );
  }

  try {
    ctx.settings.set(key, value);
  } catch (err) {
    logError("hud-settings", `settings.set("${key}") 失败`, err);
  }
}

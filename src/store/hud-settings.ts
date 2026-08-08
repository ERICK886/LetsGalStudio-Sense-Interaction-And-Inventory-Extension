/**
 * hud-settings.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.8
 *
 * 背包 HUD / 全屏背包布局 settings：声明在 `backpack-hud` 模块；
 * 编辑器等通过 settings.cross 读写（勿写到 editor 本地）。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import { BACKPACK_HUD_MODULE_ID } from "../shared/module-ids";
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
 * 读取 backpack-hud 侧 setting。
 *
 * 优先 `cross.get("backpack-hud")`，再回退本地 get。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名
 * @returns 原始值
 */
export function readHudSetting(
  ctx: ExtensionContext,
  key: string,
): unknown {
  try {
    const fromHud = ctx.settings.cross.get(BACKPACK_HUD_MODULE_ID, key);

    if (!isBlank(fromHud)) {
      return fromHud;
    }
  } catch (err) {
    logError(
      "hud-settings",
      `settings.cross.get("${BACKPACK_HUD_MODULE_ID}", "${key}") 失败`,
      err,
    );
  }

  try {
    return ctx.settings.get(key);
  } catch (err) {
    logError("hud-settings", `settings.get("${key}") 失败`, err);

    return undefined;
  }
}

/**
 * 写入 backpack-hud 侧 setting（始终落到 backpack-hud，避免编辑器误写本地）。
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
  try {
    ctx.settings.cross.set(BACKPACK_HUD_MODULE_ID, key, value);

    return;
  } catch (err) {
    logError(
      "hud-settings",
      `settings.cross.set("${BACKPACK_HUD_MODULE_ID}", "${key}") 失败，尝试本地`,
      err,
    );
  }

  try {
    ctx.settings.set(key, value);
  } catch (err) {
    logError("hud-settings", `settings.set("${key}") 失败`, err);
  }
}

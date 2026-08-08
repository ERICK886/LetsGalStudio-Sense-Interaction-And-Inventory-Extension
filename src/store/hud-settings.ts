/**
 * hud-settings.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 背包 HUD 外观 settings：声明在 `backpack-hud` 模块；
 * 编辑器等通过 settings.cross 读写。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import { BACKPACK_HUD_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";

/** HUD 外观 JSON 字段名 */
export const INVENTORY_HUD_JSON_KEY = "inventoryHudJson";

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

    if (fromHud !== undefined && fromHud !== null) {
      if (typeof fromHud === "string" && fromHud.trim().length === 0) {
        // 继续尝试本地
      } else {
        return fromHud;
      }
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
 * 写入 backpack-hud 侧 setting。
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
    ctx.settings.set(key, value);

    return;
  } catch (err) {
    logError("hud-settings", `settings.set("${key}") 失败，尝试 cross`, err);
  }

  try {
    ctx.settings.cross.set(BACKPACK_HUD_MODULE_ID, key, value);
  } catch (err) {
    logError(
      "hud-settings",
      `settings.cross.set("${BACKPACK_HUD_MODULE_ID}", "${key}") 失败`,
      err,
    );
  }
}

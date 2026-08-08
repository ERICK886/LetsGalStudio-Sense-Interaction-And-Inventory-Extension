/**
 * runtime-settings.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 运行时模块（scene-interaction）settings 读写辅助。
 * HUD 等字段声明在 scene-interaction；编辑器内通过 settings.cross 读写。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import { SCENE_INTERACTION_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";

/**
 * 读取运行时侧 setting。
 *
 * 优先当前模块 `settings.get`；若无值则
 * `settings.cross.get("scene-interaction", key)`（编辑器内跨模块）。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名（如 inventoryHudJson）
 * @returns 原始值；两边都没有则为 undefined
 *
 * @example
 * ```ts
 * const raw = readRuntimeSetting(ctx, "inventoryHudJson");
 * ```
 */
export function readRuntimeSetting(
  ctx: ExtensionContext,
  key: string,
): unknown {
  try {
    const local = ctx.settings.get(key);

    if (local !== undefined) {
      return local;
    }
  } catch (err) {
    logError("runtime-settings", `settings.get("${key}") 失败`, err);
  }

  try {
    return ctx.settings.cross.get(SCENE_INTERACTION_MODULE_ID, key);
  } catch (err) {
    logError(
      "runtime-settings",
      `settings.cross.get("${SCENE_INTERACTION_MODULE_ID}", "${key}") 失败`,
      err,
    );

    return undefined;
  }
}

/**
 * 写入运行时侧 setting。
 *
 * 优先写当前模块；失败则 cross 写到 scene-interaction。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名
 * @param value - 新值
 */
export function writeRuntimeSetting(
  ctx: ExtensionContext,
  key: string,
  value: unknown,
): void {
  try {
    ctx.settings.set(key, value);

    return;
  } catch (err) {
    logError(
      "runtime-settings",
      `settings.set("${key}") 失败，尝试 cross`,
      err,
    );
  }

  try {
    ctx.settings.cross.set(SCENE_INTERACTION_MODULE_ID, key, value);
  } catch (err) {
    logError(
      "runtime-settings",
      `settings.cross.set("${SCENE_INTERACTION_MODULE_ID}", "${key}") 失败`,
      err,
    );
  }
}

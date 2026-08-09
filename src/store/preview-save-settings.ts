/**
 * preview-save-settings.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.1
 *
 * 预览沙箱存档字段：声明在 `scene-interaction` 的 **settings**（非 saveSchema）。
 * 便于 Studio / 编辑器预览测试；玩家 slot 存档不受影响。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import { SCENE_INTERACTION_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";

/**
 * @deprecated 预览库存不再写 settings；保留常量以免旧引用编译失败。
 */
export const PREVIEW_INVENTORY_JSON_KEY = "previewInventoryJson";

/**
 * @deprecated once 进度不再写 settings；保留常量以免旧引用编译失败。
 */
export const PREVIEW_PROGRESS_JSON_KEY = "previewProgressJson";

/** 预览当前场景 ID（settings） */
export const PREVIEW_CURRENT_SCENE_ID_KEY = "previewCurrentSceneId";

/** 预览场景返回栈 JSON（settings） */
export const PREVIEW_SCENE_RETURN_STACK_JSON_KEY =
  "previewSceneReturnStackJson";

/**
 * @param value - settings 原始值
 * @returns 是否视为空
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
 * 读取预览沙箱 setting。
 *
 * 优先 `cross.get("scene-interaction")`，再回退本地 get。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名
 * @returns 原始值
 */
export function readPreviewSaveSetting(
  ctx: ExtensionContext,
  key: string,
): unknown {
  try {
    const fromSi = ctx.settings.cross.get(SCENE_INTERACTION_MODULE_ID, key);

    if (!isBlank(fromSi)) {
      return fromSi;
    }
  } catch (err) {
    logError(
      "preview-save-settings",
      `settings.cross.get("${SCENE_INTERACTION_MODULE_ID}", "${key}") 失败`,
      err,
    );
  }

  try {
    return ctx.settings.get(key);
  } catch (err) {
    logError("preview-save-settings", `settings.get("${key}") 失败`, err);

    return undefined;
  }
}

/**
 * 写入预览沙箱 setting（始终落到 scene-interaction 模块）。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名
 * @param value - 新值
 */
export function writePreviewSaveSetting(
  ctx: ExtensionContext,
  key: string,
  value: unknown,
): void {
  try {
    ctx.settings.cross.set(SCENE_INTERACTION_MODULE_ID, key, value);

    return;
  } catch (err) {
    logError(
      "preview-save-settings",
      `settings.cross.set("${SCENE_INTERACTION_MODULE_ID}", "${key}") 失败，尝试本地`,
      err,
    );
  }

  try {
    ctx.settings.set(key, value);
  } catch (err) {
    logError(
      "preview-save-settings",
      `settings.set("${key}") 失败`,
      err,
    );
  }
}

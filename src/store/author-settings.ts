/**
 * author-settings.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 作者库 settings 读写：声明在 `editor` 模块；
 * `scene-interaction` 运行时通过 settings.cross 读取。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import { EDITOR_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";

/**
 * 读取作者侧 setting。
 *
 * 优先当前模块 `settings.get`（编辑器内）；若无值则
 * `settings.cross.get("editor", key)`（运行时跨模块）。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名（如 scenesLibraryJson）
 * @returns 原始值；两边都没有则为 undefined
 *
 * @example
 * ```ts
 * const raw = readAuthorSetting(ctx, "scenesLibraryJson");
 * ```
 */
export function readAuthorSetting(
  ctx: ExtensionContext,
  key: string,
): unknown {
  try {
    const local = ctx.settings.get(key);

    if (local !== undefined) {
      return local;
    }
  } catch (err) {
    logError("author-settings", `settings.get("${key}") 失败`, err);
  }

  try {
    return ctx.settings.cross.get(EDITOR_MODULE_ID, key);
  } catch (err) {
    logError(
      "author-settings",
      `settings.cross.get("${EDITOR_MODULE_ID}", "${key}") 失败`,
      err,
    );

    return undefined;
  }
}

/**
 * 写入作者侧 setting（供编辑器使用）。
 *
 * 优先写当前模块；若当前不是 editor（异常路径），则 cross 写到 editor。
 *
 * @param ctx - 扩展上下文
 * @param key - 字段名
 * @param value - 新值
 */
export function writeAuthorSetting(
  ctx: ExtensionContext,
  key: string,
  value: unknown,
): void {
  try {
    // 编辑器模块：本地 set 才能与 Studio 设置面板同源
    ctx.settings.set(key, value);

    return;
  } catch (err) {
    logError("author-settings", `settings.set("${key}") 失败，尝试 cross`, err);
  }

  try {
    ctx.settings.cross.set(EDITOR_MODULE_ID, key, value);
  } catch (err) {
    logError(
      "author-settings",
      `settings.cross.set("${EDITOR_MODULE_ID}", "${key}") 失败`,
      err,
    );
  }
}

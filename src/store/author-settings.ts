/**
 * author-settings.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.1
 *
 * 作者库 settings 读写：声明在 `editor` 模块；
 * `scene-interaction` 运行时通过 settings.cross 读取。
 *
 * @remarks
 * 拆分后必须**优先** `cross.get("editor")`：若先读本地，运行时模块上
 * 残留的空 `scenesLibraryJson`（schema 迁移前）会挡住 editor 真库。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import { EDITOR_MODULE_ID } from "../shared/module-ids";
import { logError } from "../shared/logger";

/**
 * 判断 setting 是否「无有效值」（应继续尝试另一侧）。
 *
 * @param value - settings.get / cross.get 原始值
 * @returns true 表示空
 */
function isBlankSetting(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return true;
  }

  return false;
}

/**
 * 读取作者侧 setting。
 *
 * 优先 `settings.cross.get("editor", key)`（真源）；
 * 若 editor 侧无值，再回退当前模块 `settings.get`（编辑器本进程）。
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
    const fromEditor = ctx.settings.cross.get(EDITOR_MODULE_ID, key);

    if (!isBlankSetting(fromEditor)) {
      return fromEditor;
    }
  } catch (err) {
    logError(
      "author-settings",
      `settings.cross.get("${EDITOR_MODULE_ID}", "${key}") 失败`,
      err,
    );
  }

  try {
    const local = ctx.settings.get(key);

    if (!isBlankSetting(local)) {
      return local;
    }

    // 两边都是空串时仍返回 local（或 undefined），供 parse 回退空库
    return local !== undefined ? local : undefined;
  } catch (err) {
    logError("author-settings", `settings.get("${key}") 失败`, err);

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

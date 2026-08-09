/**
 * logger.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.1
 *
 * 场景交互扩展的统一日志入口（error / warn / info / debug）。
 * 浏览器控制台过滤前缀：`[scene-interaction]`。
 */

/**
 * 输出带 scope 前缀的错误日志。
 *
 * @param scope - 模块/功能标识（如 `"scene-return"`、`"preview"`）
 * @param message - 人类可读说明
 * @param err - 可选的原始错误对象
 *
 * @example
 * ```ts
 * logError("motion", "normalize failed", new Error("bad preset"));
 * ```
 */
export function logError(
  scope: string,
  message: string,
  err?: unknown,
): void {
  // 无 err 时不要把 undefined 打进控制台（易被误读成「参数是 undefined」）
  if (err !== undefined) {
    console.error("[scene-interaction]", scope, message, err);
  } else {
    console.error("[scene-interaction]", scope, message);
  }
}

/**
 * 输出带 scope 前缀的警告日志（非致命异常 / 可疑状态）。
 *
 * @param scope - 模块/功能标识
 * @param message - 人类可读说明
 * @param detail - 可选结构化上下文（对象会一并打印，便于排查）
 *
 * @example
 * ```ts
 * logWarn("scene-return", "返回按钮隐藏：栈为空", { currentSceneId: "a" });
 * ```
 */
export function logWarn(
  scope: string,
  message: string,
  detail?: unknown,
): void {
  if (detail !== undefined) {
    console.warn("[scene-interaction]", scope, message, detail);
  } else {
    console.warn("[scene-interaction]", scope, message);
  }
}

/**
 * 输出带 scope 前缀的信息日志（流程排查用）。
 *
 * @param scope - 模块/功能标识
 * @param message - 人类可读说明
 * @param detail - 可选结构化上下文
 *
 * @example
 * ```ts
 * logInfo("preview", "进入运行预览", { previewSceneId: "room-1" });
 * ```
 */
export function logInfo(
  scope: string,
  message: string,
  detail?: unknown,
): void {
  if (detail !== undefined) {
    console.info("[scene-interaction]", scope, message, detail);
  } else {
    console.info("[scene-interaction]", scope, message);
  }
}

/**
 * 输出带 scope 前缀的调试日志（细粒度流程排查；控制台级别 debug）。
 *
 * @param scope - 模块/功能标识
 * @param message - 人类可读说明
 * @param detail - 可选结构化上下文
 *
 * @example
 * ```ts
 * logDebug("jump-fragment", "callFragment 即将 await", { fragmentId });
 * ```
 */
export function logDebug(
  scope: string,
  message: string,
  detail?: unknown,
): void {
  if (detail !== undefined) {
    console.debug("[scene-interaction]", scope, message, detail);
  } else {
    console.debug("[scene-interaction]", scope, message);
  }
}

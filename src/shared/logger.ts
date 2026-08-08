/**
 * logger.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互扩展的统一错误日志入口。
 */

/**
 * 输出带 scope 前缀的错误日志。
 *
 * @param scope - 模块/功能标识
 * @param message - 人类可读说明
 * @param err - 可选的原始错误对象
 *
 * @example
 * logError("motion", "normalize failed", new Error("bad preset"));
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

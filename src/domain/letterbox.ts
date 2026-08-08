/**
 * letterbox.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景 letterbox（黑边/白边/自定义色）字段规范化。
 */
import type { LetterboxMode } from "./types";

const VALID_MODES: readonly LetterboxMode[] = ["black", "white", "custom"];

/**
 * 判断 value 是否为合法 LetterboxMode。
 *
 * @param value - 待校验值
 * @returns 是否为合法 letterbox 模式
 */
function isValidLetterboxMode(value: unknown): value is LetterboxMode {
  return (
    typeof value === "string" &&
    (VALID_MODES as readonly string[]).includes(value)
  );
}

/**
 * 规范化 letterbox 模式；非法或缺失时返回 undefined（表示使用运行时默认）。
 *
 * @param raw - 原始 JSON 值
 * @returns 合法 LetterboxMode 或 undefined
 *
 * @example
 * normalizeLetterboxMode("black"); // "black"
 * normalizeLetterboxMode("red");   // undefined
 */
export function normalizeLetterboxMode(raw: unknown): LetterboxMode | undefined {
  return isValidLetterboxMode(raw) ? raw : undefined;
}

/**
 * 规范化 letterbox 自定义颜色字符串。
 *
 * @param raw - 原始 JSON 值
 * @returns 非空字符串或 undefined
 *
 * @example
 * normalizeLetterboxColor("#000"); // "#000"
 * normalizeLetterboxColor(42);     // undefined
 */
export function normalizeLetterboxColor(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    return undefined;
  }

  return raw;
}

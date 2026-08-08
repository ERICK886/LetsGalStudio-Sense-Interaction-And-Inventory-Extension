/**
 * color-utils.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 颜色 hex 字符串规范化工具。
 * 对齐大地图系统（ext-5f4afa）ColorField 的校验规则，供颜色选择器失焦写入。
 */

/** 三位短格式 #RGB */
const HEX_RGB_PATTERN = /^#([0-9a-fA-F]{3})$/;

/** 六位标准格式 #RRGGBB */
const HEX_RRGGBB_PATTERN = /^#([0-9a-fA-F]{6})$/;

/** 八位含 alpha 格式 #RRGGBBAA */
const HEX_RRGGBBAA_PATTERN = /^#([0-9a-fA-F]{8})$/;

/**
 * 将用户输入的 hex 颜色规范化为标准形式。
 *
 * - `#RGB` 扩写为 `#RRGGBB`（每位重复并大写）
 * - `#RRGGBB` / `#RRGGBBAA` 原样返回（保留用户大小写）
 * - 空串、命名色、非法 hex 返回 `null`
 *
 * @param raw - 用户输入或 color input 的 value
 * @returns 规范化后的 hex；非法时 `null`
 *
 * @example
 * ```ts
 * normalizeHexColor("#f03");      // "#FF0033"
 * normalizeHexColor("#F03730");   // "#F03730"
 * normalizeHexColor("#F0373080"); // "#F0373080"
 * normalizeHexColor("red");       // null
 * ```
 */
export function normalizeHexColor(raw: string): string | null {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return null;
  }

  const rgbMatch = trimmed.match(HEX_RGB_PATTERN);

  if (rgbMatch) {
    const [r, g, b] = rgbMatch[1]!.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (HEX_RRGGBB_PATTERN.test(trimmed) || HEX_RRGGBBAA_PATTERN.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * 将存储的 hex 转为原生 `input[type=color]` 可接受的 `#RRGGBB`。
 * 八位含 alpha 时截断后六位；非法时回退默认色。
 *
 * @param hex - 领域中的颜色字符串
 * @param fallback - 非法时回退色，默认 `#64e0d0`
 * @returns `#RRGGBB`
 *
 * @example
 * ```ts
 * toColorInputValue("#64e0d0");     // "#64e0d0"
 * toColorInputValue("#64e0d080");   // "#64e0d0"
 * toColorInputValue("bad");         // fallback
 * ```
 */
export function toColorInputValue(
  hex: string,
  fallback = "#64e0d0",
): string {
  const normalized = normalizeHexColor(hex);

  if (normalized === null) {
    return fallback;
  }

  if (normalized.length === 9) {
    return normalized.slice(0, 7);
  }

  return normalized.length === 7 ? normalized : fallback;
}

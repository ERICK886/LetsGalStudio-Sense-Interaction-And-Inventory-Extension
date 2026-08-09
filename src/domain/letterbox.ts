/**
 * letterbox.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.3
 *
 * 场景 letterbox（黑边/白边/自定义色）字段规范化与运行时底色解析。
 * 自定义色可为 `#RRGGBB` 或带透明度的 `#RRGGBBAA` / `rgba(...)`。
 * 渲染前经 {@link letterboxColorToCss} 转为 `rgba()` / `transparent`，
 * 避免部分宿主对八位 hex 支持不佳。
 */
import type { LetterboxMode, SceneDefinition } from "./types";

const VALID_MODES: readonly LetterboxMode[] = ["black", "white", "custom"];

/** 黑底模式 / 缺省时的近黑 letterbox（与历史编辑器画布一致） */
export const LETTERBOX_COLOR_BLACK = "#141418";

/** 白底模式 */
export const LETTERBOX_COLOR_WHITE = "#FFFFFF";

/**
 * 将存储色转为更兼容的 CSS background 值。
 *
 * - alpha≈0 → `"transparent"`
 * - 可解析的 hex / rgb(a) → `rgba(r, g, b, a)`
 * - 无法解析 → 原样返回
 *
 * @param color - 存储或已解析的颜色字符串
 * @returns 适合直接赋给 `style.background` 的 CSS 颜色
 *
 * @example
 * letterboxColorToCss("#00000000"); // "transparent"
 * letterboxColorToCss("#00000080"); // "rgba(0, 0, 0, 0.502)"
 */
export function letterboxColorToCss(color: string): string {
  const t = color.trim();

  if (t === "" || t === "transparent") {
    return "transparent";
  }

  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(t);

  if (hex) {
    let h = hex[1];

    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }

    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;

    if (a <= 0.001) {
      return "transparent";
    }

    const aRound = Math.round(a * 1000) / 1000;

    return `rgba(${r}, ${g}, ${b}, ${aRound})`;
  }

  const rgba =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
      t,
    );

  if (rgba) {
    const r = Number(rgba[1]);
    const g = Number(rgba[2]);
    const b = Number(rgba[3]);
    const a = rgba[4] !== undefined ? Number(rgba[4]) : 1;

    if (a <= 0.001) {
      return "transparent";
    }

    const aRound = Math.round(a * 1000) / 1000;

    return `rgba(${r}, ${g}, ${b}, ${aRound})`;
  }

  return t;
}

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
 * 规范化 letterbox 自定义颜色字符串（保留 Alpha，不截断）。
 *
 * @param raw - 原始 JSON 值（如 `#000000`、`#00000080`、`rgba(0,0,0,0.5)`）
 * @returns trim 后的非空字符串；非法类型或空串为 undefined
 *
 * @example
 * normalizeLetterboxColor("#000");       // "#000"
 * normalizeLetterboxColor("#00000080");  // "#00000080"
 * normalizeLetterboxColor(42);           // undefined
 */
export function normalizeLetterboxColor(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.trim() === "") {
    return undefined;
  }

  return raw.trim();
}

/**
 * 根据场景 letterbox 字段解析 CSS 底色（供编辑器画布 / 运行时 SceneView）。
 *
 * - `white` → `#FFFFFF`
 * - `custom` + 非空 `letterboxColor` → 原样返回（可含 Alpha）
 * - 其余（含 `black`、缺省、custom 无色）→ {@link LETTERBOX_COLOR_BLACK}
 *
 * @param scene - 场景定义（读取 letterboxMode / letterboxColor）
 * @returns CSS 颜色字符串
 *
 * @example
 * ```ts
 * resolveLetterboxColor({ letterboxMode: "custom", letterboxColor: "#00000000", ... });
 * // "#00000000"
 * ```
 */
export function resolveLetterboxColor(
  scene: Pick<SceneDefinition, "letterboxMode" | "letterboxColor">,
): string {
  const mode = scene.letterboxMode ?? "black";

  if (mode === "white") {
    return letterboxColorToCss(LETTERBOX_COLOR_WHITE);
  }

  if (mode === "custom" && scene.letterboxColor) {
    return letterboxColorToCss(scene.letterboxColor);
  }

  return letterboxColorToCss(LETTERBOX_COLOR_BLACK);
}

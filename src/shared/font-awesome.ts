/**
 * font-awesome.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * 注入 Font Awesome 7 CDN 样式（编辑器与运行时共用）。
 */

/** Font Awesome 7.3.0 all.min.css（含 solid / regular / brands） */
export const FONT_AWESOME_CSS_HREF =
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.0/css/all.min.css";

const LINK_ID = "ext-27b96b-font-awesome";

/**
 * 确保页面已加载 Font Awesome CSS（幂等）。
 */
export function ensureFontAwesomeCss(): void {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(LINK_ID)) {
    return;
  }

  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = FONT_AWESOME_CSS_HREF;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}

/**
 * 规范化图标名：去前缀，仅保留如 `xmark` / `bag-shopping`。
 *
 * @param raw - 原始输入（可含 `fa-` / `fa-solid`）
 * @returns 规范化名；非法时空串
 */
export function normalizeFaIconName(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }

  let name = raw.trim().toLowerCase();

  if (name.length === 0) {
    return "";
  }

  name = name
    .replace(/^fa-(solid|regular|brands|classic)\s+/g, "")
    .replace(/^fas\s+/g, "")
    .replace(/^far\s+/g, "")
    .replace(/^fab\s+/g, "");

  const parts = name.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const icon = last.replace(/^fa-/, "").replace(/[^a-z0-9-]/g, "");

  return icon;
}

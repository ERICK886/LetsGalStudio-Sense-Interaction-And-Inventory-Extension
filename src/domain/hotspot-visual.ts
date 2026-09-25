/** 交互点视觉尺寸与无图占位样式的共享计算。 */
import type { HotspotElement } from "./types";
import type { ContentRect } from "../shared/scene-layout";

export const DEFAULT_HOTSPOT_SIZE = 64;
export const DEFAULT_PLACEHOLDER_COLOR = "#2EC4A4";
export const DEFAULT_PLACEHOLDER_OPACITY = 0.18;

/** 宽高比例分别以底图内容宽高为基准；无图时以宽度形成正方形。 */
export function hotspotDisplaySize(
  hotspot: HotspotElement,
  contentRect: ContentRect,
): { width: number; height: number } {
  const visual = hotspot.visual;
  const width = validSize(visual.widthRatio)
    ? visual.widthRatio * contentRect.width
    : validSize(visual.width)
      ? visual.width
      : DEFAULT_HOTSPOT_SIZE;
  const height = visual.src.trim() === ""
    ? width
    : validSize(visual.heightRatio)
      ? visual.heightRatio * contentRect.height
      : validSize(visual.height)
        ? visual.height
        : DEFAULT_HOTSPOT_SIZE;
  return { width, height };
}

/** 旧像素尺寸在背景区域确定后转换为比例，保留首次迁移时的画面大小。 */
export function normalizeHotspotSize(
  hotspot: HotspotElement,
  contentRect: Pick<ContentRect, "width" | "height">,
): HotspotElement {
  const visual = hotspot.visual;
  if (validSize(visual.widthRatio) && validSize(visual.heightRatio)) return hotspot;
  const { width, height, ...rest } = visual;
  return {
    ...hotspot,
    visual: {
      ...rest,
      widthRatio: validSize(visual.widthRatio)
        ? visual.widthRatio
        : (validSize(width) ? width : DEFAULT_HOTSPOT_SIZE) / Math.max(1e-6, contentRect.width),
      heightRatio: validSize(visual.heightRatio)
        ? visual.heightRatio
        : (validSize(height) ? height : DEFAULT_HOTSPOT_SIZE) / Math.max(1e-6, contentRect.height),
    },
  };
}

function validSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** 将无图颜色和独立透明度转为 CSS rgba。 */
export function placeholderBackground(visual: HotspotElement["visual"]): string {
  const color = /^#[0-9a-fA-F]{6}$/.test(visual.placeholderColor ?? "")
    ? visual.placeholderColor!
    : DEFAULT_PLACEHOLDER_COLOR;
  const opacity = typeof visual.placeholderOpacity === "number" && Number.isFinite(visual.placeholderOpacity)
    ? Math.min(1, Math.max(0, visual.placeholderOpacity))
    : DEFAULT_PLACEHOLDER_OPACITY;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function placeholderBorderRadius(visual: HotspotElement["visual"]): string | number {
  return visual.placeholderShape === "circle" ? "50%" : 0;
}

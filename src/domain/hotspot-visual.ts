/** 交互点视觉尺寸与无图占位样式的共享计算。 */
import type { HotspotElement } from "./types";
import type { ContentRect } from "../shared/scene-layout";
import { getHotspotImageSize, type ImageNaturalSize } from "../shared/hotspot-image-size";

export const DEFAULT_HOTSPOT_SIZE = 64;
export const DEFAULT_PLACEHOLDER_COLOR = "#2EC4A4";
export const DEFAULT_PLACEHOLDER_OPACITY = 0.18;

/** 宽高比例分别以底图内容宽高为基准；无图时以宽度形成正方形。 */
export function hotspotDisplaySize(
  hotspot: HotspotElement,
  contentRect: Pick<ContentRect, "width" | "height">,
  natural?: ImageNaturalSize,
): ImageNaturalSize {
  const visual = hotspot.visual;
  const pixels = {
    ...visual,
    width: validSize(visual.widthRatio) ? visual.widthRatio * contentRect.width : visual.width,
    height: validSize(visual.heightRatio) ? visual.heightRatio * contentRect.height : visual.height,
  };
  const size = getHotspotImageSize(pixels, natural);
  return visual.src.trim() === "" ? { width: size.width, height: size.width } : size;
}

/** 图片就绪后按实际显示大小迁移；加载失败时保留旧数据。 */
export function normalizeHotspotSize(
  hotspot: HotspotElement,
  contentRect: Pick<ContentRect, "width" | "height">,
  natural?: ImageNaturalSize,
): HotspotElement {
  const visual = hotspot.visual;
  if (validSize(visual.widthRatio) && validSize(visual.heightRatio)) return hotspot;
  if (!validSize(contentRect.width) || !validSize(contentRect.height)) return hotspot;
  if (visual.src.trim() !== "" && (!natural || !validSize(natural.width) || !validSize(natural.height))) return hotspot;
  const size = hotspotDisplaySize(hotspot, contentRect, natural);
  const { width, height, ...rest } = visual;
  return {
    ...hotspot,
    visual: {
      ...rest,
      widthRatio: size.width / contentRect.width,
      heightRatio: size.height / contentRect.height,
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

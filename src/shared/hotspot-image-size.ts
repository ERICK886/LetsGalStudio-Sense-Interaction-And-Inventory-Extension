import type { HotspotElement } from "../domain/types";

export interface ImageNaturalSize {
  width: number;
  height: number;
}

export const HOTSPOT_FALLBACK_SIZE = 64;

function validSize(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** 无尺寸时使用图片原尺寸；旧框按 contain 收紧，保持图片的显示大小和中心。 */
export function getHotspotImageSize(
  visual: HotspotElement["visual"],
  natural?: ImageNaturalSize,
): ImageNaturalSize {
  const hasWidth = validSize(visual.width);
  const hasHeight = validSize(visual.height);
  if (!visual.src || !natural || !validSize(natural.width) || !validSize(natural.height)) {
    return {
      width: hasWidth ? visual.width! : HOTSPOT_FALLBACK_SIZE,
      height: hasHeight ? visual.height! : HOTSPOT_FALLBACK_SIZE,
    };
  }
  const aspect = natural.width / natural.height;
  if (hasWidth && (!hasHeight || visual.width! / visual.height! <= aspect)) {
    return { width: visual.width!, height: visual.width! / aspect };
  }
  if (hasHeight) return { width: visual.height! * aspect, height: visual.height! };
  return { width: natural.width, height: natural.height };
}

/** 换图不沿用上一张图片或占位框的宽高；相同资源的手动尺寸保持不变。 */
export function resetSizeForHotspotImageChange(
  previous: HotspotElement["visual"],
  next: HotspotElement["visual"],
): HotspotElement["visual"] {
  return previous.src === next.src ? next : { kind: next.kind, src: next.src };
}

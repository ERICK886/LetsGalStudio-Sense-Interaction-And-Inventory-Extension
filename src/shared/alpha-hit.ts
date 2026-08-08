/**
 * alpha-hit.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * PNG 透明通道命中测试（精简版）：按像素 alpha 判断是否不透明。
 * 编辑器 / 运行时均可复用；采样失败时回退为「整框可点」。
 */

/** 默认 alpha 阈值（0~255）；低于此视为透明 */
export const ALPHA_HIT_THRESHOLD = 16;

/** ImageData 缓存；null 表示不可采样（跨域等） */
const imageDataCache = new Map<string, ImageData | null>();

/**
 * 读取 ImageData 某像素 alpha。
 *
 * @param data - ImageData
 * @param x - 像素 x（整数）
 * @param y - 像素 y（整数）
 * @returns 0~255；越界返回 0
 *
 * @example
 * readAlpha(imageData, 10, 20); // 255
 */
export function readAlpha(data: ImageData, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= data.width || y >= data.height) {
    return 0;
  }

  return data.data[(y * data.width + x) * 4 + 3] ?? 0;
}

/**
 * 从已加载的 HTMLImageElement 获取（或缓存）ImageData。
 *
 * @param img - 已 decode 的图片
 * @returns ImageData；不可采样时 null
 *
 * @throws 无（内部 catch 跨域 / canvas 异常并缓存 null）
 */
export function getImageDataCached(img: HTMLImageElement): ImageData | null {
  const key = img.currentSrc || img.src;

  if (!key) {
    return null;
  }

  if (imageDataCache.has(key)) {
    return imageDataCache.get(key) ?? null;
  }

  if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    return null;
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    if (ctx === null) {
      imageDataCache.set(key, null);

      return null;
    }

    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);

    imageDataCache.set(key, data);

    return data;
  } catch {
    imageDataCache.set(key, null);

    return null;
  }
}

/**
 * 判断图片自然像素坐标处是否不透明。
 *
 * - 传入 `ImageData`：直接读 `(x, y)` alpha
 * - 传入 `HTMLImageElement`：先取缓存 ImageData，再读像素
 * - 采样失败：返回 `true`（回退整框命中，避免误伤可点区域）
 *
 * @param img - HTMLImageElement 或 ImageData
 * @param x - 自然像素 X（或 ImageData 像素 X）
 * @param y - 自然像素 Y（或 ImageData 像素 Y）
 * @param threshold - alpha 阈值，默认 {@link ALPHA_HIT_THRESHOLD}
 * @returns true = 不透明（可命中）；false = 透明
 *
 * @example
 * ```ts
 * const opaque = isOpaqueAt(imgEl, 12, 34, 16);
 * if (!opaque) return; // 忽略透明点击
 * ```
 */
export function isOpaqueAt(
  img: HTMLImageElement | ImageData,
  x: number,
  y: number,
  threshold: number = ALPHA_HIT_THRESHOLD,
): boolean {
  const px = Math.floor(x);
  const py = Math.floor(y);

  if (typeof ImageData !== "undefined" && img instanceof ImageData) {
    return readAlpha(img, px, py) >= threshold;
  }

  const el = img as HTMLImageElement;
  const data = getImageDataCached(el);

  if (data === null) {
    return true;
  }

  return readAlpha(data, px, py) >= threshold;
}

/**
 * 测试用：清空 ImageData 缓存。
 */
export function clearAlphaHitCacheForTests(): void {
  imageDataCache.clear();
}

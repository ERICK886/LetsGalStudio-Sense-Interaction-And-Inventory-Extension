/**
 * alpha-hit.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * PNG 透明通道命中测试：object-fit:contain 坐标映射 + 剪影掩码。
 * 对齐大地图地点（ext-5f4afa）行为，供场景交互点预览/运行使用。
 *
 * 剪影规则（适合描边/挖空交互图）：
 * - 从图片四边洪水填充「与外缘连通的透明」→ 外部，不命中
 * - 不透明像素，以及被不透明围住的内部透明 → 命中
 *
 * 仅预览/运行使用；编辑器不启用。
 */

/** 默认 alpha 阈值（0~255）；低于此视为透明 */
export const ALPHA_HIT_THRESHOLD = 16;

/** ImageData 缓存；null 表示不可采样 */
const imageDataCache = new Map<string, ImageData | null>();

/** 剪影命中掩码缓存：1=命中，0=外部 */
const silhouetteMaskCache = new Map<string, Uint8Array | null>();

/**
 * object-fit: contain 时，内容图在盒子内的矩形（相对盒子左上，CSS px）。
 *
 * @param boxW - 盒子宽
 * @param boxH - 盒子高
 * @param natW - 图片固有宽
 * @param natH - 图片固有高
 * @returns 内容区 left/top/width/height；非法尺寸时 null
 *
 * @example
 * contentRectContain(100, 100, 200, 100);
 * // → { left: 0, top: 25, width: 100, height: 50 }
 */
export function contentRectContain(
  boxW: number,
  boxH: number,
  natW: number,
  natH: number,
): { left: number; top: number; width: number; height: number } | null {
  if (
    !(boxW > 0 && boxH > 0 && natW > 0 && natH > 0) ||
    !Number.isFinite(boxW) ||
    !Number.isFinite(boxH) ||
    !Number.isFinite(natW) ||
    !Number.isFinite(natH)
  ) {
    return null;
  }

  const scale = Math.min(boxW / natW, boxH / natH);
  const width = natW * scale;
  const height = natH * scale;

  return {
    left: (boxW - width) / 2,
    top: (boxH - height) / 2,
    width,
    height,
  };
}

/**
 * 将盒子内局部坐标映射到图片自然像素坐标（object-fit: contain）。
 *
 * @param localX - 相对盒子左边的 CSS px
 * @param localY - 相对盒子顶边的 CSS px
 * @param boxW - 盒子宽
 * @param boxH - 盒子高
 * @param natW - 图片固有宽
 * @param natH - 图片固有高
 * @returns 整数像素坐标；落在 letterbox / 越界时 null
 *
 * @example
 * mapContainLocalToImagePixel(50, 50, 100, 100, 200, 100);
 * // → { x: 100, y: 50 }
 */
export function mapContainLocalToImagePixel(
  localX: number,
  localY: number,
  boxW: number,
  boxH: number,
  natW: number,
  natH: number,
): { x: number; y: number } | null {
  const content = contentRectContain(boxW, boxH, natW, natH);

  if (content === null) {
    return null;
  }

  const u = (localX - content.left) / content.width;
  const v = (localY - content.top) / content.height;

  if (u < 0 || u > 1 || v < 0 || v > 1) {
    return null;
  }

  const x = Math.min(natW - 1, Math.max(0, Math.floor(u * natW)));
  const y = Math.min(natH - 1, Math.max(0, Math.floor(v * natH)));

  return { x, y };
}

/**
 * 读取 ImageData 某像素 alpha。
 *
 * @param data - ImageData
 * @param x - 像素 x
 * @param y - 像素 y
 * @returns 0~255；越界 0
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
 * 从边缘洪水填充，生成剪影命中掩码。
 * 与外缘连通的透明 = 0（不命中）；其余（含镂空内部）= 1（命中）。
 *
 * @param data - 图片像素
 * @param threshold - alpha 阈值
 * @returns 长度 width*height 的 0/1 掩码
 *
 * @example
 * ```ts
 * // 空心方框：边框与内部为 1，框外为 0
 * const mask = buildSilhouetteHitMask(imageData, 16);
 * ```
 */
export function buildSilhouetteHitMask(
  data: ImageData,
  threshold: number = ALPHA_HIT_THRESHOLD,
): Uint8Array {
  const w = data.width;
  const h = data.height;
  const n = w * h;
  const outside = new Uint8Array(n);
  const stack: number[] = [];

  /**
   * 尝试将透明像素标为「外部」并入栈。
   *
   * @param x - 像素 x
   * @param y - 像素 y
   */
  const tryPush = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) {
      return;
    }

    const i = y * w + x;

    if (outside[i] === 1) {
      return;
    }

    if (readAlpha(data, x, y) >= threshold) {
      return;
    }

    outside[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }

  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i / w) | 0;

    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  const mask = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    mask[i] = outside[i] === 1 ? 0 : 1;
  }

  return mask;
}

/**
 * 从已加载的 HTMLImageElement 获取（或缓存）ImageData。
 *
 * @param img - 已 decode 的图片
 * @returns ImageData 或 null（跨域 / 未加载完成时）
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
 * 获取剪影命中掩码（缓存）。
 *
 * @param img - 图片
 * @param threshold - alpha 阈值
 * @returns 掩码或 null
 */
function getSilhouetteMaskCached(
  img: HTMLImageElement,
  threshold: number,
): Uint8Array | null {
  const key = `${img.currentSrc || img.src}#${threshold}`;

  if (silhouetteMaskCache.has(key)) {
    return silhouetteMaskCache.get(key) ?? null;
  }

  const data = getImageDataCached(img);

  if (data === null) {
    silhouetteMaskCache.set(key, null);

    return null;
  }

  const mask = buildSilhouetteHitMask(data, threshold);

  silhouetteMaskCache.set(key, mask);

  return mask;
}

/**
 * 判断指针是否落在图片剪影内（含镂空内部；object-fit: contain）。
 *
 * @param img - 展示用 HTMLImageElement
 * @param clientX - 事件 clientX
 * @param clientY - 事件 clientY
 * @param threshold - alpha 阈值
 * @returns true = 命中；采样失败时 true（回退整框）
 *
 * @example
 * ```ts
 * if (!isOpaqueImageHit(imgEl, e.clientX, e.clientY)) {
 *   return; // 透明区：不拦截、不触发
 * }
 * ```
 */
export function isOpaqueImageHit(
  img: HTMLImageElement,
  clientX: number,
  clientY: number,
  threshold: number = ALPHA_HIT_THRESHOLD,
): boolean {
  const rect = img.getBoundingClientRect();

  if (rect.width <= 0 || rect.height <= 0) {
    return true;
  }

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const data = getImageDataCached(img);

  if (data === null) {
    return true;
  }

  const pixel = mapContainLocalToImagePixel(
    localX,
    localY,
    rect.width,
    rect.height,
    data.width,
    data.height,
  );

  if (pixel === null) {
    // 落在 contain 的 letterbox：算图片外部
    return false;
  }

  const mask = getSilhouetteMaskCached(img, threshold);

  if (mask === null) {
    return readAlpha(data, pixel.x, pixel.y) >= threshold;
  }

  return mask[pixel.y * data.width + pixel.x] === 1;
}

/**
 * 判断图片自然像素坐标处是否不透明（兼容旧 API / 单测）。
 *
 * - 传入 `ImageData`：直接读 `(x, y)` alpha
 * - 传入 `HTMLImageElement`：先取缓存 ImageData，再读像素
 * - 采样失败：返回 `true`（回退整框命中）
 *
 * 注意：镂空场景请优先使用 {@link isOpaqueImageHit}（剪影掩码）。
 *
 * @param img - HTMLImageElement 或 ImageData
 * @param x - 自然像素 X（或 ImageData 像素 X）
 * @param y - 自然像素 Y（或 ImageData 像素 Y）
 * @param threshold - alpha 阈值，默认 {@link ALPHA_HIT_THRESHOLD}
 * @returns true = 不透明（可命中）；false = 透明
 *
 * @example
 * const opaque = isOpaqueAt(imgEl, 12, 34, 16);
 */
/**
 * 是否为可采样的 ImageData / 类 ImageData（测试环境可能无真实 ImageData 实例）。
 *
 * @param value - 待检测值
 * @returns 结构上具备 width/height/data 时为 true
 */
function isImageDataLike(value: unknown): value is ImageData {
  if (typeof ImageData !== "undefined" && value instanceof ImageData) {
    return true;
  }

  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as { width?: unknown; height?: unknown; data?: unknown };

  return (
    typeof obj.width === "number" &&
    typeof obj.height === "number" &&
    obj.data instanceof Uint8ClampedArray
  );
}

export function isOpaqueAt(
  img: HTMLImageElement | ImageData,
  x: number,
  y: number,
  threshold: number = ALPHA_HIT_THRESHOLD,
): boolean {
  const px = Math.floor(x);
  const py = Math.floor(y);

  if (isImageDataLike(img)) {
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
 * 测试用：清空 ImageData / 剪影掩码缓存。
 */
export function clearAlphaHitCacheForTests(): void {
  imageDataCache.clear();
  silhouetteMaskCache.clear();
}

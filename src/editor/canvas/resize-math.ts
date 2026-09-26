/**
 * resize-math.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 边框拖拽纯函数：对边/对角固定，角默认锁宽高比，Shift 解锁。
 * 对齐大地图系统 resize-math 语义。
 */

/**
 * 八向手柄 id。
 */
export type ResizeHandleId =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

/**
 * 以中心锚点表示的 CSS 像素盒。
 */
export interface ResizeBox {
  width: number;
  height: number;
  centerLeft: number;
  centerTop: number;
}

/**
 * applyResizeDrag 入参。
 */
export interface ApplyResizeDragArgs {
  handle: ResizeHandleId;
  /** 拖拽开始时的盒 */
  start: ResizeBox;
  /** 相对按下点的指针位移（CSS px） */
  dx: number;
  dy: number;
  /**
   * 是否锁定宽高比。
   * 角手柄：true=等比；边手柄忽略（始终单轴）。
   */
  lockAspect: boolean;
  /** 指定图片比例时，八个手柄均保持该比例。 */
  aspectRatio?: number;
  minWidth: number;
  minHeight: number;
}

/**
 * 是否为角手柄。
 *
 * @param handle - 手柄 id
 * @returns 角则为 true
 */
export function isCornerHandle(handle: ResizeHandleId): boolean {
  return (
    handle === "ne" ||
    handle === "nw" ||
    handle === "se" ||
    handle === "sw"
  );
}

/**
 * 从边缘重建中心锚点盒，并钳制最小尺寸。
 *
 * @param left - 左
 * @param top - 上
 * @param right - 右
 * @param bottom - 下
 * @param minWidth - 最小宽
 * @param minHeight - 最小高
 * @returns ResizeBox
 */
function boxFromEdges(
  left: number,
  top: number,
  right: number,
  bottom: number,
  minWidth: number,
  minHeight: number,
): ResizeBox {
  let l = left;
  let r = right;
  let t = top;
  let b = bottom;

  if (r - l < minWidth) {
    r = l + minWidth;
  }

  if (b - t < minHeight) {
    b = t + minHeight;
  }

  const width = r - l;
  const height = b - t;

  return {
    width,
    height,
    centerLeft: l + width / 2,
    centerTop: t + height / 2,
  };
}

/**
 * 根据手柄与位移计算新盒（对边/对角固定）。
 *
 * @param args - 见 {@link ApplyResizeDragArgs}
 * @returns 新 ResizeBox
 *
 * @example
 * ```ts
 * applyResizeDrag({
 *   handle: "se",
 *   start: { width: 100, height: 50, centerLeft: 100, centerTop: 100 },
 *   dx: 20, dy: 10,
 *   lockAspect: true,
 *   minWidth: 8, minHeight: 8,
 * });
 * ```
 */
export function applyResizeDrag(args: ApplyResizeDragArgs): ResizeBox {
  const { handle, start, dx, dy, lockAspect, minWidth, minHeight } = args;
  const fixedAspect = args.aspectRatio !== undefined && Number.isFinite(args.aspectRatio) && args.aspectRatio > 0
    ? args.aspectRatio : undefined;

  const halfW = start.width / 2;
  const halfH = start.height / 2;
  let left = start.centerLeft - halfW;
  let right = start.centerLeft + halfW;
  let top = start.centerTop - halfH;
  let bottom = start.centerTop + halfH;

  const moveE = handle === "e" || handle === "ne" || handle === "se";
  const moveW = handle === "w" || handle === "nw" || handle === "sw";
  const moveS = handle === "s" || handle === "se" || handle === "sw";
  const moveN = handle === "n" || handle === "ne" || handle === "nw";

  if (moveE) {
    right += dx;
  }

  if (moveW) {
    left += dx;
  }

  if (moveS) {
    bottom += dy;
  }

  if (moveN) {
    top += dy;
  }

  if (!isCornerHandle(handle)) {
    if (handle === "e" || handle === "w") {
      top = start.centerTop - halfH;
      bottom = start.centerTop + halfH;
    } else {
      left = start.centerLeft - halfW;
      right = start.centerLeft + halfW;
    }
  }

  if (!isCornerHandle(handle) && fixedAspect !== undefined) {
    if (moveE || moveW) {
      const newW = Math.max(minWidth, minHeight * fixedAspect, right - left);
      if (moveW) left = right - newW;
      else right = left + newW;
      top = start.centerTop - newW / fixedAspect / 2;
      bottom = start.centerTop + newW / fixedAspect / 2;
    } else {
      const newH = Math.max(minHeight, minWidth / fixedAspect, bottom - top);
      if (moveN) top = bottom - newH;
      else bottom = top + newH;
      left = start.centerLeft - newH * fixedAspect / 2;
      right = start.centerLeft + newH * fixedAspect / 2;
    }
  }

  if (isCornerHandle(handle) && (lockAspect || fixedAspect !== undefined) && start.width > 0 && start.height > 0) {
    const aspect = fixedAspect ?? start.width / start.height;
    let newW = Math.max(minWidth, right - left);
    let newH = Math.max(minHeight, bottom - top);

    const wantW = Math.abs(newW - start.width) >= Math.abs(newH - start.height);

    if (wantW) {
      newH = newW / aspect;
    } else {
      newW = newH * aspect;
    }

    newW = Math.max(minWidth, minHeight * aspect, newW);
    newH = newW / aspect;

    if (handle === "se") {
      right = left + newW;
      bottom = top + newH;
    } else if (handle === "sw") {
      left = right - newW;
      bottom = top + newH;
    } else if (handle === "ne") {
      right = left + newW;
      top = bottom - newH;
    } else {
      left = right - newW;
      top = bottom - newH;
    }
  }

  if (right - left < minWidth) {
    if (moveW && !moveE) {
      left = right - minWidth;
    } else {
      right = left + minWidth;
    }
  }

  if (bottom - top < minHeight) {
    if (moveN && !moveS) {
      top = bottom - minHeight;
    } else {
      bottom = top + minHeight;
    }
  }

  return boxFromEdges(left, top, right, bottom, minWidth, minHeight);
}

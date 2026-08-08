/**
 * dom-coords.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 将浏览器 client 坐标换算为元素「布局 CSS 像素」（不受 CSS transform 缩放影响）。
 * 用于 overlay 挂在 scale 后的设计画幅内时的拖拽 / 缩放。
 */

/**
 * client → 相对 el 左上角的布局坐标（el.offsetWidth/Height 空间）。
 *
 * @param el - 参考元素（如 overlay 根、设计画幅）
 * @param clientX - PointerEvent.clientX
 * @param clientY - PointerEvent.clientY
 * @returns `{ x, y }` 布局 CSS px
 *
 * @example
 * ```ts
 * const { x, y } = clientToLocal(overlayEl, ev.clientX, ev.clientY);
 * ```
 */
export function clientToLocal(
  el: HTMLElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const rw = Math.max(1e-6, rect.width);
  const rh = Math.max(1e-6, rect.height);
  const lx = el.offsetWidth;
  const ly = el.offsetHeight;

  return {
    x: ((clientX - rect.left) / rw) * lx,
    y: ((clientY - rect.top) / rh) * ly,
  };
}

/**
 * 屏幕像素增量 → 布局像素增量（按 el 当前缩放）。
 *
 * @param el - 参考元素
 * @param screenDx - 屏幕 ΔX
 * @param screenDy - 屏幕 ΔY
 * @returns 布局 Δ
 */
export function screenDeltaToLocal(
  el: HTMLElement,
  screenDx: number,
  screenDy: number,
): { dx: number; dy: number } {
  const rect = el.getBoundingClientRect();
  const sx = el.offsetWidth / Math.max(1e-6, rect.width);
  const sy = el.offsetHeight / Math.max(1e-6, rect.height);

  return {
    dx: screenDx * sx,
    dy: screenDy * sy,
  };
}

/**
 * 将「屏幕空间相对 overlay 的盒」换成布局空间盒。
 *
 * @param overlay - overlay 根
 * @param screenBox - getBoundingClientRect 差值得到的盒（宽高/中心为屏幕 px）
 * @returns 布局空间盒
 */
export function screenBoxToLocal(
  overlay: HTMLElement,
  screenBox: {
    width: number;
    height: number;
    centerLeft: number;
    centerTop: number;
  },
): {
  width: number;
  height: number;
  centerLeft: number;
  centerTop: number;
} {
  const rect = overlay.getBoundingClientRect();
  const sx = overlay.offsetWidth / Math.max(1e-6, rect.width);
  const sy = overlay.offsetHeight / Math.max(1e-6, rect.height);

  return {
    width: screenBox.width * sx,
    height: screenBox.height * sy,
    centerLeft: screenBox.centerLeft * sx,
    centerTop: screenBox.centerTop * sy,
  };
}

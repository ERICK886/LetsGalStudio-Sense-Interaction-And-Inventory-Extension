/**
 * free-layout-selection.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 自由布局编辑器纯逻辑：边缘吸附、拖拽（Shift 锁轴）、八向 resize。
 * 供 HUD / 背包可视化画布复用，不含 React 依赖。
 */

import type { UiRect } from "../../domain/types";

/** 八向 resize 手柄 id。 */
export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** 默认吸附阈值（设计像素）。 */
const DEFAULT_SNAP_THRESHOLD = 4;

/** 默认 resize 最小宽/高（设计像素）。 */
const DEFAULT_MIN_W = 24;
const DEFAULT_MIN_H = 24;

/**
 * 将数值吸附到最近的目标边缘。
 *
 * 在 threshold 范围内选取距离最小的 target；若无匹配则返回原值。
 *
 * @param value - 当前坐标或边缘值
 * @param targets - 可对齐的目标值列表（如其它节点左/右/上/下边）
 * @param threshold - 吸附半径，默认 4
 * @returns 吸附后的值，或原 value
 *
 * @example
 * ```ts
 * snapEdges(102, [100]); // 100
 * snapEdges(106, [100]); // 106
 * ```
 */
export function snapEdges(
  value: number,
  targets: number[],
  threshold: number = DEFAULT_SNAP_THRESHOLD,
): number {
  let bestTarget: number | null = null;
  let bestDistance = threshold + 1;

  for (const target of targets) {
    const distance = Math.abs(value - target);

    if (distance <= threshold && distance < bestDistance) {
      bestTarget = target;
      bestDistance = distance;
    }
  }

  return bestTarget ?? value;
}

/**
 * applyDrag 选项。
 */
export interface ApplyDragOptions {
  /** 为 true 时仅保留 |dx| 与 |dy| 较大的一轴位移 */
  shiftKey: boolean;

  /** 可选：x 方向吸附目标 */
  snapX?: number[];

  /** 可选：y 方向吸附目标 */
  snapY?: number[];
}

/**
 * 根据指针位移计算拖拽后的位置。
 *
 * Shift 锁轴规则：|dx| >= |dy| 时仅水平移动，否则仅垂直移动。
 * 吸附在锁轴之后分别作用于 x / y。
 *
 * @param origin - 拖拽起点 { x, y }
 * @param dx - 水平位移（设计像素）
 * @param dy - 垂直位移（设计像素）
 * @param opts - shiftKey 与可选 snap 目标
 * @returns 新位置 { x, y }
 *
 * @example
 * ```ts
 * applyDrag({ x: 0, y: 0 }, 10, 3, { shiftKey: true }); // { x: 10, y: 0 }
 * ```
 */
export function applyDrag(
  origin: { x: number; y: number },
  dx: number,
  dy: number,
  opts: ApplyDragOptions,
): { x: number; y: number } {
  let moveX = dx;
  let moveY = dy;

  if (opts.shiftKey) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      moveY = 0;
    } else {
      moveX = 0;
    }
  }

  let x = origin.x + moveX;
  let y = origin.y + moveY;

  if (opts.snapX && opts.snapX.length > 0) {
    x = snapEdges(x, opts.snapX);
  }

  if (opts.snapY && opts.snapY.length > 0) {
    y = snapEdges(y, opts.snapY);
  }

  return { x, y };
}

/**
 * 判断手柄是否影响西侧（左缘 / 宽度）。
 *
 * @param handle - resize 手柄
 * @returns 西向则为 true
 */
function movesWest(handle: ResizeHandle): boolean {
  return handle === "w" || handle === "nw" || handle === "sw";
}

/**
 * 判断手柄是否影响东侧（右缘 / 宽度）。
 *
 * @param handle - resize 手柄
 * @returns 东向则为 true
 */
function movesEast(handle: ResizeHandle): boolean {
  return handle === "e" || handle === "ne" || handle === "se";
}

/**
 * 判断手柄是否影响北侧（上缘 / 高度）。
 *
 * @param handle - resize 手柄
 * @returns 北向则为 true
 */
function movesNorth(handle: ResizeHandle): boolean {
  return handle === "n" || handle === "ne" || handle === "nw";
}

/**
 * 判断手柄是否影响南侧（下缘 / 高度）。
 *
 * @param handle - resize 手柄
 * @returns 南向则为 true
 */
function movesSouth(handle: ResizeHandle): boolean {
  return handle === "s" || handle === "se" || handle === "sw";
}

/**
 * 根据手柄与位移计算 resize 后的 UiRect。
 *
 * 对边固定：拖西缘时东缘不动，拖北缘时南缘不动。
 * 宽/高低于 minSize 时钳制，并保持未拖拽的对边位置。
 *
 * @param origin - 拖拽开始时的完整矩形（必含 w/h）
 * @param handle - 八向手柄
 * @param dx - 水平位移（设计像素）
 * @param dy - 垂直位移（设计像素）
 * @param minSize - 最小宽/高，默认 24×24
 * @returns 新矩形
 *
 * @example
 * ```ts
 * applyResize({ x: 100, y: 100, w: 100, h: 80 }, "se", 20, 10);
 * ```
 */
export function applyResize(
  origin: Required<UiRect>,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minSize: { w: number; h: number } = { w: DEFAULT_MIN_W, h: DEFAULT_MIN_H },
): Required<UiRect> {
  const minW = minSize.w;
  const minH = minSize.h;

  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.w;
  let bottom = origin.y + origin.h;

  if (movesEast(handle)) {
    right += dx;
  }

  if (movesWest(handle)) {
    left += dx;
  }

  if (movesSouth(handle)) {
    bottom += dy;
  }

  if (movesNorth(handle)) {
    top += dy;
  }

  if (right - left < minW) {
    if (movesWest(handle) && !movesEast(handle)) {
      left = right - minW;
    } else {
      right = left + minW;
    }
  }

  if (bottom - top < minH) {
    if (movesNorth(handle) && !movesSouth(handle)) {
      top = bottom - minH;
    } else {
      bottom = top + minH;
    }
  }

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

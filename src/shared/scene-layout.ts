/**
 * scene-layout.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 场景画布纯布局：设计画幅 fit 进宿主 + 底图 contentRect。
 * 同一套数字驱动底图 CSS transform 与 hotspot overlay，避免错位。
 */

import { containInWorld } from "../domain/design-resolution";
import type { SceneBaseImageFit } from "../domain/types";

/** 编辑器外层 fit 留白（便于看到画框边缘） */
export const SCENE_FIT_MARGIN_EDITOR = 0.92;

/**
 * 归一化参照矩形（底图在设计画幅内的矩形；无图时=整幅设计）。
 */
export interface ContentRect {
  /** 相对设计画幅左上的原点 X（设计像素） */
  originX: number;

  /** 相对设计画幅左上的原点 Y（设计像素） */
  originY: number;

  /** 内容区宽度（设计像素） */
  width: number;

  /** 内容区高度（设计像素） */
  height: number;
}

/**
 * 设计画幅在宿主内的均匀缩放 + 平移（transform-origin: 0 0）。
 */
export interface WorldTransform {
  /** 均匀缩放 */
  scale: number;

  /** 相对宿主左上的平移 X（CSS px） */
  offsetX: number;

  /** 相对宿主左上的平移 Y（CSS px） */
  offsetY: number;
}

/**
 * 完整场景布局快照（一帧）。
 */
export interface SceneLayout {
  /** 宿主宽 */
  hostW: number;

  /** 宿主高 */
  hostH: number;

  /** 设计宽 */
  designW: number;

  /** 设计高 */
  designH: number;

  /** 设计画幅 → 宿主 */
  world: WorldTransform;

  /** 归一化参照（底图在设计画幅内） */
  contentRect: ContentRect;
}

/**
 * 将设计画幅 contain 进宿主（居中，略留边）。
 *
 * @param hostW - 宿主宽（CSS px）
 * @param hostH - 宿主高
 * @param designW - 设计宽
 * @param designH - 设计高
 * @param margin - 留边系数，默认 {@link SCENE_FIT_MARGIN_EDITOR}
 * @returns WorldTransform
 *
 * @example
 * fitDesignToHost(800, 600, 1920, 1080);
 */
export function fitDesignToHost(
  hostW: number,
  hostH: number,
  designW: number,
  designH: number,
  margin: number = SCENE_FIT_MARGIN_EDITOR,
): WorldTransform {
  const vw = Math.max(1, hostW);
  const vh = Math.max(1, hostH);
  const cw = Math.max(1, designW);
  const ch = Math.max(1, designH);
  const m = Number.isFinite(margin) && margin > 0 ? margin : 1;
  const scale = Math.min(vw / cw, vh / ch) * m;

  return {
    scale,
    offsetX: (vw - cw * scale) / 2,
    offsetY: (vh - ch * scale) / 2,
  };
}

/**
 * 由底图自然尺寸计算 contentRect；无有效尺寸时回退整幅设计画幅。
 *
 * @param designW - 设计宽
 * @param designH - 设计高
 * @param imageW - 底图自然宽；≤0 表示无图
 * @param imageH - 底图自然高
 * @returns ContentRect
 */
export function contentRectForBase(
  designW: number,
  designH: number,
  imageW: number,
  imageH: number,
  fit: SceneBaseImageFit = "contain",
): ContentRect {
  const dw = Math.max(1, designW);
  const dh = Math.max(1, designH);

  if (!(imageW > 0) || !(imageH > 0)) {
    return { originX: 0, originY: 0, width: dw, height: dh };
  }

  const layout = fit === "cover"
    ? (() => {
        const scale = Math.max(dw / imageW, dh / imageH);
        const width = imageW * scale;
        const height = imageH * scale;
        return { x: (dw - width) / 2, y: (dh - height) / 2, width, height };
      })()
    : containInWorld(dw, dh, imageW, imageH);

  return {
    originX: layout.x,
    originY: layout.y,
    width: layout.width,
    height: layout.height,
  };
}

/**
 * 组装一帧 SceneLayout。
 *
 * @param hostW - 宿主宽
 * @param hostH - 宿主高
 * @param designW - 设计宽
 * @param designH - 设计高
 * @param imageW - 底图自然宽；无图传 0
 * @param imageH - 底图自然高
 * @param margin - fit 留白系数
 * @returns SceneLayout
 */
export function buildSceneLayout(
  hostW: number,
  hostH: number,
  designW: number,
  designH: number,
  imageW: number,
  imageH: number,
  margin: number = SCENE_FIT_MARGIN_EDITOR,
  fit: SceneBaseImageFit = "contain",
): SceneLayout {
  const dw = Math.max(1, designW);
  const dh = Math.max(1, designH);

  return {
    hostW: Math.max(1, hostW),
    hostH: Math.max(1, hostH),
    designW: dw,
    designH: dh,
    world: fitDesignToHost(hostW, hostH, dw, dh, margin),
    contentRect: contentRectForBase(dw, dh, imageW, imageH, fit),
  };
}

/**
 * 归一化坐标 → 设计画幅布局像素（相对 contentRect）。
 *
 * @param x - 归一化 X（0~1）
 * @param y - 归一化 Y（0~1）
 * @param contentRect - 内容矩形
 * @returns `{ x, y }` 设计像素（相对设计画幅左上）
 */
export function normToWorld(
  x: number,
  y: number,
  contentRect: ContentRect,
): { x: number; y: number } {
  return {
    x: contentRect.originX + x * contentRect.width,
    y: contentRect.originY + y * contentRect.height,
  };
}

/**
 * 设计画幅布局像素 → 归一化坐标（相对 contentRect，钳制到 0~1）。
 *
 * @param x - 设计像素 X
 * @param y - 设计像素 Y
 * @param contentRect - 内容矩形
 * @returns `{ x, y }` 归一化坐标
 */
export function worldToNorm(
  x: number,
  y: number,
  contentRect: ContentRect,
): { x: number; y: number } {
  const w = Math.max(1e-6, contentRect.width);
  const h = Math.max(1e-6, contentRect.height);
  const nx = (x - contentRect.originX) / w;
  const ny = (y - contentRect.originY) / h;

  return {
    x: Math.min(1, Math.max(0, nx)),
    y: Math.min(1, Math.max(0, ny)),
  };
}

/**
 * 将浏览器 client 坐标转为相对某元素左上的布局坐标（不受 CSS transform 缩放影响）。
 *
 * 使用「布局尺寸 / 可视 getBoundingClientRect 尺寸」比例换算，
 * 不解析 `matrix` / `matrix3d` 字符串（后者在部分浏览器下会导致 scale=1，
 * 放置/拖拽交互点相对指针整体偏移）。
 *
 * @param el - 参考元素（通常为 world 节点）
 * @param clientX - 浏览器 clientX
 * @param clientY - 浏览器 clientY
 * @returns 本地坐标（相对 el 未缩放盒子，即 offsetWidth/Height 空间）
 *
 * @example
 * ```ts
 * const { x, y } = clientToLocal(worldEl, ev.clientX, ev.clientY);
 * const norm = worldToNorm(x, y, layout.contentRect);
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

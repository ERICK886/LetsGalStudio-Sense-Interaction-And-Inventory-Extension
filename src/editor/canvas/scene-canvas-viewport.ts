import { clientToLocal } from "../../shared/dom-coords";
import type { SceneLayout } from "../../shared/scene-layout";

/** 仅用于编辑器视图，不写入场景数据；1 表示适应画布。 */
export interface SceneCanvasViewport { zoom: number; panX: number; panY: number; }
export const FIT_SCENE_VIEWPORT: SceneCanvasViewport = { zoom: 1, panX: 0, panY: 0 };
export const MIN_SCENE_ZOOM = 0.25;
export const MAX_SCENE_ZOOM = 8;

export function applySceneViewport(layout: SceneLayout, view: SceneCanvasViewport): SceneLayout {
  const centerX = layout.hostW / 2;
  const centerY = layout.hostH / 2;
  return { ...layout, world: {
    scale: layout.world.scale * view.zoom,
    offsetX: centerX + (layout.world.offsetX - centerX) * view.zoom + view.panX,
    offsetY: centerY + (layout.world.offsetY - centerY) * view.zoom + view.panY,
  } };
}

/** 保持鼠标下的设计坐标不动，包括已平移及宿主外层缩放的情况。 */
export function zoomSceneAt(
  view: SceneCanvasViewport, point: { x: number; y: number },
  host: { width: number; height: number }, deltaY: number, deltaMode: number,
): SceneCanvasViewport {
  if (!Number.isFinite(deltaY) || deltaY === 0) return view;
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? host.height : 1;
  const pixels = Math.max(-240, Math.min(240, deltaY * unit));
  const zoom = Math.max(MIN_SCENE_ZOOM, Math.min(MAX_SCENE_ZOOM, view.zoom * Math.exp(-pixels * 0.002)));
  if (zoom === view.zoom) return view;
  const ratio = zoom / view.zoom;
  return {
    zoom,
    panX: point.x - host.width / 2 - (point.x - host.width / 2 - view.panX) * ratio,
    panY: point.y - host.height / 2 - (point.y - host.height / 2 - view.panY) * ratio,
  };
}

/** 使用非 passive 原生事件阻止宿主页面缩放；中键平移不传给交互点。 */
export function bindSceneViewportGestures(
  host: HTMLElement, eventWindow: Window,
  options: {
    getView(): SceneCanvasViewport;
    getLayout(): SceneLayout;
    isEnabled(): boolean;
    onChange(view: SceneCanvasViewport): void;
    onPanning(value: boolean): void;
  },
): () => void {
  const activePointers = new Set<number>();
  let pan: { id: number; start: { x: number; y: number }; view: SceneCanvasViewport } | null = null;
  const inControls = (event: Event): boolean => Boolean(
    (event.target as Element | null)?.closest?.('[data-testid="scene-canvas-view-controls"]'),
  );
  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey || !options.isEnabled() || inControls(event)) return;
    event.preventDefault();
    event.stopPropagation();
    // 拖动中改变视图会打破尺寸手柄的起点坐标，松手后再允许缩放。
    if (activePointers.size > 0) return;
    const layout = options.getLayout();
    options.onChange(zoomSceneAt(options.getView(), clientToLocal(host, event.clientX, event.clientY),
      { width: layout.hostW, height: layout.hostH }, event.deltaY, event.deltaMode));
  };
  const onDown = (event: PointerEvent): void => {
    if (!options.isEnabled() || inControls(event)) return;
    if (event.button !== 1) { activePointers.add(event.pointerId); return; }
    event.preventDefault();
    event.stopPropagation();
    if (activePointers.size > 0) return;
    activePointers.add(event.pointerId);
    pan = { id: event.pointerId, start: clientToLocal(host, event.clientX, event.clientY), view: options.getView() };
    try { host.setPointerCapture(event.pointerId); } catch { /* window 事件仍可结束平移 */ }
    options.onPanning(true);
  };
  const onMove = (event: PointerEvent): void => {
    if (!pan || pan.id !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = clientToLocal(host, event.clientX, event.clientY);
    options.onChange({ ...pan.view,
      panX: pan.view.panX + point.x - pan.start.x,
      panY: pan.view.panY + point.y - pan.start.y,
    });
  };
  const onUp = (event: PointerEvent): void => {
    activePointers.delete(event.pointerId);
    if (!pan || pan.id !== event.pointerId) return;
    try { host.releasePointerCapture(pan.id); } catch { /* 已释放 */ }
    pan = null;
    options.onPanning(false);
  };
  const onBlur = (): void => {
    activePointers.clear();
    if (pan) {
      try { host.releasePointerCapture(pan.id); } catch { /* 已释放 */ }
      pan = null;
      options.onPanning(false);
    }
  };
  const capture = { capture: true };
  host.addEventListener("wheel", onWheel, { passive: false, ...capture });
  host.addEventListener("pointerdown", onDown, capture);
  eventWindow.addEventListener("pointermove", onMove, capture);
  eventWindow.addEventListener("pointerup", onUp, capture);
  eventWindow.addEventListener("pointercancel", onUp, capture);
  eventWindow.addEventListener("blur", onBlur);
  return () => {
    host.removeEventListener("wheel", onWheel, capture);
    host.removeEventListener("pointerdown", onDown, capture);
    eventWindow.removeEventListener("pointermove", onMove, capture);
    eventWindow.removeEventListener("pointerup", onUp, capture);
    eventWindow.removeEventListener("pointercancel", onUp, capture);
    eventWindow.removeEventListener("blur", onBlur);
    if (pan) { try { host.releasePointerCapture(pan.id); } catch { /* 已释放 */ } }
  };
}

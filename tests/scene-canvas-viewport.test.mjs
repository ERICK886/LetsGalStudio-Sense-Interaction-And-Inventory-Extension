import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function load(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}
const { applySceneViewport, zoomSceneAt, bindSceneViewportGestures, FIT_SCENE_VIEWPORT } =
  await load("../src/editor/canvas/scene-canvas-viewport.ts");
const { buildSceneLayout, normToWorld, worldToNorm, clientToLocal } = await load("../src/shared/scene-layout.ts");
const { screenDeltaToLocal } = await load("../src/shared/dom-coords.ts");
const { applyResizeDrag } = await load("../src/editor/canvas/resize-math.ts");
const base = buildSceneLayout(1200, 800, 1920, 1080, 704, 1408);
const hostSize = { width: 1200, height: 800 };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("围绕鼠标缩放底图和交互点，往返后保持原位置、尺寸和内容坐标", () => {
  const initial = { zoom: 1.8, panX: 90, panY: -45 };
  const cursor = { x: 220, y: 610 };
  const before = applySceneViewport(base, initial);
  const worldPoint = {
    x: (cursor.x - before.world.offsetX) / before.world.scale,
    y: (cursor.y - before.world.offsetY) / before.world.scale,
  };
  const nextView = zoomSceneAt(initial, cursor, hostSize, -120, 0);
  const next = applySceneViewport(base, nextView);
  close(worldPoint.x * next.world.scale + next.world.offsetX, cursor.x);
  close(worldPoint.y * next.world.scale + next.world.offsetY, cursor.y);
  assert.equal(next.contentRect, base.contentRect);
  assert.equal(next.designW, base.designW);
  const restored = applySceneViewport(base, zoomSceneAt(nextView, cursor, hostSize, 120, 0));
  close(restored.world.scale, before.world.scale);
  close(restored.world.offsetX, before.world.offsetX);
  close(restored.world.offsetY, before.world.offsetY);
  assert.deepEqual(applySceneViewport(base, FIT_SCENE_VIEWPORT), base);
});

test("缩放限制为 25%～800%，兼容像素、行和页滚轮", () => {
  const cursor = { x: 500, y: 400 };
  assert.deepEqual(zoomSceneAt(FIT_SCENE_VIEWPORT, cursor, hostSize, 5, 1),
    zoomSceneAt(FIT_SCENE_VIEWPORT, cursor, hostSize, 80, 0));
  assert.deepEqual(zoomSceneAt(FIT_SCENE_VIEWPORT, cursor, hostSize, 1, 2),
    zoomSceneAt(FIT_SCENE_VIEWPORT, cursor, hostSize, 800, 0));
  let view = FIT_SCENE_VIEWPORT;
  for (let i = 0; i < 100; i++) view = zoomSceneAt(view, cursor, hostSize, -120, 0);
  assert.equal(view.zoom, 8);
  assert.equal(zoomSceneAt(view, cursor, hostSize, -120, 0), view);
  for (let i = 0; i < 100; i++) view = zoomSceneAt(view, cursor, hostSize, 120, 0);
  assert.equal(view.zoom, 0.25);
  assert.equal(zoomSceneAt(view, cursor, hostSize, NaN, 0), view);
});

test("外层 Studio 预览缩放后，放置、拖拽、调整宽高仍换算到设计像素", () => {
  const layout = applySceneViewport(base, { zoom: 3, panX: 150, panY: -75 });
  const parentScale = 0.5;
  const world = {
    offsetWidth: layout.designW, offsetHeight: layout.designH,
    getBoundingClientRect: () => ({
      left: 50 + layout.world.offsetX * parentScale, top: 80 + layout.world.offsetY * parentScale,
      width: layout.designW * layout.world.scale * parentScale,
      height: layout.designH * layout.world.scale * parentScale,
    }),
  };
  const rect = world.getBoundingClientRect();
  const point = normToWorld(0.4, 0.6, layout.contentRect);
  const local = clientToLocal(world,
    rect.left + point.x * layout.world.scale * parentScale,
    rect.top + point.y * layout.world.scale * parentScale);
  const placed = worldToNorm(local.x, local.y, layout.contentRect);
  close(placed.x, 0.4); close(placed.y, 0.6);
  const delta = screenDeltaToLocal(world, 30 * layout.world.scale * parentScale, 20 * layout.world.scale * parentScale);
  close(delta.dx, 30); close(delta.dy, 20);
  const moved = worldToNorm(local.x + delta.dx, local.y + delta.dy, layout.contentRect);
  close(moved.x, 0.4 + 30 / layout.contentRect.width);
  close(moved.y, 0.6 + 20 / layout.contentRect.height);
  const resized = applyResizeDrag({ handle: "e", start: { width: 100, height: 200, centerLeft: 500, centerTop: 500 },
    ...delta, lockAspect: false, minWidth: 8, minHeight: 8 });
  close(resized.width, 130); close(resized.height, 200);
});

function gestureFixture() {
  const host = new EventTarget();
  Object.assign(host, { offsetWidth: 1200, offsetHeight: 800,
    getBoundingClientRect: () => ({ left: 50, top: 80, width: 600, height: 400 }),
    setPointerCapture: () => {}, releasePointerCapture: () => {},
  });
  const win = new EventTarget();
  let view = FIT_SCENE_VIEWPORT;
  let panning = false;
  let enabled = true;
  const dispose = bindSceneViewportGestures(host, win, {
    getView: () => view, getLayout: () => base, isEnabled: () => enabled,
    onChange: (next) => { view = next; }, onPanning: (next) => { panning = next; },
  });
  const fire = (target, type, data = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { clientX: 200, clientY: 180, pointerId: 1, button: 0,
      deltaY: -120, deltaMode: 0, ctrlKey: false, ...data });
    target.dispatchEvent(event);
    return event;
  };
  return { host, win, fire, dispose, getView: () => view, isPanning: () => panning, disable: () => { enabled = false; } };
}

test("仅画布内 Ctrl 滚轮被拦截，连续滚轮累积缩放，编辑拖动中暂停缩放", () => {
  const f = gestureFixture();
  assert.equal(f.fire(f.host, "wheel").defaultPrevented, false);
  assert.equal(f.getView(), FIT_SCENE_VIEWPORT);
  assert.equal(f.fire(f.host, "wheel", { ctrlKey: true }).defaultPrevented, true);
  const once = f.getView();
  f.fire(f.host, "wheel", { ctrlKey: true });
  close(f.getView().zoom, once.zoom ** 2);
  const twice = f.getView();
  f.fire(f.host, "pointerdown");
  f.fire(f.host, "wheel", { ctrlKey: true });
  assert.equal(f.getView(), twice);
  f.fire(f.win, "pointerup");
  f.fire(f.host, "wheel", { ctrlKey: true });
  assert.ok(f.getView().zoom > twice.zoom);
  f.disable();
  assert.equal(f.fire(f.host, "wheel", { ctrlKey: true }).defaultPrevented, false);
  f.dispose();
});

test("中键按宿主布局像素平移，取消、失焦和卸载均结束会话", () => {
  const f = gestureFixture();
  assert.equal(f.fire(f.host, "pointerdown", { button: 1 }).defaultPrevented, true);
  assert.equal(f.isPanning(), true);
  f.fire(f.win, "pointermove", { clientX: 250, clientY: 205 });
  assert.deepEqual(f.getView(), { zoom: 1, panX: 100, panY: 50 });
  f.fire(f.win, "pointercancel");
  assert.equal(f.isPanning(), false);
  const moved = f.getView();
  f.fire(f.win, "pointermove", { clientX: 350 });
  assert.equal(f.getView(), moved);
  f.fire(f.host, "pointerdown", { button: 1 });
  f.fire(f.win, "blur");
  assert.equal(f.isPanning(), false);
  f.dispose();
  assert.equal(f.fire(f.host, "wheel", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(f.getView(), moved);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const hooks = {
  ...React,
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useEffect: () => {},
  useRef: (initial) => ({ current: initial }),
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
};

/** 执行真实组件的事件处理器；只替换 hook 调度和宿主 API，不替换业务逻辑。 */
function moduleLoader({ react = hooks, overrides = {} } = {}) {
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const output = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    new Function("module", "exports", "require", output)(module, module.exports, (id) => {
      if (id === "react") return react;
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (id.includes("theme-provider")) return { useTheme: () => ({ tokens: {
        accent: "#2EC4A4", textPrimary: "#F2F2F4", textMuted: "#9A9AA6",
      } }) };
      if (id.startsWith(".")) {
        const prefix = resolve(dirname(file), id);
        return load([".ts", ".tsx"].map((suffix) => prefix + suffix).find(existsSync));
      }
      return require(id);
    });
    cache.set(file, module.exports);
    return module.exports;
  };
  return (path) => load(fileURLToPath(new URL(path, import.meta.url)));
}

function findNode(tree, id) {
  if (!React.isValidElement(tree)) return null;
  if (tree.props["data-testid"] === id) return tree;
  for (const child of React.Children.toArray(tree.props.children)) {
    const result = findNode(child, id);
    if (result) return result;
  }
  return null;
}

function pointer(button, target) {
  return { button, clientX: 100, clientY: 50, pointerId: 1, shiftKey: false,
    target, currentTarget: target, stopped: false,
    stopPropagation() { this.stopped = true; }, preventDefault() {},
  };
}

test("画布空白单击只提交一次放置，右键和中键不放置", () => {
  const worldDom = {
    offsetWidth: 1920, offsetHeight: 1080,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
  };
  const load = moduleLoader({ react: { ...hooks, useRef: () => ({ current: worldDom }) } });
  const { SceneBaseLayer } = load("../src/shared/scene-base-layer.tsx");
  const { buildSceneLayout } = load("../src/shared/scene-layout.ts");
  const calls = [];
  const tree = SceneBaseLayer({ layout: buildSceneLayout(960, 540, 1920, 1080, 0, 0),
    imageUrl: "", onBlankPointerDown: (x, y) => calls.push([x, y]) });
  const world = findNode(tree, "scene-base-world");
  const stage = findNode(tree, "scene-design-stage");
  const stageDom = {
    closest: () => stageDom, getAttribute: () => "scene-design-stage",
  };
  for (const button of [1, 2, 0]) {
    const event = pointer(button, stageDom);
    stage.props.onPointerDown?.(event);
    event.currentTarget = worldDom;
    if (!event.stopped) world.props.onPointerDown(event);
  }
  assert.deepEqual(calls, [[200, 100]]);
});

test("交互点编辑、尺寸手柄与玩家动作只响应主键，触摸主键仍可触发", () => {
  const load = moduleLoader();
  const { HotspotLayer } = load("../src/editor/canvas/hotspot-layer.tsx");
  const { ResizeHandles } = load("../src/editor/canvas/resize-handles.tsx");
  const { HotspotView } = load("../src/runtime/hotspot-view.tsx");
  const hotspot = { id: "point", x: 0.5, y: 0.5, visual: { kind: "image", src: "" } };
  const contentRect = { originX: 0, originY: 0, width: 1920, height: 1080 };
  let selected = 0;
  const layer = HotspotLayer({ hotspots: [hotspot], contentRect, selectedId: null,
    onSelect: () => selected++, onMove() {}, onResize() {}, resolveUrl: () => "", worldElement: null });
  const node = findNode(layer, "hotspot-node-point");
  let captured = 0;
  const target = { setPointerCapture: () => captured++ };
  const handles = ResizeHandles({ box: { width: 64, height: 64, centerLeft: 100, centerTop: 100 }, onResizeCommit() {} });
  const handle = findNode(handles, "resize-handle-e");
  let activated = 0;
  const view = HotspotView({ hotspot, contentRect, resolveUrl: () => "", onActivate: () => activated++ });
  for (const button of [1, 2]) {
    node.props.onPointerDown(pointer(button, target));
    handle.props.onPointerDown(pointer(button, target));
    view.props.onPointerDown(pointer(button, target));
  }
  assert.equal(selected, 0);
  assert.equal(captured, 0);
  assert.equal(activated, 0);
  node.props.onPointerDown(pointer(0, target));
  handle.props.onPointerDown(pointer(0, target));
  view.props.onPointerDown({ ...pointer(0, target), pointerType: "touch" });
  assert.equal(selected, 1);
  assert.equal(captured, 2);
  assert.equal(activated, 1);
});

test("错过窗口外的松手事件时，交互点移动和尺寸调整只提交最后有效位置", () => {
  const effects = [];
  const listeners = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener() {} };
  try {
    const load = moduleLoader({ react: { ...hooks, useEffect: (fn) => effects.push(fn) } });
    const { HotspotLayer } = load("../src/editor/canvas/hotspot-layer.tsx");
    const { ResizeHandles } = load("../src/editor/canvas/resize-handles.tsx");
    const moves = [];
    const world = { offsetWidth: 1920, offsetHeight: 1080,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }) };
    const target = { setPointerCapture() {}, releasePointerCapture() {} };
    const layer = HotspotLayer({ hotspots: [{ id: "point", x: 0.5, y: 0.5, visual: { kind: "image", src: "" } }],
      contentRect: { originX: 0, originY: 0, width: 1920, height: 1080 }, selectedId: null,
      onSelect() {}, onMove: (...args) => moves.push(args), onResize() {}, resolveUrl: () => "", worldElement: world });
    const cleanups = effects.map((fn) => fn());
    findNode(layer, "hotspot-node-point").props.onPointerDown(pointer(0, target));
    listeners.get("pointermove")({ ...pointer(0, target), clientX: 130, buttons: 1 });
    listeners.get("pointermove")({ ...pointer(0, target), clientX: 400, buttons: 0 });
    assert.deepEqual(moves, [["point", (960 + 30) / 1920, 0.5]]);
    listeners.get("pointermove")({ ...pointer(0, target), clientX: 500, buttons: 0 });
    assert.equal(moves.length, 1);
    for (const cleanup of cleanups) cleanup?.();
    const sizes = [];
    const handles = ResizeHandles({ box: { width: 64, height: 64, centerLeft: 100, centerTop: 100 },
      onResizeCommit: (box) => sizes.push(box) });
    const handle = findNode(handles, "resize-handle-e");
    handle.props.onPointerDown(pointer(0, target));
    handle.props.onPointerMove({ ...pointer(0, target), clientX: 120, buttons: 1 });
    handle.props.onPointerMove({ ...pointer(0, target), clientX: 500, buttons: 0 });
    assert.equal(sizes.length, 1);
    assert.equal(sizes[0].width, 84);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

function hudFixture(ui) {
  const sessions = [];
  const failures = [];
  const load = moduleLoader({ overrides: {
    "./suspend-overlay-for-fragment": { setHudUiSession: (value) => sessions.push(value) },
    "./visual-inventory-hud": { closeVisualInventoryHud() {} },
    "../shared/logger": { logError: (...args) => failures.push(args) },
  } });
  const { startAutoHudSession } = load("../src/runtime/auto-hud-session.ts");
  let wanted = true;
  const stop = startAutoHudSession({ ui }, () => wanted);
  return { sessions, failures, stop, startAutoHudSession, setWanted: (value) => { wanted = value; } };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("纯内存预览存档提供主场景默认值，并保留显式指定的主场景", () => {
  const { createPreviewSave } = moduleLoader()("../src/store/preview-save.ts");
  const save = createPreviewSave({ currentSceneId: "room" });
  assert.equal(save.get("mainSceneId"), "");
  assert.equal(save.get("currentSceneId"), "room");
  const custom = createPreviewSave({ mainSceneId: "entrance" });
  assert.equal(custom.get("mainSceneId"), "entrance");
  custom.set("mainSceneId", "next");
  assert.equal(custom.get("mainSceneId"), "next");
});

test("快捷栏清理兼容同步返回、同步异常及 Promise 拒绝", async () => {
  for (const hide of [() => {}, () => { throw new Error("sync failure"); }, () => Promise.reject(new Error("async failure"))]) {
    const f = hudFixture({ show: () => {}, hide });
    await flush();
    assert.deepEqual(f.sessions, [true]);
    assert.doesNotThrow(f.stop);
    await flush();
    assert.deepEqual(f.sessions, [true, false]);
    assert.deepEqual(f.failures, []);
  }
});

test("关闭或卸载后迟到的 HUD 打开请求不会重新显示快捷栏", async () => {
  let complete;
  let visible = false;
  let hides = 0;
  const f = hudFixture({
    show: () => new Promise((resolve) => { complete = () => { visible = true; resolve(); }; }),
    hide: () => { hides++; visible = false; },
  });
  f.setWanted(false);
  f.stop();
  assert.equal(hides, 1);
  complete();
  await flush();
  assert.equal(hides, 2);
  assert.equal(visible, false);
  assert.deepEqual(f.sessions, [false]);
});

test("旧 HUD 请求完成时不会关闭刚重新启用的新会话", async () => {
  let complete;
  let hides = 0;
  const f = hudFixture({ show: () => new Promise((resolve) => { complete = resolve; }), hide: () => { hides++; } });
  f.setWanted(false); f.stop();
  f.setWanted(true); complete();
  await flush();
  assert.equal(hides, 1);
  assert.deepEqual(f.sessions, [false]);
});

test("旧组件迟到的 show 和清理不会关闭新组件会话，新组件关闭后仍可清理旧请求", async () => {
  for (const completesWhileNewActive of [true, false]) {
    let completeOld;
    let hides = 0;
    const f = hudFixture({ show: () => new Promise((resolve) => { completeOld = resolve; }), hide: () => { hides++; } });
    f.setWanted(false);
    const newStop = f.startAutoHudSession({ ui: { show: () => {}, hide: () => { hides++; } } }, () => true);
    await flush();
    f.stop();
    assert.equal(hides, 0);
    if (!completesWhileNewActive) newStop();
    completeOld();
    await flush();
    assert.equal(hides, completesWhileNewActive ? 0 : 2);
    assert.deepEqual(f.sessions, completesWhileNewActive ? [true] : [true, false]);
    if (completesWhileNewActive) {
      newStop();
      assert.equal(hides, 1);
    }
  }
});

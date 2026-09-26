import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function load(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: "node", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
}
const { buildProjectResourceLibrary, syncProjectResourceLibrary, startProjectResourceLibrarySync,
  PROJECT_RESOURCE_LIBRARY_KEY } = await load("../src/store/project-resource-library.ts");
const { projectResourcePath } = await load("../src/shared/project-resource-reference.ts");

function settingsFixture(initial = {}) {
  const data = new Map(Object.entries(initial));
  const listeners = new Map();
  const writes = [];
  const key = (moduleId, field) => moduleId + "." + field;
  const settings = { cross: {
    get: (moduleId, field) => data.get(key(moduleId, field)),
    set: (moduleId, field, value) => {
      const fullKey = key(moduleId, field);
      data.set(fullKey, value);
      writes.push({ key: fullKey, value });
      for (const listener of [...listeners.get(fullKey) ?? []]) listener(value);
    },
    subscribe: (moduleId, field, callback) => {
      const fullKey = key(moduleId, field);
      if (!listeners.has(fullKey)) listeners.set(fullKey, new Set());
      listeners.get(fullKey).add(callback);
      return () => listeners.get(fullKey).delete(callback);
    },
  } };
  const rows = () => data.get("editor." + PROJECT_RESOURCE_LIBRARY_KEY);
  return { settings, data, listeners, writes, rows };
}

test("工程路径兼容旧 URI 和 Windows 斜杠，外部或越界资源不登记", () => {
  assert.equal(projectResourcePath(" asset://assets/ui/背景.png "), "ui/背景.png");
  assert.equal(projectResourcePath("assets\\ui\\button.png"), "ui/button.png");
  assert.equal(projectResourcePath("11111111111111111111111111111111"), "11111111111111111111111111111111");
  for (const value of ["https://host/a.png", "blob:abc", "data:image/png;base64,AA",
    "extension-resource://assets/materials/abc.png", "C:/images/a.png", "//host/a.png",
    "/images/a.png", "../a.png", "ui/../a.png", "ui/a.png?query", "", "key-item", null]) {
    assert.equal(projectResourcePath(value), null);
  }
});

test("采集场景、交互点、物品、界面三态和控件图片，去重并汇总使用位置", () => {
  const result = buildProjectResourceLibrary([
    { label: "场景库", value: JSON.stringify({ scenes: [{ baseImage: "ui/room.png",
      hotspots: [{ visual: { src: "asset://ui/shared.png" } }] }] }) },
    { label: "物品库", value: { items: [{ icon: "ui/shared.png", detailImage: "items/key.png" }] } },
    { label: "界面", value: { skin: { imageSrc: "ui/n.png", hoverImageSrc: "ui/h.png",
      pressedImageSrc: "ui/p.png" }, props: { asset: "ui/bg.png", onAsset: "ui/on.png",
      offAsset: "ui/off.png", checkedAsset: "ui/check.png", uncheckedAsset: "ui/uncheck.png",
      trackAsset: "ui/track.png", fillAsset: "ui/fill.png", handleAsset: "ui/handle.png",
      tabAsset: "ui/tab.png", activeTabAsset: "ui/active.png" }, itemToast: { seSrc: "se/gain.ogg" } } },
  ]);
  assert.equal(result.length, 17);
  assert.equal(result.find((row) => row.path === "ui/shared.png").usedBy, "场景库、物品库");
  assert.ok(result.some((row) => row.path === "se/gain.ogg"));
  assert.deepEqual([...result].map((row) => row.path), [...result].map((row) => row.path).sort((a,b)=>a.localeCompare(b,"zh-CN")));
});

test("名称、描述、变量右值与 CSS 不制造引用，原配置不被改写", () => {
  const input = { name: "ui/name.png", description: "ui/description.png",
    action: { operand: { value: "ui/variable.png" } },
    customCss: "url(ui/css.png)", visual: { src: "extension-resource://assets/materials/a.png" } };
  const before = structuredClone(input);
  assert.deepEqual(buildProjectResourceLibrary([{ label: "场景库", value: input }]), []);
  assert.deepEqual(input, before);
});

test("旧工程首次补齐结构化数组，无变化不重复保存，清空配置清除引用", () => {
  const f = settingsFixture({ "editor.scenesLibraryJson": JSON.stringify({ scenes: [{ baseImage: "ui/room.png" }] }) });
  assert.equal(syncProjectResourceLibrary(f.settings), true);
  assert.ok(Array.isArray(f.rows()));
  assert.equal(f.rows()[0].path, "ui/room.png");
  assert.equal(syncProjectResourceLibrary(f.settings), false);
  assert.equal(f.writes.length, 1);
  f.data.set("editor.scenesLibraryJson", '{"scenes":[]}');
  assert.equal(syncProjectResourceLibrary(f.settings), true);
  assert.deepEqual(f.rows(), []);
});

test("同步覆盖实际生效的 HUD 与场景界面迁移数据，排除被覆盖的旧配置", () => {
  const f = settingsFixture({
    "backpack-hud.backpackScreenJson": '{"skin":{"imageSrc":"ui/legacy-bag.png"}}',
    "backpack-hud.itemToastJson": '{"seSrc":"se/legacy.ogg"}',
    "backpack-hud.inventoryHudJson": '{"overlays":[{"props":{"asset":"ui/hud.png"}}]}',
  });
  syncProjectResourceLibrary(f.settings);
  assert.deepEqual(new Set(f.rows().map((row) => row.path)), new Set(["ui/legacy-bag.png", "se/legacy.ogg", "ui/hud.png"]));
  f.data.set("backpack.backpackScreenJson", '{"skin":{"imageSrc":"ui/new-bag.png"}}');
  f.data.set("editor.sceneUiJson", '{"sceneReturn":{"imageSrc":"ui/return.png"}}');
  syncProjectResourceLibrary(f.settings);
  assert.deepEqual(new Set(f.rows().map((row) => row.path)), new Set(["ui/new-bag.png", "ui/return.png", "ui/hud.png"]));
});

test("删除或换图立即同步，设置回调不会自激；结束订阅后不影响工程", () => {
  const f = settingsFixture({
    "editor.scenesLibraryJson": '{"scenes":[{"baseImage":"ui/room.png"}]}',
    "editor.itemsLibraryJson": '{"items":[{"icon":"ui/key.png"}]}',
  });
  const errors = [];
  const stop = startProjectResourceLibrarySync(f.settings, (error) => errors.push(error));
  assert.equal(f.writes.length, 1);
  f.settings.cross.set("editor", "scenesLibraryJson", '{"scenes":[{"baseImage":"ui/new.png"}]}');
  assert.deepEqual(new Set(f.rows().map((row) => row.path)), new Set(["ui/new.png", "ui/key.png"]));
  f.settings.cross.set("editor", "itemsLibraryJson", '{"items":[]}');
  assert.deepEqual(f.rows(), [{ path: "ui/new.png", usedBy: "场景库" }]);
  const before = f.writes.length;
  f.settings.cross.set("editor", "theme", "light");
  assert.equal(f.writes.length, before + 1);
  f.settings.cross.set("editor", PROJECT_RESOURCE_LIBRARY_KEY, []);
  assert.equal(f.rows()[0].path, "ui/new.png");
  assert.equal(f.writes.length, before + 3);
  stop();
  stop();
  assert.ok([...f.listeners.values()].every((set) => set.size === 0));
  const saved = structuredClone(f.rows());
  f.settings.cross.set("editor", "scenesLibraryJson", '{"scenes":[]}');
  assert.deepEqual(f.rows(), saved);
  assert.deepEqual(errors, []);
});

test("损坏 JSON、读取和保存失败保留上次有效清单，修复后恢复同步", () => {
  const f = settingsFixture({ "editor.scenesLibraryJson": '{"scenes":[{"baseImage":"ui/room.png"}]}' });
  const errors = [];
  const stop = startProjectResourceLibrarySync(f.settings, (error) => errors.push(error));
  const saved = structuredClone(f.rows());
  f.settings.cross.set("editor", "scenesLibraryJson", "{bad JSON");
  assert.deepEqual(f.rows(), saved);
  assert.match(errors[0].message, /保留原引用素材库/);
  f.settings.cross.set("editor", "scenesLibraryJson", '{"scenes":[]}');
  assert.deepEqual(f.rows(), []);
  stop();
  f.data.set("editor.scenesLibraryJson", '{"scenes":[{"baseImage":"ui/new.png"}]}');
  const originalSet = f.settings.cross.set;
  f.settings.cross.set = () => { throw new Error("save failed"); };
  assert.throws(() => syncProjectResourceLibrary(f.settings), /save failed/);
  assert.deepEqual(f.rows(), []);
  f.settings.cross.set = originalSet;
  f.settings.cross.get = () => { throw new Error("read failed"); };
  assert.throws(() => syncProjectResourceLibrary(f.settings), /read failed/);
  assert.deepEqual(f.rows(), []);
});

test("订阅初始化失败释放已创建订阅，不留下旧工程监听", () => {
  const f = settingsFixture();
  const subscribe = f.settings.cross.subscribe;
  let count = 0;
  f.settings.cross.subscribe = (...args) => {
    if (++count === 3) throw new Error("subscribe failed");
    return subscribe(...args);
  };
  const errors = [];
  const stop = startProjectResourceLibrarySync(f.settings, (error) => errors.push(error));
  assert.equal(errors.length, 1);
  assert.ok([...f.listeners.values()].every((set) => set.size === 0));
  assert.equal(f.writes.length, 0);
  stop();
});

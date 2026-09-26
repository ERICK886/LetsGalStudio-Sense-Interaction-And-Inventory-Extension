import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const result = await build({ entryPoints: [fileURLToPath(new URL("../src/editor/ui/resource-picker-model.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "esm" });
const { resourceCategory, buildResourceCategories, filterResources, resourceGridWindow } =
  await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
const resources = ["backgrounds/包/门.png", "characters/少女.png", "ui/少女头像.png", "自定义/门.png"]
  .map((path, index) => ({ id: String(index), path, name: path.split("/").pop() }));

test("资源分类与 Studio 一致，嵌套目录归入一级分类、未知目录归入未分类", () => {
  assert.equal(resourceCategory("backgrounds\\包\\门.png"), "backgrounds");
  assert.deepEqual(buildResourceCategories(resources), [
    { id: "backgrounds", label: "场景", count: 1 }, { id: "characters", label: "立绘", count: 1 },
    { id: "ui", label: "界面", count: 1 }, { id: "uncategorized", label: "未分类", count: 1 },
  ]);
  assert.deepEqual(buildResourceCategories([]), []);
});
test("无搜索时按分类筛选，搜索跨分类且支持多个关键词", () => {
  assert.deepEqual(filterResources(resources, "characters", ""), [resources[1]]);
  assert.deepEqual(filterResources(resources, "characters", "门 包"), [resources[0]]);
  assert.deepEqual(filterResources(resources, null, "不存在"), []);
  assert.deepEqual(filterResources(resources, "ui", "  "), [resources[2]]);
});
test("搜索忽略大小写和全角差异，文件名命中优先于目录命中且不修改源数组", () => {
  const items = ["ui/HERO/other.png", "characters/Hero.png", "ui/Heroine.png"]
    .map((path) => ({ id: path, path, name: path.split("/").pop() }));
  assert.deepEqual(filterResources(items, null, "ｈｅｒｏ").map(({ path }) => path),
    ["characters/Hero.png", "ui/Heroine.png", "ui/HERO/other.png"]);
  assert.equal(items[0].path, "ui/HERO/other.png");
});
test("大量图片只渲染视口与缓冲行，滚动后仍覆盖目标图片", () => {
  const grid = resourceGridWindow(10000, 860, 560, 1660);
  assert.equal(grid.columns, 5);
  assert.equal(grid.start, 40);
  assert.equal(grid.end, 80);
  assert.equal(grid.top, 1328);
  assert.equal(grid.height, 332032);
  assert.ok(grid.end - grid.start < 100);
});
test("窄面板、空列表及最后一行不生成越界索引", () => {
  assert.deepEqual(resourceGridWindow(0, 120, 300, 0),
    { columns: 1, start: 0, end: 0, top: 0, height: 32 });
  const grid = resourceGridWindow(11, 860, 560, 0);
  assert.equal(grid.end, 11);
  assert.equal(grid.columns, 5);
  const tail = resourceGridWindow(100, 120, 300, 16000);
  assert.ok(tail.start >= 0 && tail.end <= 100);
});

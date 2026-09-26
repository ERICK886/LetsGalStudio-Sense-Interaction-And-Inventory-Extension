import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function load(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

const { getHotspotImageSize, resetSizeForHotspotImageChange } = await load("../src/shared/hotspot-image-size.ts");
const { applyResizeDrag } = await load("../src/editor/canvas/resize-math.ts");
const portrait = { width: 704, height: 1408 };
const visual = { kind: "image", src: "extension-resource://assets/materials/portrait.png" };

test("新图片按原尺寸显示，旧方框收紧到实际图片大小并保留显示比例", () => {
  assert.deepEqual(getHotspotImageSize(visual, portrait), portrait);
  assert.deepEqual(getHotspotImageSize({ ...visual, width: 580, height: 580 }, portrait),
    { width: 290, height: 580 });
  assert.deepEqual(getHotspotImageSize({ ...visual, width: 120, height: 300 }, { width: 200, height: 100 }),
    { width: 120, height: 60 });
  assert.deepEqual(getHotspotImageSize({ ...visual, width: 100 }, portrait), { width: 100, height: 200 });
  assert.deepEqual(getHotspotImageSize({ ...visual, height: 100 }, portrait), { width: 50, height: 100 });
});

test("加载失败和无图仍可编辑占位框，不使用无效图片尺寸", () => {
  assert.deepEqual(getHotspotImageSize(visual), { width: 64, height: 64 });
  assert.deepEqual(getHotspotImageSize({ ...visual, width: 88, height: 44 }, { width: 0, height: 0 }),
    { width: 88, height: 44 });
  assert.deepEqual(getHotspotImageSize({ ...visual, src: "" }, portrait), { width: 64, height: 64 });
  assert.deepEqual(getHotspotImageSize({ ...visual, width: Infinity, height: -1 }, portrait), portrait);
});

test("换图清除旧宽高，手动缩放同一张图保留尺寸；保存重读后仍按新图原尺寸", async () => {
  const previous = { ...visual, width: 580, height: 580 };
  const resized = { ...previous, width: 300, height: 600 };
  assert.equal(resetSizeForHotspotImageChange(previous, resized), resized);
  const next = resetSizeForHotspotImageChange(previous, { ...previous, src: "asset://new.png" });
  assert.equal(next.width, undefined);
  assert.equal(next.height, undefined);
  const { parseScenesLibraryJson, stringifyScenesLibrary } = await load("../src/domain/serialize.ts");
  const library = parseScenesLibraryJson(JSON.stringify({ version: 1, scenes: [
    { id: "scene", hotspots: [{ type: "hotspot", id: "point", x: 0.3, y: 0.4, visual: next }] },
  ] }));
  const restored = parseScenesLibraryJson(stringifyScenesLibrary(library)).scenes[0].hotspots[0];
  assert.deepEqual(getHotspotImageSize(restored.visual, portrait), portrait);
  assert.equal(restored.x, 0.3);
  assert.equal(restored.y, 0.4);
  assert.deepEqual(previous, { ...visual, width: 580, height: 580 });
});

test("有图的八个手柄保持图片比例、对边锚点和最小尺寸", () => {
  const start = { width: 352, height: 704, centerLeft: 500, centerTop: 500 };
  for (const handle of ["n", "s", "e", "w", "ne", "nw", "se", "sw"]) {
    const args = { handle, start, dx: 32, dy: 20, lockAspect: false, aspectRatio: 0.5, minWidth: 8, minHeight: 8 };
    const next = applyResizeDrag(args);
    assert.equal(next.width / next.height, 0.5, handle);
    if (handle.includes("e")) assert.equal(next.centerLeft - next.width / 2, start.centerLeft - start.width / 2, handle);
    if (handle.includes("w")) assert.equal(next.centerLeft + next.width / 2, start.centerLeft + start.width / 2, handle);
    if (handle.includes("n")) assert.equal(next.centerTop + next.height / 2, start.centerTop + start.height / 2, handle);
    if (handle.includes("s")) assert.equal(next.centerTop - next.height / 2, start.centerTop - start.height / 2, handle);
    const tiny = applyResizeDrag({ ...args,
      dx: handle.includes("w") ? 10000 : -10000,
      dy: handle.includes("n") ? 10000 : -10000 });
    assert.equal(tiny.width / tiny.height, 0.5, handle);
    assert.ok(tiny.width >= 8 && tiny.height >= 8, handle);
  }
  const free = applyResizeDrag({ handle: "se", start, dx: 32, dy: 20, lockAspect: false, minWidth: 8, minHeight: 8 });
  assert.equal(free.width, 384);
  assert.equal(free.height, 724);
});

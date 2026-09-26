import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);

async function load(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
}

test("素材引用和旧资源路径分别走扩展资源与工程资源解析", async () => {
  const { materialReference } = await load("../src/shared/material-reference.ts");
  const { resolveAssetUrl } = await load("../src/shared/resolve-asset-url.ts");
  const { createContextAssetResolver } = await load("../src/shared/resolve-context-asset-url.ts");
  const ref = materialReference("assets/materials/abc-123.png");
  assert.equal(resolveAssetUrl(ref, () => ({ url: "wrong" }), (path) => `/extension/${path}`),
    "/extension/assets/materials/abc-123.png");
  assert.equal(resolveAssetUrl("asset://items/old.png", (uri) => ({ url: `/project/${uri}` })),
    "/project/asset://items/old.png");
  assert.equal(resolveAssetUrl("https://example.test/old.png", undefined), "https://example.test/old.png");
  assert.equal(resolveAssetUrl("extension-resource://assets/../outside.png", undefined), "");
  const resolver = createContextAssetResolver({
    asset: { resolve: (uri) => ({ url: `/project/${uri}` }) },
    extensionResource: { url: (path) => `/extension/${path}` },
  });
  assert.equal(resolveAssetUrl(ref, resolver), "/extension/assets/materials/abc-123.png");
});

test("新旧场景、交互点和物品图片引用都能通过原 JSON 格式保存和读取", async () => {
  const { parseScenesLibraryJson, stringifyScenesLibrary, parseItemsLibraryJson, stringifyItemsLibrary } =
    await load("../src/domain/serialize.ts");
  const ref = "extension-resource://assets/materials/abc-123.png";
  const scenes = parseScenesLibraryJson(JSON.stringify({ version: 1, scenes: [
    { id: "old", baseImage: "ui/room.png", hotspots: [] },
    { id: "new", baseImage: ref, hotspots: [{ type: "hotspot", id: "door", visual: { kind: "image", src: ref } }] },
  ] }));
  const restored = parseScenesLibraryJson(stringifyScenesLibrary(scenes));
  assert.equal(restored.scenes[0].baseImage, "ui/room.png");
  assert.equal(restored.scenes[1].baseImage, ref);
  assert.equal(restored.scenes[1].hotspots[0].visual.src, ref);
  const items = parseItemsLibraryJson(JSON.stringify({ version: 1, items: [
    { id: "item", icon: "asset://items/old.png", detailImage: ref },
  ] }));
  const restoredItems = parseItemsLibraryJson(stringifyItemsLibrary(items));
  assert.equal(restoredItems.items[0].icon, "asset://items/old.png");
  assert.equal(restoredItems.items[0].detailImage, ref);
});

test("作者导入两张图片后更新清单，错误目录与伪图片会被拒绝", async () => {
  const { connectMaterialRoot, importMaterialFile } = await load("../src/editor/material-storage.ts");
  const root = await mkdtemp(join(tmpdir(), "avg-material-test-"));
  const ctx = { native: { node: { require: (name) => require(name) } } };
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0]);
  try {
    await writeFile(join(root, "extension.json"), JSON.stringify({ id: "other.extension" }));
    await assert.rejects(() => connectMaterialRoot(ctx, root), /ID 不匹配/);
    await writeFile(join(root, "extension.json"), JSON.stringify({ id: "ink.zenly.ext-27b96b" }));
    await assert.rejects(() => importMaterialFile(ctx, root, new File(["not an image"], "fake.png"), "scene"), /仅支持/);
    const first = await importMaterialFile(ctx, root, new File([png], "room.png"), "scene");
    const second = await importMaterialFile(ctx, root, new File([png], "door.png"), "hotspot");
    assert.equal(first.materials.length, 1);
    assert.equal(second.materials.length, 2);
    assert.equal(second.materials[1].name, "door.png");
    assert.equal((await readFile(join(root, "assets", "materials", "manifest.json"), "utf8")).includes("door.png"), true);
    assert.deepEqual(new Uint8Array(await readFile(join(root, ...second.materials[0].path.split("/")))), png);
    const failingCtx = { native: { node: { require: (name) => name === "node:fs/promises"
      ? { ...require(name), rename: async () => { throw new Error("模拟写入失败"); } }
      : require(name) } } };
    await assert.rejects(() => importMaterialFile(failingCtx, root, new File([png], "failed.png"), "item"), /模拟写入失败/);
    assert.equal((await readdir(join(root, "assets", "materials"))).length, 3);
  } finally {
    if (root.startsWith(tmpdir()) && root.includes("avg-material-test-")) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";


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

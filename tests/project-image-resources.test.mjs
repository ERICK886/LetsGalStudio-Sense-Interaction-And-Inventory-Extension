import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

async function load(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, platform: "node", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
}
const { parseProjectImageManifest, readProjectImageResources } =
  await load("../src/editor/project-image-resources.ts");
const hash = (index) => index.toString(16).padStart(32, "0");
const manifest = (...paths) => ({ version: 1, entries: Object.fromEntries(
  paths.map((path, index) => [hash(index), { path, size: 10, updatedAt: 1 }]),
) });

test("工程清单筛选图片，保留中文、空格和同名图片的不同文件夹", () => {
  const images = parseProjectImageManifest(manifest(
    "ui/背景 图片.PNG", "characters/门.png", "ui/门.png", "ui/logo.svg",
    "ui/a.avif", "audio/theme.mp3", "fonts/text.ttf", "ui/theme.json",
  ));
  assert.equal(images.length, 5);
  assert.ok(images.some((image) => image.name === "背景 图片.PNG"));
  assert.equal(images.filter((image) => image.name === "门.png").length, 2);
  assert.ok(images.every((image) => !image.path.startsWith("assets/")));
});

test("清单规范化斜杠、去重并忽略无效条目和越界路径", () => {
  const paths = ["ui\\门.png", "ui/门.png", "../outside.png", "ui/../x.png",
    "/outside.png", "C:\\outside.png", "https://host/image.png", "ui//a.png",
    "ui/./a.png", "ui/a.png#hash", "ui/a.png?query", "ui/\u0000a.png", ""];
  const input = manifest(...paths);
  input.entries.bad = { path: "ui/invalid-hash.png" };
  input.entries[hash(100)] = null;
  assert.deepEqual(parseProjectImageManifest(input), [
    { id: hash(0), name: "门.png", path: "ui/门.png" },
  ]);
});

test("空工程可读取，错误清单根结构明确报错", () => {
  assert.deepEqual(parseProjectImageManifest(manifest()), []);
  for (const bad of [null, [], { version: 2, entries: {} }, { version: 1, entries: [] },
    { version: 1, materials: [] }]) {
    assert.throws(() => parseProjectImageManifest(bad), /清单格式不支持/);
  }
});

test("读取走当前工程 SDK，刷新不缓存清单且只进行 GET", async () => {
  const calls = [];
  const resolutions = [];
  const asset = { resolve: (path) => {
    resolutions.push(path);
    return { url: "local://c/project/assets/" + path };
  } };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return Response.json(manifest(calls.length === 1 ? "ui/old.png" : "ui/new.png"));
  };
  const controller = new AbortController();
  assert.equal((await readProjectImageResources(asset, controller.signal, fetcher))[0].path, "ui/old.png");
  assert.equal((await readProjectImageResources(asset, controller.signal, fetcher))[0].path, "ui/new.png");
  assert.deepEqual(resolutions, [".manifest.json", ".manifest.json"]);
  assert.equal(calls[0].url, "local://c/project/assets/.manifest.json");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.method, undefined);
  assert.equal(calls[0].options.body, undefined);
});

test("缺少工程、404、权限错误和坏 JSON 均有可恢复的提示", async () => {
  let requested = false;
  const fetcher = async () => { requested = true; return Response.json(manifest()); };
  await assert.rejects(readProjectImageResources(undefined, undefined, fetcher), /未连接/);
  await assert.rejects(readProjectImageResources({ resolve: (uri) => ({ url: uri }) }, undefined, fetcher), /未连接/);
  assert.equal(requested, false);
  const asset = { resolve: () => ({ url: "https://project.test/assets/.manifest.json" }) };
  await assert.rejects(readProjectImageResources(asset, undefined, async () => new Response("", { status: 404 })), /尚未生成/);
  await assert.rejects(readProjectImageResources(asset, undefined, async () => new Response("", { status: 403 })), /403/);
  await assert.rejects(readProjectImageResources(asset, undefined, async () => new Response("<html>")), /无法解析/);
  await assert.rejects(readProjectImageResources(asset, undefined, async () => { throw new TypeError("Failed to fetch"); }), /Failed to fetch/);
});

test("取消信号传给请求，关闭选择器可以取消尚未完成的读取", async () => {
  const controller = new AbortController();
  const asset = { resolve: () => ({ url: "https://project.test/assets/.manifest.json" }) };
  const pending = readProjectImageResources(asset, controller.signal, async (_url, { signal }) =>
    new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("选择的工程路径经场景、交互点和物品 JSON 保存后使用宿主解析", async () => {
  const serialization = await load("../src/domain/serialize.ts");
  const { resolveAssetUrl } = await load("../src/shared/resolve-asset-url.ts");
  const path = parseProjectImageManifest(manifest("ui/背景 图片.png"))[0].path;
  const scenes = serialization.parseScenesLibraryJson(JSON.stringify({
    version: 1, scenes: [{ id: "room", baseImage: path, hotspots: [
      { type: "hotspot", id: "door", visual: { kind: "image", src: path } },
    ] }],
  }));
  const restored = serialization.parseScenesLibraryJson(serialization.stringifyScenesLibrary(scenes));
  assert.equal(restored.scenes[0].baseImage, path);
  assert.equal(restored.scenes[0].hotspots[0].visual.src, path);
  const items = serialization.parseItemsLibraryJson(JSON.stringify({
    version: 1, items: [{ id: "key", icon: path, detailImage: path }],
  }));
  const restoredItems = serialization.parseItemsLibraryJson(serialization.stringifyItemsLibrary(items));
  assert.equal(restoredItems.items[0].icon, path);
  assert.equal(restoredItems.items[0].detailImage, path);
  assert.equal(resolveAssetUrl(path, (uri) => ({ url: "https://packaged.test/" + uri }),
    () => { throw new Error("工程图片不能走扩展目录"); }), "https://packaged.test/" + path);
});

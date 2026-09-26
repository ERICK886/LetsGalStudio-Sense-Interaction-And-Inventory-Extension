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
const storage = await load("../src/editor/material-storage.ts");
const usage = await load("../src/editor/material-usage.ts");
const { parseMaterialManifest } = await load("../src/editor/material-library.ts");
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0]);

function makeContext(settings = new Map(), filesystem) {
  return {
    native: { node: { require: name => name === "node:fs/promises" && filesystem ? filesystem : require(name) } },
    settings: { cross: { get: (module, key) => settings.get(`${module}.${key}`) }, get: key => settings.get(`editor.${key}`) },
  };
}
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "avg-material-manage-"));
  try {
    await writeFile(join(root, "extension.json"), JSON.stringify({ id: "ink.zenly.ext-27b96b" }));
    const settings = new Map();
    const ctx = makeContext(settings);
    const manifest = await storage.importMaterialFile(ctx, root, new File([png], "room.png"), "scene");
    await run({ root, ctx, settings, entry: manifest.materials[0],
      manifestPath: join(root, "assets", "materials", "manifest.json") });
  } finally {
    assert.ok(root.startsWith(tmpdir()) && root.includes("avg-material-manage-"));
    await rm(root, { recursive: true, force: true });
  }
}

test("修改名称和分类不变更图片内容、ID 或资源路径，旧清单兼容回收站字段", async () => {
  await fixture(async ({ root, ctx, entry, manifestPath }) => {
    const edited = await storage.editMaterialMetadata(ctx, root, entry.id, "  门口  ", "hotspot");
    assert.deepEqual(edited.materials[0], { ...entry, name: "门口", kind: "hotspot" });
    const persisted = parseMaterialManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    assert.deepEqual(persisted, edited);
    assert.deepEqual(new Uint8Array(await readFile(join(root, ...entry.path.split("/")))), png);
    await assert.rejects(storage.editMaterialMetadata(ctx, root, entry.id, " ", "scene"), /名称/);
    await assert.rejects(storage.editMaterialMetadata(ctx, root, "missing-id", "新图", "scene"), /不存在/);
    assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), edited);
  });
});

test("删除到回收站与恢复可持久化，不删除图片，恢复后保留原引用", async () => {
  await fixture(async ({ root, ctx, entry }) => {
    const trashed = await storage.setMaterialTrashed(ctx, root, entry.id, true);
    assert.ok(trashed.materials[0].trashedAt);
    const reconnected = await storage.connectMaterialRoot(ctx, root);
    assert.equal(reconnected.manifest.materials[0].trashedAt, trashed.materials[0].trashedAt);
    assert.deepEqual(new Uint8Array(await readFile(join(root, ...entry.path.split("/")))), png);
    const restored = await storage.setMaterialTrashed(ctx, root, entry.id, false);
    assert.deepEqual(restored.materials[0], entry);
    assert.deepEqual((await storage.connectMaterialRoot(ctx, root)).manifest, restored);
  });
});

test("引用检测覆盖场景底图、交互点、物品、动作参数、自定义 CSS 及旧 UI 设置", async () => {
  await fixture(async ({ root, ctx, settings, entry, manifestPath }) => {
    const ref = `extension-resource://${entry.path}`;
    settings.set("editor.scenesLibraryJson", JSON.stringify({ version: 1, scenes: [{ name: "山洞", baseImage: ref,
      hotspots: [{ name: "门", visual: { src: ref }, actions: [{ params: JSON.stringify({ picture: ref }) }] }] }] }));
    settings.set("editor.itemsLibraryJson", JSON.stringify({ items: [{ name: "钥匙", icon: ref, detailImage: ref }] }));
    settings.set("editor.sceneUiJson", JSON.stringify({ customCss: `background: url('${ref}')` }));
    settings.set("backpack-hud.backpackScreenJson", JSON.stringify({ nodes: [{ src: ref }] }));
    const report = usage.readMaterialUsageReport(ctx);
    assert.equal(report.error, "");
    const matches = usage.collectMaterialUsage(entry.path, report.sources);
    assert.equal(matches.length, 7);
    assert.ok(matches.some(item => item.label.includes("山洞") && item.field.endsWith("baseImage")));
    assert.ok(matches.some(item => item.label.includes("门") && item.field.includes("actions")));
    const before = await readFile(manifestPath, "utf8");
    await assert.rejects(storage.setMaterialTrashed(ctx, root, entry.id, true), /仍有 7 处引用/);
    assert.equal(await readFile(manifestPath, "utf8"), before);
    settings.clear();
    assert.ok((await storage.setMaterialTrashed(ctx, root, entry.id, true)).materials[0].trashedAt);
  });
});

test("删除前重新读设置，损坏设置或读取失败不会被当成未使用", async () => {
  await fixture(async ({ root, ctx, settings, entry }) => {
    assert.equal(usage.collectMaterialUsage(entry.path, usage.readMaterialUsageReport(ctx).sources).length, 0);
    settings.set("editor.itemsLibraryJson", JSON.stringify({ items: [{ icon: `extension-resource://${entry.path}` }] }));
    await assert.rejects(storage.setMaterialTrashed(ctx, root, entry.id, true), /仍有/);
    settings.set("editor.itemsLibraryJson", "{broken");
    await assert.rejects(storage.setMaterialTrashed(ctx, root, entry.id, true), /设置格式错误/);
    settings.clear();
    const failing = { ...ctx, settings: { ...ctx.settings, cross: { get: () => { throw new Error("unavailable"); } } } };
    await assert.rejects(storage.setMaterialTrashed(failing, root, entry.id, true), /无法读取/);
    assert.equal((await storage.connectMaterialRoot(ctx, root)).manifest.materials[0].trashedAt, undefined);
  });
});

test("清单写入失败保留旧元数据和文件，并释放锁与临时文件", async () => {
  await fixture(async ({ root, entry, manifestPath }) => {
    const before = await readFile(manifestPath, "utf8");
    const fs = { ...require("node:fs/promises"), rename: async () => { throw new Error("模拟清单写入失败"); } };
    const failing = makeContext(new Map(), fs);
    await assert.rejects(storage.editMaterialMetadata(failing, root, entry.id, "失败重命名", "item"), /模拟清单写入失败/);
    await assert.rejects(storage.setMaterialTrashed(failing, root, entry.id, true), /模拟清单写入失败/);
    assert.equal(await readFile(manifestPath, "utf8"), before);
    assert.deepEqual((await readdir(join(root, "assets", "materials"))).sort(), ["manifest.json", entry.path.split("/").pop()].sort());
  });
});

test("跨编辑器并发修改被写锁阻止，不覆盖另一份清单", async () => {
  await fixture(async ({ root, ctx, entry }) => {
    let acquired;
    const locked = new Promise(resolve => { acquired = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const nativeFs = require("node:fs/promises");
    const fs = { ...nativeFs, writeFile: async (path, ...args) => {
      const result = await nativeFs.writeFile(path, ...args);
      if (path.endsWith(".manifest.lock")) { acquired(); await gate; }
      return result;
    } };
    const first = storage.editMaterialMetadata(makeContext(new Map(), fs), root, entry.id, "另一个编辑器", "scene");
    try {
      await locked;
      await assert.rejects(storage.editMaterialMetadata(ctx, root, entry.id, "抢写", "item"), /另一个编辑器/);
    } finally { release(); }
    await first;
    assert.equal((await storage.connectMaterialRoot(ctx, root)).manifest.materials[0].name, "另一个编辑器");
  });
});

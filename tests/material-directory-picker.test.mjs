import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const bundled = await build({
  entryPoints: [fileURLToPath(new URL("../src/editor/material-directory-picker.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "esm",
});
const { canPickMaterialDirectory, pickMaterialDirectory, selectMaterialRoot } =
  await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);

function context({ platform = "win32", result = "", error = null, inspect = () => {} } = {}) {
  return { native: { node: { require: (name) => {
    if (name === "node:os") return { platform: () => platform };
    if (name === "node:process") return { env: { SystemRoot: "C:\\Windows" } };
    if (name === "node:child_process") return { execFile: (file, args, options, callback) => {
      inspect(file, args, options);
      callback(error, result, "");
    } };
    return require(name);
  } } } };
}

test("没有原生能力或非 Windows 环境保留手动连接方式", async () => {
  assert.equal(canPickMaterialDirectory({}), false);
  const denied = { native: { node: { require: () => { throw new Error("denied"); } } } };
  assert.equal(canPickMaterialDirectory(denied), false);
  let launched = false;
  const ctx = context({ platform: "darwin", inspect: () => { launched = true; } });
  assert.equal(canPickMaterialDirectory(ctx), false);
  await assert.rejects(() => pickMaterialDirectory(ctx), /请手动填写/);
  assert.equal(launched, false);
});

test("中文及特殊字符路径作为编码数据传递，系统进程不显示控制台", async () => {
  const initial = "C:\\项目 图片\\'$(Write-Output oops);`test";
  const selected = "C:\\作者素材\\场景扩展";
  let launched = false;
  const ctx = context({ result: Buffer.from(selected).toString("base64"), inspect: (file, args, options) => {
    launched = true;
    assert.equal(file, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    assert.ok(args.includes("-STA"));
    assert.ok(args.includes("-NoProfile"));
    assert.equal(options.windowsHide, true);
    const script = Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");
    assert.equal(script.includes(initial), false);
    const encodedInitial = script.match(/FromBase64String\('([^']*)'\)/)[1];
    assert.equal(Buffer.from(encodedInitial, "base64").toString("utf8"), initial);
  } });
  assert.equal(await pickMaterialDirectory(ctx, initial), selected);
  assert.equal(launched, true);
});

test("取消选择不访问素材文件、不改变原连接", async () => {
  const ctx = context({ result: "\r\n" });
  const originalRequire = ctx.native.node.require;
  ctx.native.node.require = (name) => {
    assert.notEqual(name, "node:fs/promises");
    return originalRequire(name);
  };
  assert.equal(await selectMaterialRoot(ctx, "C:\\previous"), null);
});

test("选择有效源目录可连接，错误扩展目录被拒绝且不会写文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "avg-directory-picker-test-"));
  try {
    const ctx = context({ result: Buffer.from(root).toString("base64") });
    await writeFile(join(root, "extension.json"), JSON.stringify({ id: "ink.zenly.ext-27b96b" }));
    const connected = await selectMaterialRoot(ctx);
    assert.equal(connected.root, await require("node:fs/promises").realpath(root));
    assert.deepEqual(connected.manifest.materials, []);
    await writeFile(join(root, "extension.json"), JSON.stringify({ id: "other.extension" }));
    await assert.rejects(() => selectMaterialRoot(ctx), /ID 不匹配/);
    assert.deepEqual(await readdir(root), ["extension.json"]);
  } finally {
    if (root.startsWith(tmpdir()) && root.includes("avg-directory-picker-test-")) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("系统窗口失败或返回非路径内容时显示可恢复的错误", async () => {
  await assert.rejects(() => pickMaterialDirectory(context({ error: new Error("spawn failed") })), /请手动填写/);
  await assert.rejects(() => pickMaterialDirectory(context({ result: "not a path!" })), /选择结果无效/);
});

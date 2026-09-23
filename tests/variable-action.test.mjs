import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadTypeScript(path, imports = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", output)(
    module, module.exports, (name) => imports[name] ?? require(name),
  );
  return module.exports;
}

const variable = loadTypeScript("../src/domain/variable-action.ts");
const actions = loadTypeScript("../src/domain/actions.ts", {
  "../shared/logger": { logDebug() {}, logInfo() {}, logWarn() {} },
  "./motion": { defaultMotionSide: () => ({}) },
});
const makeAction = (target, assignment, operand, binary) => ({
  type: "editVariable", target, assignment, operand, ...(binary ? { binary } : {}),
});
const number = (value) => ({ kind: "number", value: String(value) });
const variableOperand = (value) => ({ kind: "variable", value });

test("动作链依次修改 Studio 变量，后续动作读取到新值", async () => {
  const values = { score: 2, bonus: 3, unlocked: false };
  const warnings = [];
  const runtime = {
    editVariable: (action) => variable.applySceneVariableAction(
      action,
      (name) => values[name],
      (name, value) => { values[name] = value; },
      (message) => warnings.push(message),
    ),
    warn: (message) => warnings.push(message),
  };
  const result = await actions.executeSceneActions([
    makeAction("score", "=", number(4), { operator: "+", operand: variableOperand("bonus") }),
    makeAction("score", "+=", number(2)),
    makeAction("score", "-=", number(1)),
    makeAction("score", "*=", number(2)),
    makeAction("score", "/=", number(4)),
    makeAction("unlocked", "=", { kind: "boolean", value: "true" }),
  ], "hotspot", runtime);
  assert.deepEqual(result, { aborted: false });
  assert.equal(values.score, 4);
  assert.equal(values.unlocked, true);
  assert.deepEqual(warnings, []);
});

test("文本拼接、变量引用及右值四则运算", () => {
  const values = { label: "得分", score: 8, step: 2 };
  const warnings = [];
  const get = (name) => values[name];
  const set = (name, value) => { values[name] = value; };
  assert.equal(variable.applySceneVariableAction(
    makeAction("label", "+=", { kind: "string", value: "：" },
      { operator: "+", operand: variableOperand("score") }),
    get, set, (message) => warnings.push(message),
  ), true);
  assert.equal(values.label, "得分：8");
  for (const [operator, result] of [["-", 6], ["*", 16], ["/", 4]]) {
    assert.equal(variable.applySceneVariableAction(
      makeAction("score", "=", variableOperand("score"),
        { operator, operand: variableOperand("step") }),
      get, set, (message) => warnings.push(message),
    ), true);
    assert.equal(values.score, result);
    values.score = 8;
  }
  assert.deepEqual(warnings, []);
});

test("空变量名、缺失变量、除零和非法类型不污染原值", () => {
  const values = { score: 3, label: "hello" };
  const warnings = [];
  const run = (action) => variable.applySceneVariableAction(
    action,
    (name) => values[name],
    (name, value) => { values[name] = value; },
    (message) => warnings.push(message),
  );
  assert.equal(run(makeAction("", "=", number(1))), false);
  assert.equal(run(makeAction("score", "+=", variableOperand("missing"))), false);
  assert.equal(run(makeAction("score", "/=", number(0))), false);
  assert.equal(run(makeAction("label", "-=", number(1))), false);
  assert.equal(run(makeAction("score", "=", { kind: "number", value: "bad" })), false);
  assert.deepEqual(values, { score: 3, label: "hello" });
  assert.equal(warnings.length, 5);
});

test("场景 JSON 解析后保留变量动作与右值表达式", () => {
  const { buildSync } = require("esbuild");
  const bundled = buildSync({
    entryPoints: [new URL("../src/domain/serialize.ts", import.meta.url).pathname.slice(1)],
    bundle: true, platform: "node", format: "cjs", write: false,
  }).outputFiles[0].text;
  const module = { exports: {} };
  new Function("module", "exports", "require", bundled)(module, module.exports, require);
  const action = makeAction("score", "+=", variableOperand("bonus"),
    { operator: "*", operand: number(2) });
  const raw = JSON.stringify({ version: 1, scenes: [{
    id: "scene", name: "场景", baseImage: "", hotspots: [{
      id: "hotspot", name: "按钮", x: 0.5, y: 0.5,
      visual: { kind: "image", src: "" }, actions: [action],
    }],
  }] });
  const lib = module.exports.parseScenesLibraryJson(raw);
  assert.deepEqual(lib.scenes[0].hotspots[0].actions[0], action);
  assert.deepEqual(
    module.exports.parseScenesLibraryJson(module.exports.stringifyScenesLibrary(lib))
      .scenes[0].hotspots[0].actions[0],
    action,
  );
});

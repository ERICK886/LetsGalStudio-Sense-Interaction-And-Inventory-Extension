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

const conditions = loadTypeScript("../src/domain/hotspot-condition.ts");
const progress = loadTypeScript("../src/domain/progress.ts", { "./hotspot-condition": conditions });
const base = { id: "door", visibleByDefault: true, once: false };
const state = { consumed: {}, visibility: {} };

test("旧场景点无规则时保持原有显隐和 once 行为", () => {
  assert.equal(progress.isHotspotVisible(base, state), true);
  assert.equal(progress.isHotspotVisible({ ...base, visibleByDefault: false }, state), false);
  assert.equal(progress.isHotspotVisible({ ...base, once: true }, { ...state, consumed: { door: true } }), false);
  assert.equal(progress.isHotspotVisible(base, { ...state, visibility: { door: false } }), false);
});

test("全部与任一条件按实时游戏变量判断，方法显隐仍受条件约束", () => {
  const unlocked = { source: "game", target: "unlocked", valueType: "bool", operator: "truthy" };
  const score = { source: "game", target: "score", valueType: "number", operator: "gte", value: 3 };
  const values = { unlocked: false, score: 4 };
  const read = (name) => values[name];
  const hotspot = { ...base, visibleIf: { logic: "all", conditions: [unlocked, score] } };
  assert.equal(progress.isHotspotVisible(hotspot, state, read), false);
  values.unlocked = true;
  assert.equal(progress.isHotspotVisible(hotspot, state, read), true);
  assert.equal(progress.isHotspotVisible(hotspot, { ...state, visibility: { door: true } }, read), true);
  values.score = 2;
  assert.equal(progress.isHotspotVisible(hotspot, { ...state, visibility: { door: true } }, read), false);
  assert.equal(progress.isHotspotVisible({ ...hotspot, visibleIf: { logic: "any", conditions: [unlocked, score] } }, state, read), true);
});

test("缺失变量不命中，变量间比较与真假判断符合 Studio 规则", () => {
  const values = { score: 5, threshold: 4, flag: false };
  const read = (name) => values[name];
  assert.equal(conditions.evaluateHotspotConditionGroup({ logic: "all", conditions: [
    { source: "game", target: "score", valueType: "number", operator: "gt",
      compareTo: { source: "game", target: "threshold" } },
    { source: "game", target: "flag", valueType: "bool", operator: "falsy" },
  ] }, read), true);
  assert.equal(conditions.evaluateHotspotConditionGroup({ logic: "all", conditions: [
    { source: "game", target: "missing", valueType: "bool", operator: "falsy" },
  ] }, read), false);
});

test("解析作者数据时保留有效条件并丢弃损坏规则", () => {
  const normalized = conditions.normalizeHotspotConditionGroup({
    logic: "all",
    conditions: [
      { source: "game", target: "score", valueType: "number", operator: "gte", value: 4 },
      { source: "unknown", target: "x", valueType: "bool", operator: "truthy" },
    ],
  });
  assert.equal(normalized.conditions.length, 1);
  assert.equal(normalized.conditions[0].value, 4);
  assert.equal(conditions.normalizeHotspotConditionGroup({ logic: "all", conditions: [] }), undefined);
});

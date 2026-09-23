import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { ChakraProvider, defaultSystem } = require("@chakra-ui/react");
const tokens = {
  accent: "#2EC4A4", bgElevated: "#1F1F26", bgSunken: "#121217",
  border: "#2E2E38", borderStrong: "#3C3C48",
  textPrimary: "#F2F2F4", textMuted: "#9A9AA6",
};

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", output)(module, module.exports, (id) =>
    id.includes("theme-provider") ? { useTheme: () => ({ tokens }) } : require(id),
  );
  return module.exports;
}

function render(element) {
  return renderToStaticMarkup(React.createElement(ChakraProvider, { value: defaultSystem }, element));
}

test("选择器使用 Chakra Select 复合控件并保留空值选项", () => {
  const { EditorSelect, EditorSelectOption } = load("../src/editor/ui/editor-select.tsx");
  const markup = render(
    React.createElement(EditorSelect, {
      value: "", onChange: () => {}, "aria-label": "目标场景",
    },
      React.createElement(EditorSelectOption, { value: "" }, "请选择"),
      React.createElement(EditorSelectOption, { value: "room" }, "房间"),
    ),
  );
  assert.match(markup, /data-scope="select"/);
  assert.match(markup, /请选择/);
  const selected = render(React.createElement(EditorSelect, {
    value: "room", onChange: () => {}, "aria-label": "目标场景",
  }, React.createElement(EditorSelectOption, { value: "room" }, "房间")));
  assert.match(selected, /房间/);
});

test("颜色字段使用 Chakra ColorPicker 及透明通道", () => {
  const { ColorPicker } = load("../src/schema/color-picker.tsx");
  const markup = render(React.createElement(ColorPicker, {
    value: "#112233AA", onChange: () => {}, allowAlpha: true, ariaLabel: "边框颜色",
  }));
  assert.match(markup, /data-scope="color-picker"/);
  assert.match(markup, /边框颜色/);
  assert.match(markup, /#112233AA/i);
});

test("旧颜色值读取与透明通道 HEX 输出保持兼容", () => {
  const { tryParseCssColor, rgbaToHex } = load("../src/schema/color-picker.tsx");
  const rgba = tryParseCssColor("#112233AA");
  assert.equal(rgbaToHex(rgba, true), "#112233AA");
  assert.equal(rgbaToHex(rgba, false), "#112233");
  assert.equal(tryParseCssColor("#112233A"), null);
});

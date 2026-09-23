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
    id.includes("theme-provider") ? { useTheme: () => ({ tokens }) } :
      id.endsWith("editor-popover-position") ? load("../src/editor/ui/editor-popover-position.ts") :
        require(id),
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

test("缩放预览中的弹层坐标贴近触发器，并在底部空间不足时上翻", () => {
  const { getEditorPopoverCoordinates } = load("../src/editor/ui/editor-popover-position.ts");
  const root = { left: 90, top: 110, width: 960, height: 540 };
  const size = { width: 1920, height: 1080 };
  const popup = { width: 260, height: 220 };
  const middle = getEditorPopoverCoordinates(
    { left: 790, top: 360, width: 120, height: 20, bottom: 380 },
    root, size, popup,
  );
  assert.deepEqual(middle, { x: 1400, y: 544, width: 240 });
  const bottom = getEditorPopoverCoordinates(
    { left: 790, top: 580, width: 120, height: 20, bottom: 600 },
    root, size, popup,
  );
  assert.deepEqual(bottom, { x: 1400, y: 716, width: 240 });
});

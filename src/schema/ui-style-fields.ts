/**
 * ui-style-fields.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 自由布局 UI 节点共用的 FormRenderer 字段工厂。
 * 通过点分 prefix 生成嵌套 key（如 nodes.quickbarRoot.rect.x）。
 */

import type { FieldSchema } from "./types";

/**
 * 生成 UiBoxStyle 对应的表单字段。
 *
 * @param prefix - 对象路径前缀，如 `"nodes.quickbarRoot.slotStyle"`
 * @returns 含 background / borderColor / borderWidth 等字段的 FieldSchema 数组
 *
 * @example
 * ```ts
 * boxStyleFields("nodes.panelChrome.style");
 * // → [{ key: "nodes.panelChrome.style.background", kind: "color", ... }, ...]
 * ```
 */
export function boxStyleFields(prefix: string): FieldSchema[] {
  return [
    {
      key: `${prefix}.background`,
      kind: "color",
      label: "背景色",
      placeholder: "#1a1a2e",
      description: "留空则使用运行时默认或 accent 派生色",
    },
    {
      key: `${prefix}.borderColor`,
      kind: "color",
      label: "边框色",
      placeholder: "#64e0d0",
    },
    {
      key: `${prefix}.borderWidth`,
      kind: "number",
      label: "边框宽度",
      min: 0,
      max: 8,
      step: 1,
      description: "像素",
    },
    {
      key: `${prefix}.borderRadius`,
      kind: "number",
      label: "圆角",
      min: 0,
      max: 48,
      step: 1,
      description: "像素",
    },
    {
      key: `${prefix}.opacity`,
      kind: "number",
      label: "不透明度",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      key: `${prefix}.shadow`,
      kind: "number",
      label: "阴影强度",
      min: 0,
      max: 1,
      step: 0.05,
      description: "0–1，运行时映射为 boxShadow",
    },
  ];
}

/**
 * 生成 UiTextStyle 对应的表单字段。
 *
 * @param prefix - 对象路径前缀，如 `"nodes.titleBlock.title"`
 * @param opts.withLabel - true 时追加 label 文案字段
 * @returns FieldSchema 数组
 *
 * @example
 * ```ts
 * textStyleFields("nodes.openBagButton.style", { withLabel: true });
 * ```
 */
export function textStyleFields(
  prefix: string,
  opts?: { withLabel?: boolean },
): FieldSchema[] {
  const fields: FieldSchema[] = [
    {
      key: `${prefix}.color`,
      kind: "color",
      label: "文字色",
      placeholder: "#ffffff",
    },
    {
      key: `${prefix}.fontSize`,
      kind: "number",
      label: "字号",
      min: 8,
      max: 72,
      step: 1,
      description: "像素",
    },
    {
      key: `${prefix}.fontWeight`,
      kind: "number",
      label: "字重",
      min: 100,
      max: 900,
      step: 100,
      description: "100–900，步进 100",
    },
  ];

  if (opts?.withLabel) {
    fields.push({
      key: `${prefix}.label`,
      kind: "string",
      label: "文案",
      placeholder: "留空使用内置默认",
      description: "覆写显示文案；空串或缺省则回退运行时默认",
    });
  }

  return fields;
}

/**
 * 生成 UiRect 对应的表单字段。
 *
 * @param prefix - 对象路径前缀，如 `"nodes.quickbarRoot.rect"`
 * @param opts.withSize - true 时追加 w / h 字段
 * @returns FieldSchema 数组
 *
 * @example
 * ```ts
 * rectFields("nodes.quickbarRoot.rect");
 * // key: nodes.quickbarRoot.rect.x / .y
 *
 * rectFields("nodes.openBagButton.rect", { withSize: true });
 * // 额外含 .w / .h
 * ```
 */
export function rectFields(
  prefix: string,
  opts?: { withSize?: boolean },
): FieldSchema[] {
  const fields: FieldSchema[] = [
    {
      key: `${prefix}.x`,
      kind: "number",
      label: "X",
      step: 1,
      description: "设计像素，相对舞台左侧",
    },
    {
      key: `${prefix}.y`,
      kind: "number",
      label: "Y",
      step: 1,
      description: "设计像素，相对舞台顶部",
    },
  ];

  if (opts?.withSize) {
    fields.push(
      {
        key: `${prefix}.w`,
        kind: "number",
        label: "宽度",
        min: 1,
        step: 1,
        description: "设计像素",
      },
      {
        key: `${prefix}.h`,
        kind: "number",
        label: "高度",
        min: 1,
        step: 1,
        description: "设计像素",
      },
    );
  }

  return fields;
}

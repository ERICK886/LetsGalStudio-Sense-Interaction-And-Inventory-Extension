/**
 * hotspot-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 交互点（HotspotElement）的属性表单 schema 生成。
 * 动作列表由 ActionListField 单独渲染，不在本 schema 内。
 */

import type { HotspotElement, HotspotLabelMode } from "../domain/types";
import { motionSection } from "./motion-section";
import type { FieldSchema } from "./types";

/** 标签显示模式选项 */
export const HOTSPOT_LABEL_MODE_OPTIONS: ReadonlyArray<{
  value: HotspotLabelMode;
  label: string;
}> = [
  { value: "hover", label: "悬停显示" },
  { value: "always", label: "始终显示" },
  { value: "hidden", label: "不显示" },
];

/**
 * 根据交互点当前状态生成属性面板字段 schema 列表。
 *
 * 分区：基本、位置、视觉、交互（once / hoverShadow）、标签、动画。
 * `actions` 由 `ActionListField` 在属性面板中单独编辑。
 *
 * @param _hotspot - 当前交互点（预留条件分支；当前字段固定）
 * @returns FieldSchema 数组，供 FormRenderer 渲染
 *
 * @example
 * ```ts
 * const fields = hotspotFields(hotspot);
 * ```
 */
export function hotspotFields(_hotspot: HotspotElement): FieldSchema[] {
  return [
    {
      kind: "section",
      id: "basic",
      title: "基本",
      children: [
        {
          key: "name",
          kind: "string",
          label: "名称",
          placeholder: "未命名交互点",
        },
        {
          key: "visibleByDefault",
          kind: "boolean",
          label: "新游戏默认可见",
        },
        {
          key: "once",
          kind: "boolean",
          label: "仅触发一次",
          description: "执行动作后标记已消耗并隐藏",
        },
      ],
    },
    {
      kind: "section",
      id: "position",
      title: "位置",
      children: [
        {
          kind: "grid",
          id: "position-xy",
          columns: 2,
          gap: 8,
          children: [
            {
              key: "x",
              kind: "number",
              label: "X（归一化）",
              min: 0,
              max: 1,
              step: 0.01,
            },
            {
              key: "y",
              kind: "number",
              label: "Y（归一化）",
              min: 0,
              max: 1,
              step: 0.01,
            },
          ],
        },
      ],
    },
    {
      kind: "section",
      id: "visual",
      title: "视觉",
      children: [
        {
          key: "visual.src",
          kind: "asset",
          label: "图片资源",
          accept: "image",
          showPreview: true,
          placeholder: "asset://hotspots/door.png",
        },
        {
          kind: "grid",
          id: "visual-size",
          columns: 2,
          gap: 8,
          children: [
            {
              key: "visual.width",
              kind: "number",
              label: "宽度（设计像素）",
              min: 0,
              step: 1,
              description: "可选；0 或空表示按资源原尺寸",
            },
            {
              key: "visual.height",
              kind: "number",
              label: "高度（设计像素）",
              min: 0,
              step: 1,
            },
          ],
        },
        {
          key: "hoverShadow.enabled",
          kind: "boolean",
          label: "悬停阴影",
          description: "运行时 hover 时施加 drop-shadow",
        },
      ],
    },
    {
      kind: "section",
      id: "label",
      title: "标签",
      children: [
        {
          key: "label.mode",
          kind: "enum",
          label: "显示模式",
          options: HOTSPOT_LABEL_MODE_OPTIONS,
        },
        {
          key: "label.text",
          kind: "string",
          label: "标签文本",
          placeholder: "可选；空则使用交互点名称",
        },
        {
          kind: "grid",
          id: "label-offsets",
          columns: 2,
          gap: 8,
          children: [
            {
              key: "label.offsetX",
              kind: "number",
              label: "标签 X 偏移",
              step: 1,
            },
            {
              key: "label.offsetY",
              kind: "number",
              label: "标签 Y 偏移",
              step: 1,
            },
          ],
        },
      ],
    },
    motionSection({
      description: "交互点外壳的入场/退场；编辑器画布不预览",
    }),
  ];
}

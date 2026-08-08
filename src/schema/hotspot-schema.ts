/**
 * hotspot-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 交互点（HotspotElement）的属性表单 schema 生成。
 * 视觉区含 hoverShadow 总开关及光晕层 / 底影层全部可编辑字段。
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
 * 分区：基本（含 once）、位置、视觉（含 hoverShadow 光晕/底影）、标签、动画。
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
              min: 8,
              step: 1,
              description: "画布边框手柄可拉伸；最小 8；空则占位 64",
            },
            {
              key: "visual.height",
              kind: "number",
              label: "高度（设计像素）",
              min: 8,
              step: 1,
              description: "角手柄默认等比，按住 Shift 自由比例",
            },
          ],
        },
        {
          key: "hoverShadow.enabled",
          kind: "boolean",
          label: "悬停阴影",
          description: "总开关；关闭时不显示阴影。打开后由光晕/底影层开关决定",
        },
        {
          kind: "section",
          id: "hover-shadow-glow",
          title: "光晕层",
          description: "悬停时的高亮光晕（drop-shadow）",
          children: [
            {
              key: "hoverShadow.glow.enabled",
              kind: "boolean",
              label: "启用光晕",
            },
            {
              key: "hoverShadow.glow.color",
              kind: "color",
              label: "颜色",
              placeholder: "#FFECA0",
            },
            {
              kind: "grid",
              id: "hover-shadow-glow-nums",
              columns: 2,
              gap: 8,
              children: [
                {
                  key: "hoverShadow.glow.opacity",
                  kind: "number",
                  label: "透明度",
                  min: 0,
                  max: 1,
                  step: 0.05,
                },
                {
                  key: "hoverShadow.glow.intensity",
                  kind: "number",
                  label: "强度",
                  min: 0,
                  max: 2,
                  step: 0.05,
                  description: "乘到透明度上，最终 alpha 限制在 0–1",
                },
                {
                  key: "hoverShadow.glow.offsetX",
                  kind: "number",
                  label: "偏移 X",
                  step: 1,
                },
                {
                  key: "hoverShadow.glow.offsetY",
                  kind: "number",
                  label: "偏移 Y",
                  step: 1,
                },
                {
                  key: "hoverShadow.glow.blur",
                  kind: "number",
                  label: "模糊",
                  min: 0,
                  step: 1,
                },
              ],
            },
          ],
        },
        {
          kind: "section",
          id: "hover-shadow-base",
          title: "底影层",
          description: "悬停时的暗色软影（drop-shadow）",
          children: [
            {
              key: "hoverShadow.base.enabled",
              kind: "boolean",
              label: "启用底影",
            },
            {
              key: "hoverShadow.base.color",
              kind: "color",
              label: "颜色",
              placeholder: "#000000",
            },
            {
              kind: "grid",
              id: "hover-shadow-base-nums",
              columns: 2,
              gap: 8,
              children: [
                {
                  key: "hoverShadow.base.opacity",
                  kind: "number",
                  label: "透明度",
                  min: 0,
                  max: 1,
                  step: 0.05,
                },
                {
                  key: "hoverShadow.base.intensity",
                  kind: "number",
                  label: "强度",
                  min: 0,
                  max: 2,
                  step: 0.05,
                  description: "乘到透明度上，最终 alpha 限制在 0–1",
                },
                {
                  key: "hoverShadow.base.offsetX",
                  kind: "number",
                  label: "偏移 X",
                  step: 1,
                },
                {
                  key: "hoverShadow.base.offsetY",
                  kind: "number",
                  label: "偏移 Y",
                  step: 1,
                },
                {
                  key: "hoverShadow.base.blur",
                  kind: "number",
                  label: "模糊",
                  min: 0,
                  step: 1,
                },
              ],
            },
          ],
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

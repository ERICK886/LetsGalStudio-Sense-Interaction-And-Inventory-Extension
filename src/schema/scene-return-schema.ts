/**
 * scene-return-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景返回按钮（SceneReturnButtonConfig）属性表单 schema。
 * 含启用开关、矩形、文案、常态样式、背景图及可选悬停态分组。
 */

import type { FieldSchema } from "./types";
import {
  boxStyleFields,
  buttonSkinFields,
  rectFields,
  textStyleFields,
} from "./ui-style-fields";

/**
 * 场景返回按钮全局字段（扁平 key，供 FormRenderer 绑定嵌套值）。
 *
 * @returns FieldSchema 数组
 *
 * @example
 * ```ts
 * <FormRenderer
 *   schema={sceneReturnFields()}
 *   value={cfg as unknown as Record<string, unknown>}
 *   onChange={handleChange}
 * />
 * ```
 */
export function sceneReturnFields(): FieldSchema[] {
  return [
    {
      key: "enabled",
      kind: "boolean",
      label: "启用返回按钮",
      description: "关闭后运行时永不显示返回按钮",
    },
    {
      kind: "section",
      id: "scene-return-rect",
      title: "位置与尺寸",
      description: "设计分辨率下的绝对矩形（左上角原点）",
      children: rectFields("rect", { withSize: true }),
    },
    {
      key: "label",
      kind: "string",
      label: "按钮文案",
      placeholder: "可留空",
      description: "可留空（纯图标/皮肤）；缺省字段时默认「返回」",
    },
    {
      kind: "section",
      id: "scene-return-style",
      title: "常态样式",
      description: "盒模型与文本样式（无背景图时使用）",
      children: [
        ...boxStyleFields("style"),
        ...textStyleFields("style"),
      ],
    },
    {
      kind: "section",
      id: "scene-return-skin",
      title: "按钮图片（三态）",
      description: "可选；按下→悬停→常态依次回退",
      children: buttonSkinFields(""),
    },
    {
      kind: "section",
      id: "scene-return-hover",
      title: "悬停样式（可选）",
      description: "悬停时覆盖常态盒/字样式；未填字段沿用常态",
      children: [
        ...boxStyleFields("hoverStyle"),
        ...textStyleFields("hoverStyle"),
      ],
    },
  ];
}

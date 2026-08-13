/**
 * item-toast-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-14
 * 版本: 0.1.1
 *
 * 获得物品 Toast（ItemToastConfig）属性表单 schema。
 * 全局字段：获得 SE、相对位置、间距、偏移、盒样式与文本样式。
 */

import type { FieldSchema } from "./types";
import { boxStyleFields, textStyleFields } from "./ui-style-fields";

/**
 * 获得物品 Toast 全局字段。
 *
 * @returns FieldSchema 数组
 *
 * @example
 * ```ts
 * <FormRenderer
 *   schema={itemToastGlobalFields()}
 *   value={cfg}
 *   onChange={setCfg}
 * />
 * ```
 */
export function itemToastGlobalFields(): FieldSchema[] {
  return [
    {
      key: "seSrc",
      kind: "asset",
      label: "获得音效（SE）",
      accept: "audio",
      showPreview: false,
      placeholder: "留空则不播放",
    },
    {
      key: "placement",
      kind: "enum",
      label: "相对位置",
      options: [
        { value: "above", label: "上" },
        { value: "below", label: "下" },
        { value: "left", label: "左" },
        { value: "right", label: "右" },
        { value: "center", label: "中心" },
      ],
    },
    {
      key: "gap",
      kind: "number",
      label: "间距",
      min: 0,
      max: 200,
      step: 1,
    },
    {
      key: "offsetX",
      kind: "number",
      label: "偏移 X",
      step: 1,
    },
    {
      key: "offsetY",
      kind: "number",
      label: "偏移 Y",
      step: 1,
    },
    ...boxStyleFields("style"),
    ...textStyleFields("style"),
  ];
}

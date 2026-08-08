/**
 * item-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 物品定义（ItemDefinition）的属性表单 schema 生成。
 * 含 id / name / description / icon / detailImage / stackable / maxStack。
 */

import type { ItemDefinition } from "../domain/types";
import type { FieldSchema } from "./types";

/**
 * 根据物品当前状态生成属性面板字段 schema 列表。
 *
 * `maxStack` 仅在 `stackable === true` 时展开。
 *
 * @param item - 物品定义（用于条件字段）
 * @returns FieldSchema 数组，供 FormRenderer 渲染
 *
 * @example
 * ```ts
 * const fields = itemFields(currentItem);
 * // 含 id、名称、描述、图标、详情图、可堆叠；可堆叠时另含最大堆叠
 * ```
 */
export function itemFields(item: ItemDefinition): FieldSchema[] {
  const stackChildren: FieldSchema[] = [
    {
      key: "stackable",
      kind: "boolean",
      label: "可堆叠",
      description: "开启后同 id 物品合并为一条 stack；关闭则为 unique 实例",
    },
  ];

  if (item.stackable) {
    stackChildren.push({
      key: "maxStack",
      kind: "number",
      label: "最大堆叠",
      min: 1,
      step: 1,
      description: "堆叠上限；未设置时运行时按极大值处理",
    });
  }

  return [
    {
      kind: "section",
      id: "identity",
      title: "标识",
      children: [
        {
          key: "id",
          kind: "string",
          label: "物品 ID",
          placeholder: "item_xxx",
          description: "给动作 giveItem 引用；修改后需同步更新场景动作",
        },
        {
          key: "name",
          kind: "string",
          label: "名称",
          placeholder: "未命名物品",
        },
        {
          key: "description",
          kind: "string",
          label: "描述",
          placeholder: "物品说明…",
          multiline: true,
        },
      ],
    },
    {
      kind: "section",
      id: "images",
      title: "图像",
      children: [
        {
          key: "icon",
          kind: "asset",
          label: "图标",
          accept: "image",
          showPreview: true,
          placeholder: "asset://items/icon.png",
          description: "快捷栏 / 背包格小图",
        },
        {
          key: "detailImage",
          kind: "asset",
          label: "详情大图",
          accept: "image",
          showPreview: true,
          placeholder: "asset://items/detail.png",
          description: "查看物品时的大图",
        },
      ],
    },
    {
      kind: "section",
      id: "stack",
      title: "堆叠",
      children: stackChildren,
    },
  ];
}

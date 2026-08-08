/**
 * inventory-hud-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 物品栏 HUD（InventoryHudConfig）属性表单 schema。
 * 供编辑器「UI」区编辑 settings.inventoryHudJson。
 */

import type { FieldSchema } from "./types";

/**
 * 生成物品栏外观（快捷栏定位 / 槽位 / 文案 / 强调色 / CSS）字段 schema。
 *
 * @returns FieldSchema 数组，供 FormRenderer 渲染
 *
 * @example
 * ```ts
 * const fields = inventoryHudFields();
 * // 含 left / top / slotSize / gap / accent / openBagLabel / customCss
 * ```
 */
export function inventoryHudFields(): FieldSchema[] {
  return [
    {
      kind: "section",
      id: "inventory-hud-layout",
      title: "物品栏外观",
      description: "运行时快捷栏相对舞台的位置与槽位尺寸（设计像素）",
      children: [
        {
          kind: "grid",
          id: "inventory-hud-position",
          columns: 2,
          gap: 8,
          children: [
            {
              key: "left",
              kind: "number",
              label: "左边距",
              min: 0,
              step: 1,
              description: "相对舞台左侧（设计像素）",
            },
            {
              key: "top",
              kind: "number",
              label: "顶边距",
              min: 0,
              step: 1,
              description: "相对舞台顶部（设计像素）",
            },
            {
              key: "slotSize",
              kind: "number",
              label: "槽位尺寸",
              min: 24,
              step: 1,
              description: "快捷栏格子宽高（像素）",
            },
            {
              key: "gap",
              kind: "number",
              label: "间距",
              min: 0,
              step: 1,
              description: "槽位之间的间距（像素）",
            },
          ],
        },
        {
          key: "accent",
          kind: "color",
          label: "强调色",
          placeholder: "#64e0d0",
          description:
            "「打开背包」按钮、数量角标与槽位边框高亮（色板 + HEX，同大地图颜色选择器）",
        },
        {
          key: "openBagLabel",
          kind: "string",
          label: "打开背包文案",
          placeholder: "打开背包",
        },
        {
          key: "customCss",
          kind: "string",
          label: "自定义 CSS",
          placeholder: ".inventory-hud-root { /* … */ }",
          multiline: true,
          description: "注入到快捷栏根节点旁的 style 标签（高级）",
        },
      ],
    },
  ];
}

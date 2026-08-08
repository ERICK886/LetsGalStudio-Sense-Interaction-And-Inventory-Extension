/**
 * backpack-screen-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.9
 *
 * 全屏背包布局属性表单 schema。
 */

import type { FieldSchema } from "./types";

/**
 * @returns FieldSchema 数组
 */
export function backpackScreenFields(): FieldSchema[] {
  return [
    {
      kind: "section",
      id: "backpack-screen-layout",
      title: "全屏背包布局",
      description: "页面边距、详情栏占比、Grid 槽位与大图高度（运行时生效）",
      children: [
        {
          kind: "grid",
          id: "backpack-screen-padding",
          columns: 2,
          gap: 8,
          children: [
            {
              key: "pagePaddingX",
              kind: "number",
              label: "水平边距",
              min: 8,
              max: 160,
              step: 1,
            },
            {
              key: "pagePaddingY",
              kind: "number",
              label: "垂直边距",
              min: 8,
              max: 120,
              step: 1,
            },
            {
              key: "detailRatio",
              kind: "number",
              label: "详情栏占比",
              min: 0.25,
              max: 0.5,
              step: 0.01,
              description: "右侧详情相对主面板宽度（0.25–0.5）",
            },
            {
              key: "gridCellMin",
              kind: "number",
              label: "格子最小边",
              min: 64,
              max: 180,
              step: 1,
            },
            {
              key: "heroHeight",
              kind: "number",
              label: "大图高度",
              min: 120,
              max: 420,
              step: 1,
            },
          ],
        },
        {
          key: "accent",
          kind: "color",
          label: "强调色",
          placeholder: "#64e0d0",
          description: "选中高亮、数量与强调文案色（色板 + HEX，同大地图颜色选择器）",
        },
      ],
    },
  ];
}

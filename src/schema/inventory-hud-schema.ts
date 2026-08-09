/**
 * inventory-hud-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 物品栏 HUD（InventoryHudConfig v2）属性表单 schema。
 * 区分全局字段与按节点字段；供 UI 编辑器与属性面板使用。
 */

import type { FieldSchema } from "./types";
import {
  boxStyleFields,
  buttonSkinFields,
  rectFields,
  textStyleFields,
} from "./ui-style-fields";

/** 快捷栏 HUD 可重置 / 选中的节点 id */
export type HudNodeId = "quickbarRoot" | "openBagButton";

/**
 * 全局字段：accent、customCss 等不属于单个节点的配置。
 *
 * @returns FieldSchema 数组
 *
 * @example
 * ```ts
 * <FormRenderer schema={inventoryHudGlobalFields()} value={hud} onChange={...} />
 * ```
 */
export function inventoryHudGlobalFields(): FieldSchema[] {
  return [
    {
      kind: "section",
      id: "inventory-hud-global",
      title: "快捷栏全局",
      description: "强调色与高级 CSS；节点几何与样式请在画布选中节点后编辑",
      children: [
        {
          key: "accent",
          kind: "color",
          label: "强调色",
          placeholder: "#64e0d0",
          description: "选中高亮、数量角标与未单独指定的边框色",
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

/**
 * 按节点生成字段 schema。
 *
 * @param nodeId - quickbarRoot 或 openBagButton
 * @returns 该节点可编辑的几何 / 样式 / 文案字段
 *
 * @example
 * ```ts
 * inventoryHudNodeFields("quickbarRoot");
 * // 含 nodes.quickbarRoot.rect.x、direction、slotStyle.background 等
 * ```
 */
export function inventoryHudNodeFields(nodeId: HudNodeId): FieldSchema[] {
  switch (nodeId) {
    case "quickbarRoot":
      return [
        {
          kind: "section",
          id: "hud-quickbar-geometry",
          title: "快捷栏位置与尺寸",
          children: [
            {
              kind: "grid",
              id: "hud-quickbar-rect",
              columns: 2,
              gap: 8,
              children: rectFields("nodes.quickbarRoot.rect"),
            },
            {
              key: "nodes.quickbarRoot.direction",
              kind: "enum",
              label: "排列方向",
              options: [
                { value: "column", label: "竖排（默认）" },
                { value: "row", label: "横排" },
              ],
            },
            {
              kind: "grid",
              id: "hud-quickbar-metrics",
              columns: 2,
              gap: 8,
              children: [
                {
                  key: "nodes.quickbarRoot.slotSize",
                  kind: "number",
                  label: "槽位尺寸",
                  min: 24,
                  max: 128,
                  step: 1,
                  description: "单个格子宽高（像素）",
                },
                {
                  key: "nodes.quickbarRoot.gap",
                  kind: "number",
                  label: "间距",
                  min: 0,
                  max: 32,
                  step: 1,
                  description: "槽位之间的间距（像素）",
                },
              ],
            },
          ],
        },
        {
          kind: "section",
          id: "hud-quickbar-slot-style",
          title: "槽位样式",
          children: boxStyleFields("nodes.quickbarRoot.slotStyle"),
        },
        {
          kind: "section",
          id: "hud-quickbar-badge-style",
          title: "数量角标样式",
          children: [
            ...boxStyleFields("nodes.quickbarRoot.badgeStyle"),
            ...textStyleFields("nodes.quickbarRoot.badgeStyle"),
          ],
        },
      ];

    case "openBagButton":
      return [
        {
          key: "nodes.openBagButton.layout",
          kind: "enum",
          label: "定位方式",
          options: [
            { value: "belowRoot", label: "跟随快捷栏下方" },
            { value: "absolute", label: "绝对定位" },
          ],
          description:
            "absolute：独立 x/y/w/h；belowRoot：位置跟随快捷栏，w/h 可覆盖默认尺寸",
        },
        {
          kind: "section",
          id: "hud-open-bag-rect",
          title: "位置与尺寸",
          description:
            "absolute 时 x/y/w/h 全生效；belowRoot 时仅 w/h 覆盖默认宽高（x/y 忽略）",
          children: [
            {
              kind: "grid",
              id: "hud-open-bag-rect-grid",
              columns: 2,
              gap: 8,
              children: rectFields("nodes.openBagButton.rect", {
                withSize: true,
              }),
            },
          ],
        },
        {
          kind: "section",
          id: "hud-open-bag-style",
          title: "按钮样式",
          children: [
            ...boxStyleFields("nodes.openBagButton.style"),
            ...textStyleFields("nodes.openBagButton.style", { withLabel: true }),
          ],
        },
        {
          kind: "section",
          id: "hud-open-bag-skin",
          title: "按钮图片（三态）",
          description: "可选；按下→悬停→常态依次回退",
          children: buttonSkinFields("nodes.openBagButton"),
        },
      ];

    default: {
      const _exhaustive: never = nodeId;
      return _exhaustive;
    }
  }
}

/**
 * 兼容别名：当前仅返回全局字段。
 * 完整选中态表单接线见 Task 10（ui-editor-panel）。
 *
 * @returns 与 {@link inventoryHudGlobalFields} 相同
 *
 * @deprecated 请优先使用 inventoryHudGlobalFields / inventoryHudNodeFields
 */
export function inventoryHudFields(): FieldSchema[] {
  return inventoryHudGlobalFields();
}

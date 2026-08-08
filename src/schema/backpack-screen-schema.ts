/**
 * backpack-screen-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * 全屏背包（BackpackScreenConfig v2）属性表单 schema。
 * 区分全局字段与按节点字段。
 */

import type { BackpackNodeId } from "../domain/types";
import type { FieldSchema } from "./types";
import {
  boxStyleFields,
  rectFields,
  textStyleFields,
} from "./ui-style-fields";

/** 复用 domain 定义的节点 id 类型，避免重复声明 */
export type { BackpackNodeId };

/**
 * 全局字段：accent 等不属于单个节点的配置。
 *
 * @returns FieldSchema 数组
 */
export function backpackScreenGlobalFields(): FieldSchema[] {
  return [
    {
      kind: "section",
      id: "backpack-screen-global",
      title: "全屏背包全局",
      description: "强调色；各节点几何与样式请在画布选中节点后编辑",
      children: [
        {
          key: "accent",
          kind: "color",
          label: "强调色",
          placeholder: "#64e0d0",
          description: "选中高亮、数量与未单独指定的边框色",
        },
      ],
    },
  ];
}

/**
 * 按节点生成字段 schema。
 *
 * @param nodeId - 全屏背包角色节点 id
 * @returns 该节点可编辑字段
 *
 * @example
 * ```ts
 * backpackScreenNodeFields("panelChrome");
 * // 含 nodes.panelChrome.rect.x、style.background 等
 * ```
 */
export function backpackScreenNodeFields(
  nodeId: BackpackNodeId,
): FieldSchema[] {
  switch (nodeId) {
    case "backdrop":
      return [
        {
          kind: "section",
          id: "bag-backdrop-style",
          title: "遮罩样式",
          description: "全屏铺满，仅可改颜色与透明度",
          children: boxStyleFields("nodes.backdrop.style"),
        },
      ];

    case "panelChrome":
      return [
        {
          kind: "section",
          id: "bag-panel-geometry",
          title: "主面板区域",
          children: [
            {
              kind: "grid",
              id: "bag-panel-rect",
              columns: 2,
              gap: 8,
              children: rectFields("nodes.panelChrome.rect", { withSize: true }),
            },
          ],
        },
        {
          kind: "section",
          id: "bag-panel-style",
          title: "主面板样式",
          children: boxStyleFields("nodes.panelChrome.style"),
        },
      ];

    case "titleBlock":
      return [
        {
          kind: "section",
          id: "bag-title-geometry",
          title: "顶栏区域",
          children: [
            {
              kind: "grid",
              id: "bag-title-rect",
              columns: 2,
              gap: 8,
              children: rectFields("nodes.titleBlock.rect", { withSize: true }),
            },
          ],
        },
        {
          kind: "section",
          id: "bag-title-eyebrow",
          title: "Eyebrow 文案",
          children: textStyleFields("nodes.titleBlock.eyebrow", {
            withLabel: true,
          }),
        },
        {
          kind: "section",
          id: "bag-title-main",
          title: "标题",
          children: textStyleFields("nodes.titleBlock.title", {
            withLabel: true,
          }),
        },
        {
          kind: "section",
          id: "bag-title-mode-link",
          title: "模式切换链",
          children: textStyleFields("nodes.titleBlock.modeLink", {
            withLabel: true,
          }),
        },
      ];

    case "closeButton":
      return [
        {
          kind: "section",
          id: "bag-close-geometry",
          title: "关闭按钮区域",
          children: [
            {
              kind: "grid",
              id: "bag-close-rect",
              columns: 2,
              gap: 8,
              children: rectFields("nodes.closeButton.rect", { withSize: true }),
            },
          ],
        },
        {
          kind: "section",
          id: "bag-close-style",
          title: "关闭按钮样式",
          children: [
            ...boxStyleFields("nodes.closeButton.style"),
            ...textStyleFields("nodes.closeButton.style", { withLabel: true }),
          ],
        },
      ];

    case "itemGrid":
      return [
        {
          kind: "section",
          id: "bag-grid-geometry",
          title: "道具网格区域",
          children: [
            {
              kind: "grid",
              id: "bag-grid-rect",
              columns: 2,
              gap: 8,
              children: rectFields("nodes.itemGrid.rect", { withSize: true }),
            },
            {
              key: "nodes.itemGrid.cellMin",
              kind: "number",
              label: "格子最小边",
              min: 64,
              max: 180,
              step: 1,
              description: "Grid 单元格最小宽高（像素）",
            },
          ],
        },
        {
          kind: "section",
          id: "bag-grid-style",
          title: "网格默认样式",
          children: boxStyleFields("nodes.itemGrid.style"),
        },
        {
          kind: "section",
          id: "bag-grid-selected-style",
          title: "选中格样式",
          children: boxStyleFields("nodes.itemGrid.selectedStyle"),
        },
      ];

    case "detailPanel":
      return [
        {
          kind: "section",
          id: "bag-detail-geometry",
          title: "详情面板区域",
          children: [
            {
              kind: "grid",
              id: "bag-detail-rect",
              columns: 2,
              gap: 8,
              children: rectFields("nodes.detailPanel.rect", { withSize: true }),
            },
            {
              kind: "grid",
              id: "bag-detail-metrics",
              columns: 2,
              gap: 8,
              children: [
                {
                  key: "nodes.detailPanel.heroHeight",
                  kind: "number",
                  label: "大图高度",
                  min: 120,
                  max: 420,
                  step: 1,
                  description: "详情区顶部大图高度（像素）",
                },
                {
                  key: "nodes.detailPanel.padding",
                  kind: "number",
                  label: "内边距",
                  min: 8,
                  max: 48,
                  step: 1,
                  description: "详情区内边距（像素）",
                },
              ],
            },
          ],
        },
        {
          kind: "section",
          id: "bag-detail-style",
          title: "详情面板样式",
          children: boxStyleFields("nodes.detailPanel.style"),
        },
      ];

    case "craftButton":
      return [
        {
          key: "nodes.craftButton.offsetY",
          kind: "number",
          label: "垂直偏移",
          step: 1,
          min: -400,
          max: 400,
          description: "相对详情面板底部的额外 Y 偏移（像素）",
        },
        {
          kind: "section",
          id: "bag-craft-style",
          title: "合成按钮样式",
          children: [
            ...boxStyleFields("nodes.craftButton.style"),
            ...textStyleFields("nodes.craftButton.style", { withLabel: true }),
          ],
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
 * 完整选中态表单接线见 Task 10。
 *
 * @returns 与 {@link backpackScreenGlobalFields} 相同
 *
 * @deprecated 请优先使用 backpackScreenGlobalFields / backpackScreenNodeFields
 */
export function backpackScreenFields(): FieldSchema[] {
  return backpackScreenGlobalFields();
}

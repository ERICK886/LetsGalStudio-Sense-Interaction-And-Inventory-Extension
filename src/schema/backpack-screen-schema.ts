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
  buttonSkinFields,
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
          description:
            "强调色；物品网格/详情为功能节点，遮罩/主面板/标题/按钮等请在图层组件中编辑",
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
        {
          kind: "section",
          id: "bag-close-skin",
          title: "按钮图片（三态）",
          description: "可选；按下→悬停→常态依次回退",
          children: buttonSkinFields("nodes.closeButton"),
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
            {
              key: "nodes.itemGrid.iconMaxSize",
              kind: "number",
              label: "格内图标大小",
              min: 24,
              max: 160,
              step: 1,
              description: "格内物品图片边长（像素）",
            },
          ],
        },
        {
          kind: "section",
          id: "bag-grid-style",
          title: "网格容器样式",
          children: boxStyleFields("nodes.itemGrid.style"),
        },
        {
          kind: "section",
          id: "bag-grid-cell-style",
          title: "格子常态样式",
          description: "未选中时的槽位底/边框/圆角",
          children: boxStyleFields("nodes.itemGrid.cellStyle"),
        },
        {
          kind: "section",
          id: "bag-grid-selected-style",
          title: "选中格样式",
          children: boxStyleFields("nodes.itemGrid.selectedStyle"),
        },
        {
          kind: "section",
          id: "bag-grid-cell-label-style",
          title: "格内名称样式",
          description: "图标下方物品 / 配方名",
          children: textStyleFields("nodes.itemGrid.cellLabelStyle"),
        },
        {
          kind: "section",
          id: "bag-grid-empty-style",
          title: "空态文案（道具）",
          description: "网格无物品时居中提示",
          children: textStyleFields("nodes.itemGrid.emptyStyle", {
            withLabel: true,
          }),
        },
        {
          kind: "section",
          id: "bag-grid-empty-craft-style",
          title: "空态文案（合成）",
          description: "网格无配方时居中提示",
          children: textStyleFields("nodes.itemGrid.emptyCraftStyle", {
            withLabel: true,
          }),
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
          title: "详情面板容器",
          children: boxStyleFields("nodes.detailPanel.style"),
        },
        {
          kind: "section",
          id: "bag-detail-hero-style",
          title: "大图框样式",
          children: boxStyleFields("nodes.detailPanel.heroStyle"),
        },
        {
          kind: "section",
          id: "bag-detail-title-style",
          title: "名称样式",
          children: textStyleFields("nodes.detailPanel.titleStyle"),
        },
        {
          kind: "section",
          id: "bag-detail-meta-style",
          title: "副文案样式",
          description: "数量、可合成 / 原料不足等",
          children: textStyleFields("nodes.detailPanel.metaStyle"),
        },
        {
          kind: "section",
          id: "bag-detail-description-style",
          title: "描述样式",
          children: textStyleFields("nodes.detailPanel.descriptionStyle"),
        },
        {
          kind: "section",
          id: "bag-detail-empty-style",
          title: "空态文案（道具）",
          description: "未选中物品时的提示",
          children: textStyleFields("nodes.detailPanel.emptyStyle", {
            withLabel: true,
          }),
        },
        {
          kind: "section",
          id: "bag-detail-empty-craft-style",
          title: "空态文案（合成）",
          description: "未选中配方时的提示",
          children: textStyleFields("nodes.detailPanel.emptyCraftStyle", {
            withLabel: true,
          }),
        },
        {
          kind: "section",
          id: "bag-detail-ingredients-label-style",
          title: "合成原料·标题样式",
          description: "详情区「原料」小标题",
          children: textStyleFields("nodes.detailPanel.ingredientsLabelStyle", {
            withLabel: true,
          }),
        },
        {
          kind: "section",
          id: "bag-detail-ingredients-style",
          title: "合成原料·列表样式",
          description: "原料摘要正文（如「钥匙碎片 ×3」）",
          children: textStyleFields("nodes.detailPanel.ingredientsStyle"),
        },
      ];

    case "craftButton":
      return [
        {
          kind: "section",
          id: "bag-craft-geometry",
          title: "合成按钮尺寸与偏移",
          description: "位置锚定详情底边；可单独设置宽高覆盖默认",
          children: [
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
              kind: "grid",
              id: "bag-craft-size",
              columns: 2,
              gap: 8,
              children: [
                {
                  key: "nodes.craftButton.w",
                  kind: "number",
                  label: "宽度",
                  min: 48,
                  step: 1,
                  description: "设计像素；空/非法则用详情区内宽",
                },
                {
                  key: "nodes.craftButton.h",
                  kind: "number",
                  label: "高度",
                  min: 24,
                  step: 1,
                  description: "设计像素；空/非法则默认 44",
                },
              ],
            },
          ],
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
        {
          kind: "section",
          id: "bag-craft-skin",
          title: "按钮图片（三态）",
          description: "可选；按下→悬停→常态依次回退",
          children: buttonSkinFields("nodes.craftButton"),
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

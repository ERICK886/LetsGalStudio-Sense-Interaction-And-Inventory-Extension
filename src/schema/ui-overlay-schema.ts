/**
 * ui-overlay-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * UI 区块自由图层的 FormRenderer schema。
 */

import type { UiOverlayKind } from "../domain/types";
import { UI_OVERLAY_KIND_LABELS } from "../domain/ui-overlay";
import type { FieldSchema } from "./types";
import {
  boxStyleFields,
  buttonSkinFields,
  rectFields,
  textStyleFields,
} from "./ui-style-fields";

/**
 * @param kind - 图层种类
 * @returns 中文名
 */
function kindLabel(kind: UiOverlayKind): string {
  return UI_OVERLAY_KIND_LABELS[kind];
}

/**
 * 选中某图层时的属性字段（路径相对于 overlays[i] 需由调用方用 prefix）。
 *
 * @param prefix - 如 `overlays.0`
 * @param kind - 图层种类
 * @returns FieldSchema[]
 */
export function uiOverlayFields(
  prefix: string,
  kind: UiOverlayKind,
): FieldSchema[] {
  const common: FieldSchema[] = [
    {
      kind: "section",
      id: `${prefix}-identity`,
      title: `${kindLabel(kind)} · 标识`,
      children: [
        {
          key: `${prefix}.name`,
          kind: "string",
          label: "名称",
          placeholder: kindLabel(kind),
        },
        {
          key: `${prefix}.zIndex`,
          kind: "number",
          label: "叠放顺序",
          step: 1,
          description: "数值越大越靠上",
        },
      ],
    },
    {
      kind: "section",
      id: `${prefix}-geom`,
      title: "位置与大小",
      children: [
        {
          kind: "grid",
          id: `${prefix}-rect`,
          columns: 2,
          gap: 8,
          children: rectFields(`${prefix}.rect`, { withSize: true }),
        },
      ],
    },
    {
      kind: "section",
      id: `${prefix}-transform`,
      title: "变换",
      children: [
        {
          key: `${prefix}.rotation`,
          kind: "number",
          label: "旋转（度）",
          step: 1,
        },
        {
          key: `${prefix}.flipH`,
          kind: "boolean",
          label: "水平反转",
        },
        {
          key: `${prefix}.flipV`,
          kind: "boolean",
          label: "垂直反转",
        },
        {
          key: `${prefix}.opacity`,
          kind: "number",
          label: "不透明度",
          min: 0,
          max: 1,
          step: 0.01,
        },
      ],
    },
  ];

  const styleSection: FieldSchema = {
    kind: "section",
    id: `${prefix}-style`,
    title: "样式",
    children: [
      ...boxStyleFields(`${prefix}.style`),
      ...textStyleFields(`${prefix}.style`, {
        // 按钮文案走 props.text，避免与 style.label 双字段互相回填
        withLabel: kind === "text",
      }),
    ],
  };

  const cssSection: FieldSchema = {
    kind: "section",
    id: `${prefix}-css`,
    title: "自定义 CSS（进阶）",
    description: "作用域隔离；支持 &:hover / &:active / @keyframes",
    children: [
      {
        key: `${prefix}.customCss`,
        kind: "string",
        label: "CSS",
        multiline: true,
        placeholder: "transition: transform .12s ease;\n&:hover { transform: scale(1.05); }",
      },
    ],
  };

  const kindFields: FieldSchema[] = [];

  switch (kind) {
    case "text":
      kindFields.push({
        kind: "section",
        id: `${prefix}-text`,
        title: "内容",
        children: [
          {
            key: `${prefix}.props.text`,
            kind: "string",
            label: "文字内容",
            multiline: true,
          },
          {
            key: `${prefix}.props.icon`,
            kind: "string",
            label: "图标",
            placeholder: "如 star、book、tag",
            description: "Font Awesome 图标名（不含 fa-），显示在文字前",
          },
        ],
      });
      break;
    case "image":
      kindFields.push({
        kind: "section",
        id: `${prefix}-image`,
        title: "素材",
        children: [
          {
            key: `${prefix}.props.asset`,
            kind: "asset",
            label: "图片",
            accept: "image",
            showPreview: true,
          },
        ],
      });
      break;
    case "button":
      kindFields.push(
        {
          kind: "section",
          id: `${prefix}-btn-text`,
          title: "按钮文案",
          children: [
            {
              key: `${prefix}.props.text`,
              kind: "string",
              label: "文字",
              placeholder: "可留空",
              description: "可留空；与图标独立，二者可只保留其一",
            },
            {
              key: `${prefix}.props.icon`,
              kind: "string",
              label: "图标",
              placeholder: "如 xmark、flask、bag-shopping",
              description:
                "Font Awesome 图标名（不含 fa-）；可与文字同时留空（仅皮肤/底色）",
            },
            {
              key: `${prefix}.role`,
              kind: "enum",
              label: "功能绑定",
              options: [
                { value: "none", label: "无（仅外观）" },
                { value: "closeBag", label: "关闭背包" },
                { value: "toggleMode", label: "切换道具/合成" },
                { value: "craft", label: "合成确认" },
                { value: "openBag", label: "打开背包" },
              ],
            },
          ],
        },
        {
          kind: "section",
          id: `${prefix}-btn-skin`,
          title: "按钮图片（三态）",
          children: buttonSkinFields(`${prefix}.skin`),
        },
      );
      break;
    case "line":
      kindFields.push({
        kind: "section",
        id: `${prefix}-line`,
        title: "线条",
        description: "宽≥高画横线，否则竖线，线体居中",
        children: [
          {
            key: `${prefix}.props.thickness`,
            kind: "number",
            label: "粗细",
            min: 1,
            max: 32,
            step: 1,
          },
          {
            key: `${prefix}.props.lineStyle`,
            kind: "enum",
            label: "线型",
            options: [
              { value: "solid", label: "实线" },
              { value: "dashed", label: "虚线" },
              { value: "dotted", label: "点线" },
            ],
          },
        ],
      });
      break;
    case "select":
      kindFields.push({
        kind: "section",
        id: `${prefix}-select`,
        title: "下拉选项",
        children: [
          {
            key: `${prefix}.props.options`,
            kind: "string",
            label: "选项（逗号分隔）",
          },
          {
            key: `${prefix}.props.initialIndex`,
            kind: "number",
            label: "初始选中下标",
            min: 0,
            step: 1,
          },
        ],
      });
      break;
    case "switch":
      kindFields.push({
        kind: "section",
        id: `${prefix}-switch`,
        title: "开关",
        children: [
          {
            key: `${prefix}.props.initialOn`,
            kind: "boolean",
            label: "初始状态开",
          },
          {
            key: `${prefix}.props.onAsset`,
            kind: "asset",
            label: "开态图片",
            accept: "image",
            showPreview: true,
          },
          {
            key: `${prefix}.props.offAsset`,
            kind: "asset",
            label: "关态图片",
            accept: "image",
            showPreview: true,
          },
        ],
      });
      break;
    case "slider":
      kindFields.push({
        kind: "section",
        id: `${prefix}-slider`,
        title: "滑块",
        children: [
          {
            key: `${prefix}.props.initialValue`,
            kind: "number",
            label: "初始值",
            min: 0,
            max: 100,
            step: 1,
          },
          {
            key: `${prefix}.props.showValue`,
            kind: "boolean",
            label: "显示数值",
          },
          {
            key: `${prefix}.props.trackAsset`,
            kind: "asset",
            label: "轨道图片",
            accept: "image",
            showPreview: true,
          },
          {
            key: `${prefix}.props.fillAsset`,
            kind: "asset",
            label: "填充图片",
            accept: "image",
            showPreview: true,
          },
          {
            key: `${prefix}.props.handleAsset`,
            kind: "asset",
            label: "把手图片",
            accept: "image",
            showPreview: true,
          },
        ],
      });
      break;
    case "checkbox":
      kindFields.push({
        kind: "section",
        id: `${prefix}-checkbox`,
        title: "勾选框",
        children: [
          {
            key: `${prefix}.props.initialOn`,
            kind: "boolean",
            label: "初始勾选",
          },
          {
            key: `${prefix}.props.text`,
            kind: "string",
            label: "文字",
          },
          {
            key: `${prefix}.props.checkedAsset`,
            kind: "asset",
            label: "勾选图片",
            accept: "image",
            showPreview: true,
          },
          {
            key: `${prefix}.props.uncheckedAsset`,
            kind: "asset",
            label: "未勾选图片",
            accept: "image",
            showPreview: true,
          },
        ],
      });
      break;
    case "input":
      kindFields.push({
        kind: "section",
        id: `${prefix}-input`,
        title: "输入框",
        children: [
          {
            key: `${prefix}.props.placeholder`,
            kind: "string",
            label: "占位文字",
          },
          {
            key: `${prefix}.props.text`,
            kind: "string",
            label: "初始文本",
          },
          {
            key: `${prefix}.props.maxLength`,
            kind: "number",
            label: "最大长度",
            min: 0,
            step: 1,
            description: "0 表示不限制",
          },
        ],
      });
      break;
    case "tabs":
      kindFields.push({
        kind: "section",
        id: `${prefix}-tabs`,
        title: "页签",
        children: [
          {
            key: `${prefix}.props.options`,
            kind: "string",
            label: "页签（逗号分隔）",
          },
          {
            key: `${prefix}.props.initialIndex`,
            kind: "number",
            label: "当前页下标",
            min: 0,
            step: 1,
          },
          {
            key: `${prefix}.props.tabGap`,
            kind: "number",
            label: "间距",
            min: 0,
            step: 1,
          },
          {
            key: `${prefix}.props.tabAsset`,
            kind: "asset",
            label: "页签图片",
            accept: "image",
            showPreview: true,
          },
          {
            key: `${prefix}.props.activeTabAsset`,
            kind: "asset",
            label: "激活图片",
            accept: "image",
            showPreview: true,
          },
        ],
      });
      break;
    default:
      break;
  }

  return [...common, ...kindFields, styleSection, cssSection];
}

/**
 * hotspot-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * 交互点（HotspotElement）的属性表单 schema 生成。
 * 视觉区含 hoverShadow 总开关、跟随全局开关；关闭跟随时才显示光晕/底影本地层字段。
 * 动作列表由 ActionListField 单独渲染，不在本 schema 内。
 * 另导出 `hotspotHoverPresetFields()`：全局场景 UI 悬停预设字段（不含 useGlobal）。
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
 * 全局交互点悬停预设（`SceneUiConfig.hotspotHover`）的属性表单字段。
 *
 * 与 `hotspotFields` 中 hoverShadow 段字段一致，但：
 * - 不含 `useGlobal`（全局段不使用该决策字段）
 * - key 路径以 `HotspotHoverShadow` 根为基准（`enabled` / `glow.*` / `base.*`），
 *   而非交互点实例的 `hoverShadow.*` 前缀
 *
 * @returns FieldSchema 数组，供 FormRenderer 渲染全局预设编辑器
 *
 * @example
 * ```ts
 * <FormRenderer
 *   schema={hotspotHoverPresetFields()}
 *   value={sceneUi.hotspotHover as unknown as Record<string, unknown>}
 *   onChange={(next) => writeSceneUiConfig(ctx, {
 *     ...sceneUi,
 *     hotspotHover: next as unknown as HotspotHoverShadow,
 *   })}
 * />
 * ```
 */
export function hotspotHoverPresetFields(): FieldSchema[] {
  return [
    {
      key: "enabled",
      kind: "boolean",
      label: "悬停阴影",
      description: "总开关；关闭时不显示阴影。打开后由光晕/底影层开关决定",
    },
    {
      kind: "section",
      id: "preset-hover-shadow-glow",
      title: "光晕层",
      description: "悬停时的高亮光晕（drop-shadow）",
      children: [
        {
          key: "glow.enabled",
          kind: "boolean",
          label: "启用光晕",
        },
        {
          key: "glow.color",
          kind: "color",
          label: "颜色",
          placeholder: "#FFECA0",
        },
        {
          kind: "grid",
          id: "preset-hover-shadow-glow-nums",
          columns: 2,
          gap: 8,
          children: [
            {
              key: "glow.opacity",
              kind: "number",
              label: "透明度",
              min: 0,
              max: 1,
              step: 0.05,
            },
            {
              key: "glow.intensity",
              kind: "number",
              label: "强度",
              min: 0,
              max: 2,
              step: 0.05,
              description: "乘到透明度上，最终 alpha 限制在 0–1",
            },
            {
              key: "glow.offsetX",
              kind: "number",
              label: "偏移 X",
              step: 1,
            },
            {
              key: "glow.offsetY",
              kind: "number",
              label: "偏移 Y",
              step: 1,
            },
            {
              key: "glow.blur",
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
      id: "preset-hover-shadow-base",
      title: "底影层",
      description: "悬停时的暗色软影（drop-shadow）",
      children: [
        {
          key: "base.enabled",
          kind: "boolean",
          label: "启用底影",
        },
        {
          key: "base.color",
          kind: "color",
          label: "颜色",
          placeholder: "#000000",
        },
        {
          kind: "grid",
          id: "preset-hover-shadow-base-nums",
          columns: 2,
          gap: 8,
          children: [
            {
              key: "base.opacity",
              kind: "number",
              label: "透明度",
              min: 0,
              max: 1,
              step: 0.05,
            },
            {
              key: "base.intensity",
              kind: "number",
              label: "强度",
              min: 0,
              max: 2,
              step: 0.05,
              description: "乘到透明度上，最终 alpha 限制在 0–1",
            },
            {
              key: "base.offsetX",
              kind: "number",
              label: "偏移 X",
              step: 1,
            },
            {
              key: "base.offsetY",
              kind: "number",
              label: "偏移 Y",
              step: 1,
            },
            {
              key: "base.blur",
              kind: "number",
              label: "模糊",
              min: 0,
              step: 1,
            },
          ],
        },
      ],
    },
  ];
}

/**
 * 交互点实例本地光晕层 / 底影层字段（`hoverShadow.*` 前缀）。
 * 仅在 `hoverShadow.useGlobal === false` 时由 `hotspotFields` 渲染。
 *
 * @returns 光晕层与底影层 section 字段
 */
function hotspotLocalHoverShadowLayerFields(): FieldSchema[] {
  return [
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
  ];
}

/**
 * 根据交互点当前状态生成属性面板字段 schema 列表。
 *
 * 分区：基本（含 once）、位置、视觉（含 hoverShadow 跟随全局 / 条件本地总开关与层）、标签、动画。
 * `actions` 由 `ActionListField` 在属性面板中单独编辑。
 *
 * `hoverShadow.useGlobal !== false`（跟随全局）时，本地总开关与光晕/底影层
 * 全部隐藏，仅展示「跟随全局悬停预设」开关与提示；因为 resolve 在跟随全局时
 * 忽略本地 enabled/glow/base，统一由 `SceneUiConfig.hotspotHover` 决定。
 *
 * @param hotspot - 当前交互点；`hoverShadow.useGlobal !== false` 时隐藏本地悬停字段
 * @returns FieldSchema 数组，供 FormRenderer 渲染
 *
 * @example
 * ```ts
 * const fields = hotspotFields(hotspot);
 * ```
 */
export function hotspotFields(hotspot: HotspotElement): FieldSchema[] {
  const followGlobal = hotspot.hoverShadow?.useGlobal !== false;
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
          key: "hoverShadow.useGlobal",
          kind: "boolean",
          label: "跟随全局悬停预设",
          description:
            "开启后由「界面 → 场景 UI → 交互点悬停」控制；关闭后可单独设置总开关与光晕/底影",
        },
        ...(followGlobal
          ? [
              {
                kind: "section" as const,
                id: "hover-shadow-global-hint",
                title: "悬停阴影",
                description:
                  "当前跟随全局悬停预设，总开关与光晕/底影均由「界面 → 场景 UI → 交互点悬停」统一控制。",
                children: [],
              },
            ]
          : [
              {
                key: "hoverShadow.enabled",
                kind: "boolean" as const,
                label: "悬停阴影",
                description:
                  "总开关；关闭时不显示阴影。打开后由光晕/底影层开关决定",
              },
              ...hotspotLocalHoverShadowLayerFields(),
            ]),
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

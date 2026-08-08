/**
 * motion-section.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 属性面板共用「动画」分区：入场/退场预设、延迟、时长。
 * 支持 keyPrefix（如 label.motion）嵌套路径。
 */

import { MOTION_MS_MAX } from "../domain/motion";
import type { MotionPresetId } from "../domain/types";
import type { FieldSchema, SectionFieldSchema } from "./types";

/** 动效预设下拉选项 */
export const MOTION_PRESET_OPTIONS: ReadonlyArray<{
  value: MotionPresetId;
  label: string;
}> = [
  { value: "none", label: "无" },
  { value: "fade", label: "淡入/淡出" },
  { value: "scale", label: "缩放" },
  { value: "slideUp", label: "上滑" },
  { value: "slideDown", label: "下滑" },
  { value: "slideLeft", label: "左滑" },
  { value: "slideRight", label: "右滑" },
];

/**
 * 生成入场或退场一侧的字段列表。
 *
 * @param prefix - 如 `"motion.enter"` / `"label.motion.exit"`
 * @param titlePrefix - 标签前缀，如「入场」
 * @param sectionDescription - 挂在预设字段上的说明（可选）
 * @returns 叶子 FieldSchema 数组
 */
function motionSideFields(
  prefix: string,
  titlePrefix: string,
  sectionDescription?: string,
): FieldSchema[] {
  return [
    {
      key: `${prefix}.preset`,
      kind: "enum",
      label: `${titlePrefix}预设`,
      options: MOTION_PRESET_OPTIONS,
      description:
        sectionDescription ??
        (titlePrefix === "入场"
          ? "选「无」则不播放该侧动画"
          : "选「无」则不播放该侧动画"),
    },
    {
      kind: "grid",
      id: `${prefix}-timing`,
      columns: 2,
      gap: 8,
      children: [
        {
          key: `${prefix}.delayMs`,
          kind: "number",
          label: `${titlePrefix}延迟 (ms)`,
          min: 0,
          max: MOTION_MS_MAX,
          step: 10,
        },
        {
          key: `${prefix}.durationMs`,
          kind: "number",
          label: `${titlePrefix}时长 (ms)`,
          min: 0,
          max: MOTION_MS_MAX,
          step: 10,
        },
      ],
    },
  ];
}

/**
 * 场景 / 交互点共用的「动画」section。
 *
 * @param options.forBase - true 时文案标明作用于底图/场景
 * @param options.keyPrefix - 字段前缀，默认 `"motion"`；标签用 `"label.motion"`
 * @param options.sectionId - section id，默认 `"motion"`
 * @param options.title - 分区标题，默认「动画」
 * @param options.description - 覆盖入场预设说明
 * @returns SectionFieldSchema
 *
 * @example
 * ```ts
 * children: [..., motionSection()]
 * children: [..., motionSection({ keyPrefix: "label.motion", title: "标签动画" })]
 * ```
 */
export function motionSection(options?: {
  forBase?: boolean;
  keyPrefix?: string;
  sectionId?: string;
  title?: string;
  description?: string;
}): SectionFieldSchema {
  const keyPrefix = options?.keyPrefix ?? "motion";
  const hint =
    options?.description ??
    (options?.forBase
      ? "打开/关闭场景时播放的底图入场与退场；选「无」可关闭"
      : "打开/关闭场景时播放；编辑器画布不预览；选「无」可关闭");

  return {
    kind: "section",
    id: options?.sectionId ?? "motion",
    title: options?.title ?? "动画",
    children: [
      ...motionSideFields(`${keyPrefix}.enter`, "入场", hint),
      ...motionSideFields(`${keyPrefix}.exit`, "退场"),
    ],
  };
}

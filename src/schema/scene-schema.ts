/**
 * scene-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 场景定义（SceneDefinition）的属性表单 schema 生成。
 * 含名称、底图、切换转场、动效；画面底色配置已移除（运行时透明铺底）。
 */

import type { SceneDefinition, SceneTransitionMode } from "../domain/types";
import { motionSection } from "./motion-section";
import type { FieldSchema } from "./types";

/** 场景切换转场选项 */
export const SCENE_TRANSITION_MODE_OPTIONS: ReadonlyArray<{
  value: SceneTransitionMode;
  label: string;
}> = [
  { value: "fade", label: "淡入淡出" },
  { value: "cover", label: "覆盖" },
];

/**
 * 根据场景当前状态生成属性面板字段 schema 列表。
 *
 * @param _scene - 场景定义（保留参数供调用方一致；当前无条件字段）
 * @returns FieldSchema 数组，供 FormRenderer 渲染
 *
 * @example
 * ```ts
 * const fields = sceneFields(currentScene);
 * ```
 */
export function sceneFields(_scene: SceneDefinition): FieldSchema[] {
  return [
    {
      kind: "section",
      id: "basic",
      title: "基本",
      children: [
        {
          key: "name",
          kind: "string",
          label: "场景名称",
          placeholder: "未命名场景",
        },
        {
          key: "baseImage",
          kind: "asset",
          label: "底图资源",
          accept: "image",
          showPreview: true,
          placeholder: "asset://scenes/room.png",
          description: "支持 asset:// 或 HTTP(S) URL；无底图时透明铺底",
        },
      ],
    },
    {
      kind: "section",
      id: "transition",
      title: "切换转场",
      children: [
        {
          key: "transitionMode",
          kind: "enum",
          label: "进入本场景时",
          options: SCENE_TRANSITION_MODE_OPTIONS,
          description:
            "淡入淡出：新旧场景同时溶换（不露底）；覆盖：新场景叠在旧场景上覆入（可配合下方入场滑入/缩放）",
        },
      ],
    },
    motionSection({
      forBase: true,
      description:
        "入场预设影响覆盖转场的方向/缩放；时长/延迟用于场景切换。选「无」则覆盖时仅透明度叠入",
    }),
  ];
}

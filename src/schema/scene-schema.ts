/**
 * scene-schema.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 场景定义（SceneDefinition）的属性表单 schema 生成。
 * 含名称、底图、letterbox、动效基础字段。
 * 自定义底色允许 Alpha（`#RRGGBBAA`），便于半透露出下层引擎 UI。
 */

import type { SceneDefinition } from "../domain/types";
import { motionSection } from "./motion-section";
import type { FieldSchema } from "./types";

/** letterbox 底色模式选项 */
export const LETTERBOX_MODE_OPTIONS = [
  { value: "black", label: "黑底" },
  { value: "white", label: "白底" },
  { value: "custom", label: "自定义" },
] as const;

/**
 * 根据场景当前状态生成属性面板字段 schema 列表。
 *
 * @param scene - 场景定义（letterboxMode 条件展开自定义色）
 * @returns FieldSchema 数组，供 FormRenderer 渲染
 *
 * @example
 * ```ts
 * const fields = sceneFields(currentScene);
 * ```
 */
export function sceneFields(scene: SceneDefinition): FieldSchema[] {
  const letterboxMode = scene.letterboxMode ?? "black";

  const letterboxChildren: FieldSchema[] = [
    {
      key: "letterboxMode",
      kind: "enum",
      label: "画面底色",
      options: LETTERBOX_MODE_OPTIONS,
      description: "设计画幅 contain 满屏后，多余区域的填充色",
    },
  ];

  if (letterboxMode === "custom") {
    letterboxChildren.push({
      key: "letterboxColor",
      kind: "color",
      label: "自定义底色",
      /**
       * 允许 Alpha：拾色器输出 `#RRGGBBAA`，运行时作 CSS background，
       * 可半透露出下层对话框等引擎层。
       */
      allowAlpha: true,
      placeholder: "#000000FF",
      description: "支持透明度；八位十六进制如 #00000080 为半透明黑",
    });
  }

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
          description: "支持 asset:// 或 HTTP(S) URL",
        },
      ],
    },
    {
      kind: "section",
      id: "letterbox",
      title: "画面",
      children: letterboxChildren,
    },
    motionSection({
      forBase: true,
      description: "打开/关闭场景时播放的底图入场与退场；选「无」可关闭",
    }),
  ];
}

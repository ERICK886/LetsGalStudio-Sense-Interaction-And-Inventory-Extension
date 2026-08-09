/**
 * editor-extension.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 作者工具程序：`@extension({ id: "editor" })`。
 * 持有场景 / 物品 / 配方库等作者 settings，render EditorApp。
 */

import {
  Extension,
  extension,
  settings,
  type ExtensionRenderData,
} from "@avg-studio/sdk";
import {
  EditorApp,
  type EditorAppProps,
} from "../app/editor-app";
import { EDITOR_MODULE_ID } from "../shared/module-ids";

/**
 * 场景交互 — 编辑器模块。
 *
 * - settings：作者库 JSON、设计分辨率、栏宽、主题、默认场景等
 * - 无 saveSchema（玩家进度在 scene-interaction）
 * - render：EditorApp → EditorShell
 *
 * @remarks
 * `extension.json.id`（`ink.zenly.ext-27b96b`）是包 id，与本程序 id `editor` 不同。
 */
@extension({ id: EDITOR_MODULE_ID, label: "场景编辑器" })
export class EditorExtension extends Extension<EditorAppProps> {
  /**
   * 项目设置：作者内容与编辑器外观。
   *
   * 运行时模块通过 `settings.cross.get("editor", key)` 读取库 JSON。
   */
  static settings = settings((s) => ({
    allowEdit: s.boolean("允许编辑").default(true),
    theme: s
      .enum("界面主题", ["light", "dark"] as const)
      .labels({ light: "浅色", dark: "深色" })
      .default("dark"),
    defaultSceneId: s.string("默认场景 ID").default(""),
    scenesLibraryJson: s
      .string("场景库 JSON（自动维护）")
      .default('{"version":1,"scenes":[]}'),
    itemsLibraryJson: s
      .string("物品库 JSON（自动维护）")
      .default('{"version":1,"items":[]}'),
    recipesLibraryJson: s
      .string("配方库 JSON（自动维护）")
      .default('{"version":1,"recipes":[]}'),
    editorLeftWidth: s
      .number("编辑器左栏宽度")
      .default(260)
      .range(180, 480),
    editorRightWidth: s
      .number("编辑器右栏宽度")
      .default(300)
      .range(220, 520),
    designWidth: s
      .number("设计分辨率宽度")
      .default(1920)
      .range(320, 7680),
    designHeight: s
      .number("设计分辨率高度")
      .default(1080)
      .range(320, 7680),
    sceneUiJson: s
      .string("场景 UI 预设 JSON（获得提示 + 悬停）")
      .default(""),
  }));

  /**
   * 渲染编辑器 UI。
   *
   * @returns ExtensionRenderData（无 save 注入）
   */
  render(): ExtensionRenderData<EditorAppProps> {
    return {
      component: EditorApp,
      props: {},
    };
  }
}

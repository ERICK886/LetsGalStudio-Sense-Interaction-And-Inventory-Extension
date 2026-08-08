/**
 * index.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 场景交互系统扩展包入口：具名导出多个 `@extension` 程序。
 *
 * - EditorExtension：作者工具（settings 库）
 * - SceneInteractionExtension：游戏运行时（场景 + save + methods）
 * - BackpackHudExtension：快捷栏 HUD + 全屏背包
 *
 * @remarks
 * `extension.json.id`（`ext-27b96b`）是包/项目 id，勿与子模块 id 混淆。
 */

export { EditorExtension } from "./modules/editor-extension";
export { SceneInteractionExtension } from "./modules/scene-interaction-extension";
export { BackpackHudExtension } from "./modules/backpack-hud-extension";

/** 默认导出游戏运行时 */
export { SceneInteractionExtension as default } from "./modules/scene-interaction-extension";

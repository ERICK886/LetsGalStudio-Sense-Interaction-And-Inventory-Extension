/**
 * index.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 场景交互系统扩展包入口：具名导出多个 `@extension` 程序（对齐 phone-sdk）。
 *
 * - EditorExtension：作者工具（settings 库）
 * - SceneInteractionExtension：游戏运行时（save + methods）
 *
 * @remarks
 * `extension.json.id`（`ext-27b96b`）是包/项目 id，勿与子模块 id 混淆。
 */

export { EditorExtension } from "./modules/editor-extension";
export { SceneInteractionExtension } from "./modules/scene-interaction-extension";

/** 默认导出游戏运行时（Studio 预览 / 剧本常用入口） */
export { SceneInteractionExtension as default } from "./modules/scene-interaction-extension";

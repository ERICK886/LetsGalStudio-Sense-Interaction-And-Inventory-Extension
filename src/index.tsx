/**
 * index.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.2
 *
 * 场景交互系统扩展包入口：具名导出多个 `@extension` 程序。
 *
 * - EditorExtension：作者工具（settings 库）
 * - SceneInteractionExtension：游戏运行时（场景 + save + methods）
 * - BackpackHudExtension：快捷栏 HUD（设计位置，紧凑宿主）
 * - BackpackExtension：全屏背包（与 HUD 分离）
 * - studio/scene-inline-cards：剧本方法块内联摘要卡片（侧效安装）
 *
 * @remarks
 * `extension.json.id`（`ink.zenly.ext-27b96b`）是包/项目 id，勿与子模块 id 混淆。
 * 片段跳转（可跳回 / 不可跳回）是交互点 SceneAction，不单独成扩展。
 */

/** Studio 剧本方法块 → 摘要卡片（hack；与扩展同包加载） */
import "./studio/scene-inline-cards";

export { EditorExtension } from "./modules/editor-extension";
export { SceneInteractionExtension } from "./modules/scene-interaction-extension";
export { BackpackHudExtension } from "./modules/backpack-hud-extension";
export { BackpackExtension } from "./modules/backpack-extension";

/** 默认导出游戏运行时 */
export { SceneInteractionExtension as default } from "./modules/scene-interaction-extension";

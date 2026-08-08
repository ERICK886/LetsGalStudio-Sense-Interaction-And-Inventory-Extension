/**
 * module-ids.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 本包内各 `@extension` 程序的稳定 id（≠ extension.json.id `ext-27b96b`）。
 * ui.show / settings.cross 均使用这些 id。
 */

/** 作者工具：场景 / 物品库 / 配方编辑 */
export const EDITOR_MODULE_ID = "editor";

/** 游戏运行时：场景交互 + 阻塞会话 + 玩家存档 */
export const SCENE_INTERACTION_MODULE_ID = "scene-interaction";

/** 背包 / 快捷栏 HUD（独立程序） */
export const BACKPACK_HUD_MODULE_ID = "backpack-hud";

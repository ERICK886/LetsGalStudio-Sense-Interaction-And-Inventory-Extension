/**
 * module-ids.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 本包内各 `@extension` 程序的稳定 id（≠ extension.json.id `ink.zenly.ext-27b96b`）。
 * ui.show / settings.cross 均使用这些 id。
 */

/**
 * 扩展包 id（`extension.json.id`）。
 * 剧本 method 的 ctx 可能按包 id 做 ui 路径前缀，与模块内 render 的前缀不一致。
 */
export const EXTENSION_PACKAGE_ID = "ink.zenly.ext-27b96b";

/** 作者工具：场景 / 物品库 / 配方编辑 */
export const EDITOR_MODULE_ID = "editor";

/** 游戏运行时：场景交互 + 阻塞会话 + 玩家存档 */
export const SCENE_INTERACTION_MODULE_ID = "scene-interaction";

/**
 * 快捷栏 HUD（独立程序）。
 * 仅设计包围盒区域可点，不含全屏背包。
 */
export const BACKPACK_HUD_MODULE_ID = "backpack-hud";

/**
 * 全屏背包（独立程序，与 HUD 分离）。
 */
export const BACKPACK_MODULE_ID = "backpack";

/**
 * 场景交互 UI 在宿主里可能出现的路径候选（含 slash 的不会再被 scope 加前缀）。
 *
 * @returns 去重后的路径列表
 */
export function sceneInteractionUiPathCandidates(): string[] {
  /**
   * 包级绝对路径优先：剧本 method 的 ctx 常按「包id/模块id」注册，
   * 而模块内 isVisible("scene-interaction") 会变成 scene-interaction/scene-interaction，导致假阴性。
   */
  return [
    `${EXTENSION_PACKAGE_ID}/${SCENE_INTERACTION_MODULE_ID}`,
    `${SCENE_INTERACTION_MODULE_ID}/${SCENE_INTERACTION_MODULE_ID}`,
    SCENE_INTERACTION_MODULE_ID,
  ];
}

/**
 * 快捷栏 HUD UI 路径候选。
 *
 * @returns 去重后的路径列表
 */
export function backpackHudUiPathCandidates(): string[] {
  return [
    `${EXTENSION_PACKAGE_ID}/${BACKPACK_HUD_MODULE_ID}`,
    `${SCENE_INTERACTION_MODULE_ID}/${BACKPACK_HUD_MODULE_ID}`,
    `${BACKPACK_HUD_MODULE_ID}/${BACKPACK_HUD_MODULE_ID}`,
    BACKPACK_HUD_MODULE_ID,
  ];
}

/**
 * 全屏背包 UI 路径候选。
 *
 * @returns 去重后的路径列表
 */
export function backpackUiPathCandidates(): string[] {
  return [
    `${EXTENSION_PACKAGE_ID}/${BACKPACK_MODULE_ID}`,
    `${SCENE_INTERACTION_MODULE_ID}/${BACKPACK_MODULE_ID}`,
    `${BACKPACK_MODULE_ID}/${BACKPACK_MODULE_ID}`,
    BACKPACK_MODULE_ID,
  ];
}

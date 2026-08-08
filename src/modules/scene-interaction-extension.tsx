/**
 * scene-interaction-extension.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 游戏运行时程序：`@extension({ id: "scene-interaction" })`。
 * 持有玩家 save、HUD settings、剧本 methods；render Runtime / Player。
 */

import {
  Extension,
  extension,
  defineSave,
  settings,
  type ExtensionRenderData,
  type SaveAPI,
} from "@avg-studio/sdk";
import {
  SceneInteractionApp,
  type SceneInteractionAppProps,
} from "../app/scene-interaction-app";
import {
  craftRecipe,
  getItemCount,
  giveItem,
  hasItem,
} from "../methods/inventory-methods";
import {
  closeSceneInteraction,
  getCurrentSceneId,
  openScene,
  openSceneInteraction,
  setEditMode,
  setHotspotVisible,
} from "../methods/scene-methods";
import { SCENE_INTERACTION_MODULE_ID } from "../shared/module-ids";
import type { SceneInteractionSaveMap } from "../store/save-types";

/**
 * 场景交互 — 运行时模块。
 *
 * - saveSchema：库存 / 进度 / 编辑模式兼容字段 / 当前场景
 * - settings：HUD 相关（迁出 backpack-hud 前暂留本模块）
 * - methods：打开场景 / 阻塞会话 / 库存等
 * - render：SceneInteractionApp（RuntimeShell / PlayerShell）
 *
 * @remarks
 * 作者库（场景/物品/配方）在 `editor` 模块；本模块用 `settings.cross` 读取。
 */
@extension({ id: SCENE_INTERACTION_MODULE_ID, label: "场景交互" })
export class SceneInteractionExtension extends Extension<SceneInteractionAppProps> {
  /**
   * 存档字段：JSON 字符串存复杂结构，boolean/string 存运行时状态。
   *
   * @see SceneInteractionSaveMap
   */
  static saveSchema = defineSave({
    inventoryJson: {
      type: "string",
      persistence: "slot",
      default: '{"entries":[]}',
      label: "库存 JSON",
    },
    progressJson: {
      type: "string",
      persistence: "slot",
      default: '{"consumed":{}}',
      label: "场景进度 JSON",
    },
    isEditMode: {
      type: "boolean",
      persistence: "slot",
      default: false,
      label: "编辑模式（兼容）",
    },
    currentSceneId: {
      type: "string",
      persistence: "slot",
      default: "",
      label: "当前场景 ID",
    },
  });

  /** 剧本 methods：场景打开 / 阻塞会话 / 编辑器 / 当前场景 / 交互点可见性 */
  static openScene = openScene;
  static openSceneInteraction = openSceneInteraction;
  static closeSceneInteraction = closeSceneInteraction;
  static setEditMode = setEditMode;
  static getCurrentSceneId = getCurrentSceneId;
  static setHotspotVisible = setHotspotVisible;

  /** 剧本 methods：库存给予 / 查询 / 合成 */
  static giveItem = giveItem;
  static hasItem = hasItem;
  static getItemCount = getItemCount;
  static craftRecipe = craftRecipe;

  /**
   * HUD 相关设置（作者库已迁至 editor；此处仅保留运行时 HUD）。
   */
  static settings = settings((s) => ({
    inventoryHudMode: s
      .enum("物品栏显示模式", ["withScene", "always"] as const)
      .labels({ withScene: "跟随场景交互", always: "常驻 HUD" })
      .default("withScene"),
    inventoryHudJson: s.string("物品栏外观 JSON").default(""),
  }));

  /**
   * 渲染运行时 UI 根组件。
   *
   * @returns ExtensionRenderData，props 中注入 this.save
   */
  render(): ExtensionRenderData<SceneInteractionAppProps> {
    return {
      component: SceneInteractionApp,
      props: {
        save: this.save as unknown as SaveAPI<SceneInteractionSaveMap>,
      },
    };
  }
}

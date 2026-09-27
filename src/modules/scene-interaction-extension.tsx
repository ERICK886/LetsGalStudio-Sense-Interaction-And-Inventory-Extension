/**
 * scene-interaction-extension.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.1
 *
 * 游戏运行时程序：`@extension({ id: "scene-interaction" })`。
 * 持有玩家 save、预览沙箱 settings、剧本 methods；render Runtime / Player（不含背包 UI）。
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
  removeItem,
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
 * - saveSchema：玩家 slot（库存 / 进度 / 当前场景）
 * - settings：预览沙箱（Studio/编辑器测试用，不进玩家档）
 * - methods：打开场景 / 阻塞会话 / 库存等
 * - render：SceneInteractionApp（RuntimeShell / PlayerShell；不含背包 UI）
 *
 * @remarks
 * 作者库在 `editor`；背包 HUD 在 `backpack-hud`；库存 save 经会话桥接共享。
 */
@extension({ id: SCENE_INTERACTION_MODULE_ID, label: "场景交互" })
export class SceneInteractionExtension extends Extension<SceneInteractionAppProps> {
  /**
   * 预览沙箱：与 saveSchema 字段同形，但写在扩展 settings，便于测试。
   * 玩家游戏只读写下方 saveSchema，不会使用这些字段。
   */
  static settings = settings((s) => ({
    previewCurrentSceneId: s
      .string("预览当前场景 ID（测试用）")
      .default(""),
    previewSceneReturnStackJson: s
      .string("预览场景返回栈 JSON（测试用）")
      .default("[]"),
  }));

  /**
   * 玩家存档字段：JSON 字符串存复杂结构，boolean/string 存运行时状态。
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
    mainSceneId: {
      type: "string",
      persistence: "slot",
      default: "",
      label: "本次交互主场景 ID",
    },
    sceneReturnStackJson: {
      type: "string",
      persistence: "slot",
      default: "[]",
      label: "场景返回栈 JSON",
    },
  });

  /** 剧本 methods：场景打开 / 阻塞会话 / 编辑器 / 当前场景 / 交互点可见性 */
  static openScene = openScene;
  static openSceneInteraction = openSceneInteraction;
  static closeSceneInteraction = closeSceneInteraction;
  static setEditMode = setEditMode;
  static getCurrentSceneId = getCurrentSceneId;
  static setHotspotVisible = setHotspotVisible;

  /** 剧本 methods：库存给予 / 扣除 / 查询 / 合成 */
  static giveItem = giveItem;
  static removeItem = removeItem;
  static hasItem = hasItem;
  static getItemCount = getItemCount;
  static craftRecipe = craftRecipe;

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

/**
 * save-types.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互扩展存档字段类型，与 index.tsx defineSave / SceneInteractionApp 保持一致。
 */

/**
 * 与本扩展 `saveSchema` 对应的存档字段映射。
 *
 * @remarks
 * 交叉 `Record<string, unknown>` 以满足 `SaveAPI<M>` 的泛型约束
 *（`M extends Record<string, unknown>`）。
 *
 * @example
 * ```ts
 * import type { SaveAPI } from "@avg-studio/sdk";
 * import type { SceneInteractionSaveMap } from "./save-types";
 *
 * function readInventory(save: SaveAPI<SceneInteractionSaveMap>): string {
 *   return save.get("inventoryJson");
 * }
 * ```
 */
export type SceneInteractionSaveMap = {
  /** 库存 JSON 字符串（slot）；默认 `{"entries":[]}` */
  inventoryJson: string;

  /** 场景进度 JSON 字符串（slot）；默认 `{"consumed":{}}` */
  progressJson: string;

  /** 是否处于编辑模式（slot）；默认 `true` */
  isEditMode: boolean;

  /** 当前打开的场景 ID（slot）；默认 `""` */
  currentSceneId: string;

  /**
   * 本次交互的主场景 ID（slot）；默认 `""`。
   * 由「打开场景 / 打开场景交互」写入填写的目标场景；留空打开时优先于此，而非编辑器全局主场景。
   */
  mainSceneId: string;

  /** 场景返回栈 JSON 字符串（slot）；默认 `"[]"` */
  sceneReturnStackJson: string;
} & Record<string, unknown>;

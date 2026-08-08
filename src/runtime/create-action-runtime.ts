/**
 * create-action-runtime.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 将领域 ActionRuntime 接到存档 / 库存 / toast 队列等状态层。
 */

import type { ActionRuntime } from "../domain/actions";
import { giveItemToInventory } from "../domain/inventory";
import type { ItemToastOverrides } from "../domain/item-toast-config";
import { findItem } from "../domain/item-registry";
import { findScene } from "../domain/scene-registry";
import type {
  ElementMotion,
  InventoryState,
  ItemDefinition,
  SceneDefinition,
} from "../domain/types";
import { logError } from "../shared/logger";

/**
 * 创建 ActionRuntime 所需的依赖注入。
 *
 * 库存读写建议用 getter + setter（或 ref），避免闭包拿到过期 inventory。
 */
export interface CreateActionRuntimeDeps {
  /**
   * 当前场景库列表（用于 openScene 按 id/name 查找）。
   * 可为 getter，以便每次调用读最新库。
   */
  getScenes: () => SceneDefinition[];

  /**
   * 当前物品库列表（用于 giveItem 按 id 查找）。
   */
  getItems: () => ItemDefinition[];

  /**
   * 读取当前库存快照。
   */
  getInventory: () => InventoryState;

  /**
   * 写回库存（应触发 save 持久化）。
   *
   * @param next - 新库存
   */
  setInventory: (next: InventoryState) => void;

  /**
   * 写入当前场景 id（save.currentSceneId）。
   *
   * @param sceneId - 场景定义 id
   */
  setCurrentSceneId: (sceneId: string) => void;

  /**
   * 将 toast 请求入队到 UI 队列状态。
   *
   * @param payload - 与 ActionRuntime.enqueueToast 同形（含动作级可选覆盖）
   */
  enqueueToast: (payload: {
    text: string;
    anchorHotspotId: string;
    motion: ElementMotion;
  } & ItemToastOverrides) => void;

  /**
   * 非致命警告；缺省写 console.warn + logError。
   *
   * @param message - 警告文案
   */
  warn?: (message: string) => void;
}

/**
 * 组装可注入 `executeSceneActions` 的 ActionRuntime。
 *
 * - `openScene`：`findScene` 成功则写 `currentSceneId`，否则返回 false
 * - `giveItem`：`findItem` + `giveItemToInventory`；找不到物品返回 false
 * - `enqueueToast`：转发给依赖的队列入队
 * - `warn`：默认 `console.warn` + `logError`
 *
 * @param deps - 状态层依赖
 * @returns ActionRuntime 实例
 *
 * @example
 * ```ts
 * const runtime = createActionRuntime({
 *   getScenes: () => library.scenes,
 *   getItems: () => itemsLibrary.items,
 *   getInventory: () => inventoryRef.current,
 *   setInventory,
 *   setCurrentSceneId,
 *   enqueueToast: (p) => setToastQueue((q) => enqueueToast(q, p)),
 * });
 * await executeSceneActions(hs.actions, hs.id, runtime);
 * ```
 */
export function createActionRuntime(
  deps: CreateActionRuntimeDeps,
): ActionRuntime {
  /**
   * 默认警告实现。
   *
   * @param message - 警告文案
   */
  const warnImpl =
    deps.warn ??
    ((message: string): void => {
      console.warn("[scene-interaction]", "action-runtime", message);
      logError("action-runtime", message);
    });

  /** 最近一次 giveItem 成功的物品名，供空 toastText 回退 */
  let lastGivenItemName = "";

  return {
    /**
     * @param sceneIdOrName - 场景 id 或 name
     * @returns 是否成功打开
     */
    openScene(sceneIdOrName: string): boolean {
      const scene = findScene(deps.getScenes(), sceneIdOrName);

      if (scene === undefined) {
        return false;
      }

      deps.setCurrentSceneId(scene.id);

      return true;
    },

    /**
     * @param itemId - 物品 id
     * @param amount - 发放数量
     * @returns 是否发放成功
     */
    giveItem(itemId: string, amount: number): boolean {
      const item = findItem(deps.getItems(), itemId);

      if (item === undefined) {
        warnImpl(`giveItem: item not found: ${itemId}`);

        return false;
      }

      const next = giveItemToInventory(
        deps.getInventory(),
        item,
        amount,
        Date.now(),
      );

      deps.setInventory(next);
      lastGivenItemName = item.name;

      return true;
    },

    /**
     * @param payload - toast 载荷；text 为空时回退最近 giveItem 的物品名；
     *                  覆盖字段原样转发给壳层
     */
    enqueueToast(payload: {
      text: string;
      anchorHotspotId: string;
      motion: ElementMotion;
    } & ItemToastOverrides): void {
      const text =
        payload.text.trim() !== ""
          ? payload.text
          : lastGivenItemName || "获得物品";

      deps.enqueueToast({
        ...payload,
        text,
      });
    },

    /**
     * @param message - 警告文案
     */
    warn(message: string): void {
      warnImpl(message);
    },
  };
}

/**
 * create-action-runtime.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 将领域 ActionRuntime 接到存档 / 库存 / toast / 剧本 flow 等状态层。
 */

import type { ActionRuntime } from "../domain/actions";
import {
  consumeItemFromInventory,
  getQuickbarEntries,
  giveItemToInventory,
} from "../domain/inventory";
import type { ItemToastOverrides } from "../domain/item-toast-config";
import { findItem } from "../domain/item-registry";
import { openSceneWithReturn } from "../domain/scene-return-stack";
import type {
  ElementMotion,
  InventoryState,
  ItemDefinition,
  SceneDefinition,
} from "../domain/types";
import { logDebug, logError } from "../shared/logger";
import { resolveAssetUrl } from "../shared/resolve-asset-url";

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
   * 读取当前场景 id（save.currentSceneId）。
   *
   * 建议用 ref / getter，确保每次调用读到最新值，避免闭包过期。
   */
  getCurrentSceneId: () => string;

  /**
   * 读取当前场景返回栈（解析自 save.sceneReturnStackJson）。
   *
   * 建议用 ref / getter，确保每次调用读到最新值，避免闭包过期。
   */
  getReturnStack: () => string[];

  /**
   * 写回返回栈（应序列化为 sceneReturnStackJson 并触发 save 持久化）。
   *
   * @param stack - 新返回栈
   */
  setReturnStack: (stack: string[]) => void;

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
   * 将奖励飞入请求入队（已解析 icon / 槽位）。
   *
   * @param payload - 飞入载荷
   */
  enqueueRewardFly: (payload: {
    itemId: string;
    iconUrl: string;
    displayName: string;
    slotIndex: number;
  }) => void;

  /**
   * 解析资源 URI → 可加载 URL（奖励图标用）。
   *
   * @param uri - 领域 URI
   * @returns URL 字符串
   */
  resolveUrl?: (uri: string) => string;

  /**
   * 调用剧本片段（可跳回）；通常转发给 `ctx.flow.callFragment`。
   *
   * @param fragmentId - 片段 id
   * @param chapterId - 可选章节 id
   */
  callFragment: (
    fragmentId: string,
    chapterId?: string,
  ) => Promise<void>;

  /**
   * 跳转剧本片段（不可跳回）；通常转发给 `ctx.flow.unsafe_goToFragment`。
   *
   * @param fragmentId - 片段 id
   * @param chapterId - 可选章节 id
   */
  goToFragment: (fragmentId: string, chapterId?: string) => void;

  /**
   * 继续剧情：关闭场景交互叠层并解除 `openSceneInteraction` 阻塞。
   * 玩家壳通常转发给 `onRequestClose`。
   */
  continueStory: () => void | Promise<void>;

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
 * - `openScene`：经 `openSceneWithReturn` 计算下一场景与返回栈，成功则
 *   写回 `sceneReturnStackJson` 与 `currentSceneId`，否则返回 false 且不改存档
 * - `giveItem`：`findItem` + `giveItemToInventory`；找不到物品返回 false
 * - `removeItem`：`consumeItemFromInventory`；不足返回 false
 * - `enqueueToast`：转发给依赖的队列入队
 * - `callFragment` / `goToFragment` / `continueStory`：转发给注入回调
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
 *   getCurrentSceneId: () => currentSceneIdRef.current,
 *   getReturnStack: () => parseSceneReturnStackJson(returnStackJsonRef.current),
 *   setReturnStack: (stack) =>
 *     setReturnStackJson(stringifySceneReturnStack(stack)),
 *   enqueueToast: (p) => setToastQueue((q) => enqueueToast(q, p)),
 *   callFragment: (id, chapterId) =>
 *     ctx.flow.callFragment(id, chapterId ? { chapterId } : undefined),
 *   goToFragment: (id, chapterId) =>
 *     ctx.flow.unsafe_goToFragment(id, chapterId ? { chapterId } : undefined),
 *   continueStory: () => onRequestClose(),
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
  /** 最近一次 giveItem 成功的图标 URL（与快捷栏同源解析） */
  let lastGivenItemIconUrl = "";
  /** 最近一次 giveItem 成功的物品 id */
  let lastGivenItemId = "";

  /**
   * 解析物品图标 URL。
   *
   * @param iconRaw - 物品 icon 字段
   * @returns 可加载 URL
   */
  const resolveIconUrl = (iconRaw: string): string => {
    const trimmed = iconRaw.trim();

    if (trimmed.length === 0) {
      return "";
    }

    if (deps.resolveUrl) {
      return deps.resolveUrl(trimmed);
    }

    return resolveAssetUrl(trimmed, undefined);
  };

  return {
    /**
     * 打开目标场景，并按 options 压入返回栈。
     *
     * - 经 {@link openSceneWithReturn} 统一计算下一场景与下一栈；
     * - 成功后写回返回栈与 currentSceneId；失败返回 false 且不改存档
     *
     * @param sceneIdOrName - 场景 id 或 name
     * @param options.returnTarget - 可选；覆盖压栈的返回目标
     * @param options.pushReturn - 缺省 true；false 时只切场景
     * @returns 是否成功打开
     */
    openScene(
      sceneIdOrName: string,
      options?: { returnTarget?: string; pushReturn?: boolean },
    ): boolean {
      const result = openSceneWithReturn({
        scenes: deps.getScenes(),
        currentSceneId: deps.getCurrentSceneId(),
        stack: deps.getReturnStack(),
        targetKey: sceneIdOrName,
        returnTarget: options?.returnTarget,
        pushReturn: options?.pushReturn,
      });

      if (!result.ok || result.nextSceneId === null) {
        return false;
      }

      deps.setReturnStack(result.nextStack);
      deps.setCurrentSceneId(result.nextSceneId);

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
      lastGivenItemId = item.id;
      lastGivenItemIconUrl = resolveIconUrl(item.icon ?? "");

      return true;
    },

    /**
     * @param itemId - 物品 id
     * @param amount - 扣除数量
     * @returns 成功或失败（含展示名）
     */
    removeItem(
      itemId: string,
      amount: number,
    ):
      | { ok: true }
      | { ok: false; displayName: string; reason: string } {
      const key = itemId.trim();
      const known = key.length > 0 ? findItem(deps.getItems(), key) : undefined;
      const displayName =
        known?.name?.trim() || key || "物品";

      if (key.length === 0) {
        warnImpl("removeItem: itemId 为空");

        return { ok: false, displayName, reason: "invalid-id" };
      }

      const result = consumeItemFromInventory(
        deps.getInventory(),
        key,
        amount,
      );

      if (!result.ok) {
        warnImpl(
          `removeItem: ${result.reason} (${key} x${amount})`,
        );

        return { ok: false, displayName, reason: result.reason };
      }

      deps.setInventory(result.state);

      return { ok: true };
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

      const { screenCenter, ...rest } = payload;

      deps.enqueueToast({
        ...rest,
        text,
        ...(screenCenter === true ? { screenCenter: true } : {}),
      });
    },

    /**
     * 中心发光奖励飞入：解析图标与快捷栏槽位后入队。
     *
     * @param payload.itemId - 物品 id
     * @param payload.amount - 数量（保留备用）
     */
    enqueueRewardFly(payload: { itemId: string; amount: number }): void {
      const key = payload.itemId.trim() || lastGivenItemId;
      const item = key.length > 0 ? findItem(deps.getItems(), key) : undefined;
      const displayName =
        item?.name?.trim() || lastGivenItemName || key || "物品";
      /**
       * 优先用 giveItem 刚解析的图标，保证与写入库存的物品一致，
       * 避免二次查找 / 解析差异导致「文案对、图标不对」。
       */
      const iconUrl =
        (key === lastGivenItemId || key === payload.itemId.trim()) &&
        lastGivenItemIconUrl.length > 0
          ? lastGivenItemIconUrl
          : resolveIconUrl(item?.icon ?? "");

      const entries = getQuickbarEntries(deps.getInventory());
      let slotIndex = entries.findIndex((entry) => entry.itemId === key);

      if (slotIndex < 0) {
        slotIndex = 0;
      }

      deps.enqueueRewardFly({
        itemId: key,
        iconUrl,
        displayName,
        slotIndex,
      });
    },

    /**
     * @param fragmentId - 片段 id
     * @param chapterId - 可选章节
     */
    async callFragment(
      fragmentId: string,
      chapterId?: string,
    ): Promise<void> {
      logDebug("jump-fragment", "ActionRuntime.callFragment → deps", {
        fragmentId,
        chapterId: chapterId ?? "(未指定)",
        t: Date.now(),
      });
      await deps.callFragment(fragmentId, chapterId);
      logDebug("jump-fragment", "ActionRuntime.callFragment ← deps 返回", {
        fragmentId,
        t: Date.now(),
      });
    },

    /**
     * @param fragmentId - 片段 id
     * @param chapterId - 可选章节
     */
    goToFragment(fragmentId: string, chapterId?: string): void {
      logDebug("jump-fragment", "ActionRuntime.goToFragment → deps", {
        fragmentId,
        chapterId: chapterId ?? "(未指定)",
        t: Date.now(),
      });
      deps.goToFragment(fragmentId, chapterId);
    },

    /**
     * 关闭场景交互并解除阻塞，使剧本继续。
     */
    async continueStory(): Promise<void> {
      logDebug("continue-story", "ActionRuntime.continueStory → deps", {
        t: Date.now(),
      });
      await deps.continueStory();
      logDebug("continue-story", "ActionRuntime.continueStory ← deps 返回", {
        t: Date.now(),
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

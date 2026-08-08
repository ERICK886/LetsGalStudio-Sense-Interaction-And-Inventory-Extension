/**
 * actions.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 场景动作链执行器：按序调用 ActionRuntime，单步失败 warn 后继续。
 * 支持 openScene（含返回栈）/ giveItem。
 */
import type { ItemToastOverrides } from "./item-toast-config";
import type { ElementMotion, SceneAction } from "./types";

/**
 * 动作执行运行时依赖（由 UI/状态层注入具体实现）。
 */
export interface ActionRuntime {
  /**
   * 打开目标场景，并可选压入返回栈。
   *
   * @param sceneIdOrName - 场景 id 或 name
   * @param options.returnTarget - 可选；覆盖压栈的返回目标（场景 id/name），
   *   缺省时压入打开前的 `currentSceneId`
   * @param options.pushReturn - 缺省 true；false 时只切场景、不改返回栈
   * @returns 是否成功打开
   */
  openScene(
    sceneIdOrName: string,
    options?: { returnTarget?: string; pushReturn?: boolean },
  ): boolean;

  /**
   * 向玩家库存发放物品。
   *
   * @param itemId - 物品 id
   * @param amount - 发放数量
   * @returns 是否发放成功
   */
  giveItem(itemId: string, amount: number): boolean;

  /**
   * 入队一条获得物品轻提示。
   *
   * @param payload - 文案 / 锚点 / 动效 + 可选外观覆盖
   */
  enqueueToast(payload: {
    text: string;
    anchorHotspotId: string;
    motion: ElementMotion;
  } & ItemToastOverrides): void;

  /**
   * 记录非致命警告（日志/控制台等）。
   *
   * @param message - 警告信息
   */
  warn(message: string): void;
}

/**
 * 执行单条 openScene 动作。
 *
 * @param action - openScene 动作
 * @param runtime - 运行时依赖
 */
function runOpenSceneAction(
  action: Extract<SceneAction, { type: "openScene" }>,
  runtime: ActionRuntime,
): void {
  const ok = runtime.openScene(action.sceneIdOrName, {
    returnTarget: action.returnTarget,
    pushReturn: action.pushReturn,
  });
  if (!ok) {
    runtime.warn(`openScene failed: ${action.sceneIdOrName}`);
  }
}

/**
 * 执行单条 giveItem 动作；仅发放成功时 enqueueToast。
 *
 * @param action - giveItem 动作
 * @param hotspotId - 当前热点 id（toast 锚点）
 * @param runtime - 运行时依赖
 */
function runGiveItemAction(
  action: Extract<SceneAction, { type: "giveItem" }>,
  hotspotId: string,
  runtime: ActionRuntime,
): void {
  const ok = runtime.giveItem(action.itemId, action.amount);
  if (!ok) {
    return;
  }

  const text =
    action.toastText.trim() === "" ? "" : action.toastText;

  runtime.enqueueToast({
    text,
    anchorHotspotId: hotspotId,
    motion: action.toastMotion,
    placement: action.toastPlacement,
    offsetX: action.toastOffsetX,
    offsetY: action.toastOffsetY,
    gap: action.toastGap,
    style: action.toastStyle,
  });
}

/**
 * 执行单条场景动作；异常时 warn 且不向外抛出。
 *
 * @param action - 待执行动作
 * @param hotspotId - 触发热点 id
 * @param runtime - 运行时依赖
 */
async function runSceneAction(
  action: SceneAction,
  hotspotId: string,
  runtime: ActionRuntime,
): Promise<void> {
  try {
    switch (action.type) {
      case "none":
        return;

      case "openScene":
        runOpenSceneAction(action, runtime);
        return;

      case "giveItem":
        runGiveItemAction(action, hotspotId, runtime);
        return;

      default: {
        const _exhaustive: never = action;
        runtime.warn(`unknown action type: ${String(_exhaustive)}`);
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    runtime.warn(`action step failed: ${message}`);
  }
}

/**
 * 按数组顺序执行场景动作链；任一步失败仅 warn，不中断后续步骤。
 *
 * @param actions - 动作列表
 * @param hotspotId - 触发热点 id（giveItem toast 锚点）
 * @param runtime - 注入实现
 * @returns Promise<void>
 *
 * @example
 * await executeSceneActions(hotspot.actions, hotspot.id, actionRuntime);
 */
export async function executeSceneActions(
  actions: SceneAction[],
  hotspotId: string,
  runtime: ActionRuntime,
): Promise<void> {
  for (const action of actions) {
    await runSceneAction(action, hotspotId, runtime);
  }
}

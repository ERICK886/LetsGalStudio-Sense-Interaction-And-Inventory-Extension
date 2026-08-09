/**
 * actions.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.1
 *
 * 场景动作链执行器：按序调用 ActionRuntime，单步失败 warn 后继续；
 * 例外：removeItem 失败则中心提示并中断后续动作。
 * 支持 openScene / giveItem / removeItem / 跳转片段 / continueStory。
 */
import { logDebug, logInfo, logWarn } from "../shared/logger";
import type { ItemToastOverrides } from "./item-toast-config";
import { defaultMotionSide } from "./motion";
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
   * 从玩家库存扣除物品。
   *
   * @param itemId - 物品 id
   * @param amount - 扣除数量
   * @returns 成功或失败（含展示名，供不足提示）
   */
  removeItem(
    itemId: string,
    amount: number,
  ):
    | { ok: true }
    | { ok: false; displayName: string; reason: string };

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
   * 入队中心发光 → 飞向快捷栏槽位的奖励轻提示。
   *
   * @param payload.itemId - 物品 id
   * @param payload.amount - 数量（目前仅展示用）
   */
  enqueueRewardFly(payload: { itemId: string; amount: number }): void;

  /**
   * 调用剧本片段，结束后回到调用点（可跳回）。
   *
   * @param fragmentId - 目标片段 id
   * @param chapterId - 可选所属章节
   */
  callFragment(fragmentId: string, chapterId?: string): Promise<void>;

  /**
   * 切断当前流程并跳到目标片段（不可跳回）。
   *
   * @param fragmentId - 目标片段 id
   * @param chapterId - 可选所属章节
   */
  goToFragment(fragmentId: string, chapterId?: string): void;

  /**
   * 继续剧情：关闭场景交互并解除阻塞会话。
   */
  continueStory(): void | Promise<void>;

  /**
   * 记录非致命警告（日志/控制台等）。
   *
   * @param message - 警告信息
   */
  warn(message: string): void;
}

/** 单步执行结果：abort 时中断动作链 */
type SceneActionStepResult = "ok" | "abort";

/**
 * 扣除失败提示用的默认动效（与获得提示常用进出场一致）。
 *
 * @returns ElementMotion
 */
function defaultInsufficientToastMotion(): ElementMotion {
  return {
    enter: { ...defaultMotionSide(), preset: "slideUp" },
    exit: { ...defaultMotionSide(), preset: "slideDown" },
  };
}

/**
 * 规范化非空片段 / 章节 id。
 *
 * @param raw - 原始字符串
 * @returns trim 后的 id；空则 null
 */
function normalizeActionId(raw: string | undefined): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }

  const key = String(raw).trim();

  if (key.length === 0 || key === "undefined" || key === "null") {
    return null;
  }

  return key;
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

  runtime.enqueueRewardFly({
    itemId: action.itemId,
    amount: action.amount,
  });

  runtime.enqueueToast({
    text,
    anchorHotspotId: hotspotId,
    motion: action.toastMotion,
    /** 获得文案与奖励飞入一致：固定画面中心，不跟交互点 */
    placement: action.toastPlacement ?? "center",
    offsetX: action.toastOffsetX,
    offsetY: action.toastOffsetY,
    gap: action.toastGap,
    style: action.toastStyle,
    screenCenter: true,
  });
}

/**
 * 执行单条 removeItem；失败时中心提示并 abort。
 *
 * @param action - removeItem 动作
 * @param hotspotId - 触发热点（toast 仍可带 id；定位用 screenCenter）
 * @param runtime - 运行时依赖
 * @returns ok / abort
 */
function runRemoveItemAction(
  action: Extract<SceneAction, { type: "removeItem" }>,
  hotspotId: string,
  runtime: ActionRuntime,
): SceneActionStepResult {
  const result = runtime.removeItem(action.itemId, action.amount);

  if (result.ok) {
    return "ok";
  }

  runtime.warn(
    `removeItem failed: ${action.itemId} x${action.amount} (${result.reason})`,
  );

  const name =
    result.displayName.trim().length > 0
      ? result.displayName.trim()
      : action.itemId.trim() || "物品";

  runtime.enqueueToast({
    text: `${name}不足`,
    anchorHotspotId: hotspotId,
    motion: defaultInsufficientToastMotion(),
    placement: "center",
    offsetX: 0,
    offsetY: 0,
    gap: 0,
    screenCenter: true,
  });

  return "abort";
}

/**
 * 执行跳转片段（可跳回）。
 *
 * @param action - jumpFragmentReturn
 * @param runtime - 运行时
 */
async function runJumpFragmentReturnAction(
  action: Extract<SceneAction, { type: "jumpFragmentReturn" }>,
  runtime: ActionRuntime,
): Promise<void> {
  const fragmentId = normalizeActionId(action.fragmentId);

  logDebug("jump-fragment", "动作入口：jumpFragmentReturn", {
    rawFragmentId: action.fragmentId,
    rawChapterId: action.chapterId,
    fragmentId,
  });

  if (fragmentId === null) {
    logWarn("jump-fragment", "跳转片段（可跳回）失败：未选择目标片段", {
      type: "jumpFragmentReturn",
      rawFragmentId: action.fragmentId,
      rawChapterId: action.chapterId,
    });
    runtime.warn("jumpFragmentReturn: 未选择目标片段");

    return;
  }

  const chapterId = normalizeActionId(action.chapterId) ?? undefined;

  logInfo("jump-fragment", "跳转片段（可跳回）：调用 flow.callFragment", {
    type: "jumpFragmentReturn",
    fragmentId,
    chapterId: chapterId ?? "(未指定)",
  });
  logDebug("jump-fragment", "await runtime.callFragment 开始", {
    type: "jumpFragmentReturn",
    fragmentId,
    chapterId: chapterId ?? "(未指定)",
    t: Date.now(),
  });

  try {
    await runtime.callFragment(fragmentId, chapterId);
    logInfo("jump-fragment", "跳转片段（可跳回）：callFragment 已返回", {
      type: "jumpFragmentReturn",
      fragmentId,
      chapterId: chapterId ?? "(未指定)",
    });
    logDebug("jump-fragment", "await runtime.callFragment 结束", {
      type: "jumpFragmentReturn",
      fragmentId,
      chapterId: chapterId ?? "(未指定)",
      t: Date.now(),
    });
  } catch (err) {
    logWarn("jump-fragment", "跳转片段（可跳回）：callFragment 抛错", {
      type: "jumpFragmentReturn",
      fragmentId,
      chapterId: chapterId ?? "(未指定)",
      err,
    });
    throw err;
  }
}

/**
 * 执行跳转片段（不可跳回）。
 *
 * @param action - jumpFragmentGoto
 * @param runtime - 运行时
 */
function runJumpFragmentGotoAction(
  action: Extract<SceneAction, { type: "jumpFragmentGoto" }>,
  runtime: ActionRuntime,
): void {
  const fragmentId = normalizeActionId(action.fragmentId);

  logDebug("jump-fragment", "动作入口：jumpFragmentGoto", {
    rawFragmentId: action.fragmentId,
    rawChapterId: action.chapterId,
    fragmentId,
  });

  if (fragmentId === null) {
    logWarn("jump-fragment", "跳转片段（不可跳回）失败：未选择目标片段", {
      type: "jumpFragmentGoto",
      rawFragmentId: action.fragmentId,
      rawChapterId: action.chapterId,
    });
    runtime.warn("jumpFragmentGoto: 未选择目标片段");

    return;
  }

  const chapterId = normalizeActionId(action.chapterId) ?? undefined;

  logInfo("jump-fragment", "跳转片段（不可跳回）：调用 flow.unsafe_goToFragment", {
    type: "jumpFragmentGoto",
    fragmentId,
    chapterId: chapterId ?? "(未指定)",
  });
  logDebug("jump-fragment", "runtime.goToFragment 调用前", {
    type: "jumpFragmentGoto",
    fragmentId,
    chapterId: chapterId ?? "(未指定)",
    t: Date.now(),
  });

  runtime.goToFragment(fragmentId, chapterId);

  logInfo("jump-fragment", "跳转片段（不可跳回）：goToFragment 已调用", {
    type: "jumpFragmentGoto",
    fragmentId,
    chapterId: chapterId ?? "(未指定)",
  });
  logDebug("jump-fragment", "runtime.goToFragment 已同步返回（异步 hide 可能仍在进行）", {
    type: "jumpFragmentGoto",
    fragmentId,
    chapterId: chapterId ?? "(未指定)",
    t: Date.now(),
  });
}

/**
 * 执行继续剧情。
 *
 * @param runtime - 运行时
 */
async function runContinueStoryAction(
  runtime: ActionRuntime,
): Promise<void> {
  logDebug("continue-story", "动作入口：continueStory", { t: Date.now() });
  logInfo("continue-story", "继续剧情：关闭场景交互并解除阻塞");

  try {
    await runtime.continueStory();
    logInfo("continue-story", "继续剧情：已调用 continueStory");
    logDebug("continue-story", "await runtime.continueStory 结束", {
      t: Date.now(),
    });
  } catch (err) {
    logWarn("continue-story", "继续剧情：continueStory 抛错", { err });
    throw err;
  }
}

/**
 * 执行单条场景动作；异常时 warn 且不向外抛出。
 *
 * @param action - 待执行动作
 * @param hotspotId - 触发热点 id
 * @param runtime - 运行时依赖
 * @returns ok 继续；abort 中断链
 */
async function runSceneAction(
  action: SceneAction,
  hotspotId: string,
  runtime: ActionRuntime,
): Promise<SceneActionStepResult> {
  try {
    switch (action.type) {
      case "none":
        return "ok";

      case "openScene":
        runOpenSceneAction(action, runtime);
        return "ok";

      case "giveItem":
        runGiveItemAction(action, hotspotId, runtime);
        return "ok";

      case "removeItem":
        return runRemoveItemAction(action, hotspotId, runtime);

      case "jumpFragmentReturn":
        await runJumpFragmentReturnAction(action, runtime);
        return "ok";

      case "jumpFragmentGoto":
        runJumpFragmentGotoAction(action, runtime);
        return "ok";

      case "continueStory":
        await runContinueStoryAction(runtime);
        return "ok";

      default: {
        const _exhaustive: never = action;
        runtime.warn(`unknown action type: ${String(_exhaustive)}`);
        return "ok";
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    runtime.warn(`action step failed: ${message}`);
    return "ok";
  }
}

/** executeSceneActions 的返回值 */
export interface ExecuteSceneActionsResult {
  /** 是否因 removeItem 等硬失败而中断 */
  aborted: boolean;
}

/**
 * 按数组顺序执行场景动作链。
 *
 * 一般步骤失败仅 warn 并继续；`removeItem` 失败会中心提示并中断后续步骤。
 *
 * @param actions - 动作列表
 * @param hotspotId - 触发热点 id（giveItem toast 锚点）
 * @param runtime - 注入实现
 * @returns 是否中断
 *
 * @example
 * await executeSceneActions(hotspot.actions, hotspot.id, actionRuntime);
 */
export async function executeSceneActions(
  actions: SceneAction[],
  hotspotId: string,
  runtime: ActionRuntime,
): Promise<ExecuteSceneActionsResult> {
  logDebug("actions", "动作链开始", {
    hotspotId,
    count: actions.length,
    types: actions.map((a) => a.type),
  });

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index]!;

    logDebug("actions", "动作链步骤", {
      hotspotId,
      index,
      type: action.type,
      t: Date.now(),
    });

    const step = await runSceneAction(action, hotspotId, runtime);

    logDebug("actions", "动作链步骤结果", {
      hotspotId,
      index,
      type: action.type,
      step,
      t: Date.now(),
    });

    if (step === "abort") {
      logDebug("actions", "动作链中断", { hotspotId, index, type: action.type });

      return { aborted: true };
    }
  }

  logDebug("actions", "动作链结束", { hotspotId, aborted: false });

  return { aborted: false };
}

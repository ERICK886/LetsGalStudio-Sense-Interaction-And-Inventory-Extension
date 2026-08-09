/**
 * suspend-overlay-for-fragment.ts
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.3
 *
 * 跳转剧本片段时暂时卸下场景交互 / 背包 HUD 叠层。
 *
 * 原因：`ctx.ui.show` 的扩展容器层级在引擎对话框之上，仅把 DOM 设透明
 * 仍会挡住对话框；必须 `ui.hide` 才能把对话交还给引擎。
 *
 * 注意：
 * - hide 会卸载当前 React 树，await 写在本模块以便卸载后仍能跑完恢复。
 * - 须先启动 `callFragment` 再 hide：宿主嵌套调用依赖仍挂着的阻塞 method 上下文；
 *   先 hide 再 call 时可能数十毫秒空返回、对话不播。
 * - hide 的 React cleanup 可能在 endOverlayYield / 重新 show 之后才跑；
 *   用 session epoch 忽略过期 cleanup，避免抹掉 modal 会话。
 * - method 与 render 的 ctx scope 前缀可能不同，`isVisible` 不可靠；
 *   玩家叠层会话用 {@link setPlayerOverlaySession} 强制卸/恢复，并尝试多路径。
 */

import type { ExtensionContext } from "@avg-studio/sdk";
import {
  backpackHudUiPathCandidates,
  backpackUiPathCandidates,
  SCENE_INTERACTION_MODULE_ID,
  sceneInteractionUiPathCandidates,
} from "../shared/module-ids";
import { logDebug, logInfo, logWarn } from "../shared/logger";
import { getTightBackpackHudShowOptions } from "../store/hud-ui-show";
import { SCENE_PASSTHROUGH_SHOW_OPTIONS } from "../store/passthrough-show-options";
import { isPlayerSessionPending } from "./player-session";
import {
  closeVisualInventoryHud,
  isVisualInventoryHudSessionOpen,
  openInventoryHudPreferVisual,
  setVisualInventoryHudSession,
} from "./visual-inventory-hud";

/** 场景交互全屏容器：穿透空白，控件自行接收点击 */
const SCENE_UI_SHOW_OPTS = { ...SCENE_PASSTHROUGH_SHOW_OPTIONS };

/**
 * 恢复场景交互 UI 时使用的 props（由 App 在挂载时写入）。
 */
let sceneInteractionRestoreProps: Record<string, unknown> = {
  playerPresentation: true,
};

/**
 * 玩家侧已打开场景叠层（openScene / openSceneInteraction / 程序预览壳）时为 true。
 * 不依赖 `isVisible`（路径前缀不一致时会假阴性）。
 */
let playerOverlaySession = false;

/**
 * 是否曾用 `ui.show` 打开过快捷栏 HUD（玩家运行时）。
 * 程序预览内嵌 HudShell 时为 false，避免片段恢复时误 ui.show HUD。
 */
let hudUiSession = false;

/**
 * 跳转片段期间 ui.hide 会卸载 React 树并触发 cleanup；
 * yield 深度 > 0 时忽略「清会话」，否则会把 restore 意图抹掉。
 */
let overlayYieldDepth = 0;

/**
 * 每次 `setPlayerOverlaySession(true)` 递增。
 * cleanup 只在 epoch 仍匹配时清会话，避免 hide→show 后滞后 cleanup 抹掉新会话。
 */
let playerOverlaySessionEpoch = 0;

/**
 * 最近一次成功 hide/show 命中的场景 UI 路径（恢复时优先用同一路径）。
 */
let lastSceneUiPath: string | null = null;

/**
 * 最近一次成功 hide 的背包路径。
 */
let lastBagUiPath: string | null = null;

/**
 * 登记「片段结束后如何重新 show 场景交互」。
 *
 * 禁止用空对象覆盖已登记的 playerPresentation / modal：
 * React 预览挂载 effect 曾在 openSceneInteraction 之后立刻 `set({})`，
 * 导致跳转片段恢复时丢掉 blocking 会话形态。
 *
 * 亦禁止在阻塞会话期间把 modal 降级为仅 `playerPresentation`
 * （滞后 remount / 错误 props 会触发，随后 callFragment 空返回）。
 *
 * @param props - 传给 `ctx.ui.show` 的 props
 */
export function setSceneInteractionRestoreProps(
  props: Record<string, unknown>,
): void {
  const incomingEmpty = Object.keys(props).length === 0;
  const hadModal = sceneInteractionRestoreProps.playerSession === "modal";
  const hadPlayerIntent =
    hadModal || sceneInteractionRestoreProps.playerPresentation === true;

  if (incomingEmpty && hadPlayerIntent) {
    logDebug(
      "jump-fragment",
      "setSceneInteractionRestoreProps：忽略空 props 覆盖（保留已登记的玩家会话）",
      { kept: sceneInteractionRestoreProps },
    );

    return;
  }

  if (
    hadModal &&
    props.playerSession !== "modal" &&
    (playerOverlaySession || isPlayerSessionPending())
  ) {
    const kept = {
      ...props,
      playerPresentation: true,
      playerSession: "modal" as const,
    };
    sceneInteractionRestoreProps = kept;
    logDebug(
      "jump-fragment",
      "setSceneInteractionRestoreProps：保留 modal（忽略降级）",
      { incoming: props, kept },
    );

    return;
  }

  sceneInteractionRestoreProps = { ...props };
  logDebug("jump-fragment", "setSceneInteractionRestoreProps", {
    props: sceneInteractionRestoreProps,
  });
}

/**
 * 记下场景交互 UI 路径，供片段结束后优先按同一路径 show。
 *
 * @param path - ui.show / hide 使用的路径
 */
export function rememberSceneUiPath(path: string): void {
  const trimmed = path.trim();

  if (trimmed.length === 0) {
    return;
  }

  lastSceneUiPath = trimmed;
  logDebug("jump-fragment", "rememberSceneUiPath", { path: trimmed });
}

/**
 * 标记是否通过 `ui.show` 打开了快捷栏 HUD。
 *
 * @param active - 玩家运行时 show HUD 后为 true；关闭时 false
 */
export function setHudUiSession(active: boolean): void {
  if (!active && overlayYieldDepth > 0) {
    logDebug(
      "jump-fragment",
      "setHudUiSession(false) 已忽略（片段 yield 中，避免 hide 卸载清 HUD 意图）",
      { overlayYieldDepth, prev: hudUiSession },
    );

    return;
  }

  logDebug("jump-fragment", "setHudUiSession", {
    active,
    prev: hudUiSession,
  });
  hudUiSession = active;
}

/**
 * @returns 是否存在经 ui.show 打开的快捷栏会话
 */
export function isHudUiSessionActive(): boolean {
  return hudUiSession;
}

/**
 * 进入片段卸叠层临界区（允许 hide 卸载 React 而不清会话）。
 */
function beginOverlayYield(): void {
  overlayYieldDepth += 1;
  logDebug("jump-fragment", "beginOverlayYield", {
    overlayYieldDepth,
  });
}

/**
 * 离开片段卸叠层临界区。
 */
function endOverlayYield(): void {
  overlayYieldDepth = Math.max(0, overlayYieldDepth - 1);
  logDebug("jump-fragment", "endOverlayYield", {
    overlayYieldDepth,
  });
}

/**
 * 标记玩家场景叠层会话为活跃，并返回本轮 epoch（供 cleanup 比对）。
 *
 * @returns 新的 session epoch
 */
export function markPlayerOverlaySession(): number {
  playerOverlaySessionEpoch += 1;
  const epoch = playerOverlaySessionEpoch;
  logDebug("jump-fragment", "setPlayerOverlaySession", {
    active: true,
    prev: playerOverlaySession,
    overlayYieldDepth,
    epoch,
  });
  playerOverlaySession = true;

  return epoch;
}

/**
 * 仅当 cleanup 对应的 epoch 仍是当前会话时才清标记。
 * 用于 React effect cleanup，避免 hide→show 后滞后卸载清掉新会话。
 *
 * @param epoch - {@link markPlayerOverlaySession} 返回值
 */
export function clearPlayerOverlaySessionIfEpoch(epoch: number): void {
  if (overlayYieldDepth > 0) {
    logDebug(
      "jump-fragment",
      "setPlayerOverlaySession(false) 已忽略（片段 yield 中，避免 hide 卸载清会话）",
      { overlayYieldDepth, prev: playerOverlaySession, epoch },
    );

    return;
  }

  if (epoch !== playerOverlaySessionEpoch) {
    logDebug(
      "jump-fragment",
      "setPlayerOverlaySession(false) 已忽略（过期 cleanup，会话已被新 mount 接管）",
      {
        epoch,
        currentEpoch: playerOverlaySessionEpoch,
        prev: playerOverlaySession,
      },
    );

    return;
  }

  if (isPlayerSessionPending()) {
    logDebug(
      "jump-fragment",
      "setPlayerOverlaySession(false) 已忽略（阻塞门闩仍在；等 continueStory/forceClear）",
      { epoch, prev: playerOverlaySession },
    );

    return;
  }

  logDebug("jump-fragment", "setPlayerOverlaySession", {
    active: false,
    prev: playerOverlaySession,
    overlayYieldDepth,
    epoch,
  });
  playerOverlaySession = false;
  lastSceneUiPath = null;
  lastBagUiPath = null;
  hudUiSession = false;
}

/**
 * 强制清除玩家叠层会话（继续剧情 / 关闭交互 / 不可跳回跳转后）。
 */
export function forceClearPlayerOverlaySession(): void {
  playerOverlaySessionEpoch += 1;
  logDebug("jump-fragment", "setPlayerOverlaySession", {
    active: false,
    prev: playerOverlaySession,
    overlayYieldDepth,
    epoch: playerOverlaySessionEpoch,
    force: true,
  });
  playerOverlaySession = false;
  lastSceneUiPath = null;
  lastBagUiPath = null;
  hudUiSession = false;
}

/**
 * 标记 / 清除玩家场景叠层会话。
 *
 * - `true`：等同 {@link markPlayerOverlaySession}
 * - `false`：无 epoch 时仅在「无门闩且非 yield」时清除；继续剧情请用
 *   {@link forceClearPlayerOverlaySession}
 *
 * @param active - 玩家运行时挂载场景壳时为 true；卸载时 false
 *
 * @example
 * ```ts
 * setPlayerOverlaySession(true);
 * ```
 */
export function setPlayerOverlaySession(active: boolean): void {
  if (active) {
    markPlayerOverlaySession();

    return;
  }

  if (overlayYieldDepth > 0) {
    logDebug(
      "jump-fragment",
      "setPlayerOverlaySession(false) 已忽略（片段 yield 中，避免 hide 卸载清会话）",
      { overlayYieldDepth, prev: playerOverlaySession },
    );

    return;
  }

  if (isPlayerSessionPending()) {
    logDebug(
      "jump-fragment",
      "setPlayerOverlaySession(false) 已忽略（阻塞门闩仍在；等 continueStory/forceClear）",
      { prev: playerOverlaySession },
    );

    return;
  }

  forceClearPlayerOverlaySession();
}

/**
 * @returns 玩家侧场景叠层会话是否进行中
 */
export function isPlayerOverlaySessionActive(): boolean {
  return playerOverlaySession;
}

/**
 * 可选：壳层本地挂起（编辑器内嵌预览等）。
 *
 * @param suspended - true=隐藏并禁用指针
 */
export type LocalOverlaySuspend = (suspended: boolean) => void;

/**
 * 在候选路径上查找第一个 isVisible===true 的路径。
 *
 * @param ctx - 扩展上下文
 * @param candidates - 路径候选
 * @returns 命中路径；皆不可见则 null
 */
function findVisiblePath(
  ctx: ExtensionContext,
  candidates: string[],
): string | null {
  for (const id of candidates) {
    try {
      if (ctx.ui.isVisible(id) === true) {
        return id;
      }
    } catch {
      // 下一条
    }
  }

  return null;
}

/**
 * 挑选恢复用的场景 UI 路径：优先带 `/` 的绝对/复合路径，避免短 id 恢复丢 props。
 *
 * @param last - hide 记录路径
 * @param visible - isVisible 命中
 * @param candidates - 候选（[0] 一般为包级绝对路径）
 */
function pickRestoreScenePath(
  last: string | null,
  visible: string | null,
  candidates: string[],
): string {
  const ranked = [last, visible, ...candidates].filter(
    (p): p is string => typeof p === "string" && p.length > 0,
  );

  const withSlash = ranked.find((p) => p.includes("/"));

  return withSlash ?? ranked[0] ?? SCENE_INTERACTION_MODULE_ID;
}

/**
 * 对所有候选执行 hide（忽略失败）；返回**第一个**成功路径（preferred 优先）。
 *
 * @param ctx - 扩展上下文
 * @param candidates - 路径候选
 * @param preferred - 优先路径（若有）
 * @returns 用于日志 / 恢复的路径提示
 */
async function hideAllCandidates(
  ctx: ExtensionContext,
  candidates: string[],
  preferred: string | null,
): Promise<string | null> {
  const ordered = preferred
    ? [preferred, ...candidates.filter((c) => c !== preferred)]
    : candidates;

  let firstHit: string | null = null;

  for (const id of ordered) {
    try {
      await ctx.ui.hide(id);

      if (firstHit === null) {
        firstHit = id;
      }
    } catch (err) {
      logWarn("jump-fragment", "ui.hide 尝试失败", { id, err });
    }
  }

  return firstHit ?? preferred;
}

/**
 * show 指定路径。
 *
 * @param ctx - 扩展上下文
 * @param id - UI 路径
 * @param props - show props
 * @param options - 容器选项；缺省为场景全屏可交互
 */
async function safeShow(
  ctx: ExtensionContext,
  id: string,
  props: Record<string, unknown>,
  options: typeof SCENE_UI_SHOW_OPTS = SCENE_UI_SHOW_OPTS,
): Promise<void> {
  try {
    await ctx.ui.show(id, props, { ...options });
  } catch (err) {
    logWarn("jump-fragment", "ui.show 恢复失败", { id, err });
  }
}

/**
 * 可跳回：先卸扩展叠层 → `callFragment` → 再恢复。
 *
 * @param ctx - 扩展上下文
 * @param fragmentId - 目标片段
 * @param chapterId - 可选章节
 * @param onLocalSuspend - 可选；内嵌预览时同步藏起壳层 DOM
 * @returns callFragment 的 Promise
 */
export async function callFragmentYieldingOverlay(
  ctx: ExtensionContext,
  fragmentId: string,
  chapterId: string | undefined,
  onLocalSuspend?: LocalOverlaySuspend,
): Promise<void> {
  const sceneCandidates = sceneInteractionUiPathCandidates();
  const hudCandidates = backpackHudUiPathCandidates();
  const backpackCandidates = backpackUiPathCandidates();

  const visibleScene = findVisiblePath(ctx, sceneCandidates);
  const visibleHud = findVisiblePath(ctx, hudCandidates);
  const visibleBackpack = findVisiblePath(ctx, backpackCandidates);

  /**
   * 玩家叠层会话中即使 isVisible 全假也强制卸/恢复
   *（method 与 render 的 ui 路径前缀不一致时的假阴性）。
   */
  const visualHudWasOpen = isVisualInventoryHudSessionOpen();
  const restoreScene = playerOverlaySession || visibleScene !== null;
  /**
   * HUD：仅当确实经 ui.show / Visual 打开过才恢复。
   * 勿用 playerOverlaySession 连带（程序预览内嵌 HudShell，误 show 会报 inventory-hud.json 缺失）。
   */
  const restoreHud =
    hudUiSession || visibleHud !== null || visualHudWasOpen;
  /** 全屏背包只卸不恢复（片段期间不应挡对话） */
  const hideBackpack = visibleBackpack !== null;
  /** 恢复时用的 props 快照（hide 卸载不应改掉登记值） */
  const restorePropsSnapshot = { ...sceneInteractionRestoreProps };

  logInfo("jump-fragment", "片段前卸下扩展叠层", {
    fragmentId,
    chapterId: chapterId ?? "(未指定)",
    restoreScene,
    restoreHud,
    visualHudWasOpen,
    hudUiSession,
    hideBackpack,
    playerOverlaySession,
    visibleScene,
    visibleHud,
    visibleBackpack,
  });

  if (!restoreScene && !restoreHud && !hideBackpack) {
    logWarn(
      "jump-fragment",
      "跳转片段时未检测到可卸叠层（playerOverlaySession=false 且 isVisible 全空）。片段期间扩展 UI 可能仍盖住引擎对话框；若刚打开场景交互仍出现此日志，请检查会话标记。",
      { fragmentId, playerOverlaySession, visibleScene, visibleHud },
    );
  }

  beginOverlayYield();
  onLocalSuspend?.(true);
  logDebug("jump-fragment", "可跳回：本地挂起已置 true", { fragmentId });

  try {
    const options = chapterId ? { chapterId } : undefined;
    const sessionPending = isPlayerSessionPending();
    const signalAbortedBefore = ctx.flow.signal.aborted;

    if (!sessionPending) {
      logWarn(
        "jump-fragment",
        "可跳回：无 openSceneInteraction 阻塞门闩。callFragment 可能瞬间返回且对话不播；请用「打开场景交互（阻塞）」进入。",
        { fragmentId, playerOverlaySession },
      );
    }

    /**
     * 先启动嵌套 callFragment，再 ui.hide。
     * 宿主需要仍挂着的阻塞 method 上下文；先 hide 再 call 会出现 ~20ms 空返回。
     */
    logDebug("jump-fragment", "可跳回：先启动 callFragment（hide 之前）", {
      fragmentId,
      options,
      sessionPending,
      signalAbortedBefore,
      t: Date.now(),
    });
    const startedAt = Date.now();
    const fragmentPromise = ctx.flow.callFragment(fragmentId, options);

    if (hideBackpack) {
      logDebug("jump-fragment", "可跳回：hide 全屏背包", {
        visibleBackpack,
      });
      await hideAllCandidates(
        ctx,
        backpackCandidates,
        visibleBackpack,
      );
    }

    if (restoreHud) {
      logDebug("jump-fragment", "可跳回：hide HUD", {
        visibleHud,
        visualHudWasOpen,
        hudUiSession,
      });
      closeVisualInventoryHud(ctx);
      /**
       * 会话标志在 close 里被清掉；片段后仍需恢复，先记下再写回意图。
       */
      if (visualHudWasOpen) {
        setVisualInventoryHudSession(true);
      }

      lastBagUiPath = await hideAllCandidates(
        ctx,
        hudCandidates,
        visibleHud ?? lastBagUiPath,
      );
    }

    if (restoreScene) {
      logDebug("jump-fragment", "可跳回：hide 场景交互叠层", {
        visibleScene,
        lastSceneUiPath,
        restoreProps: restorePropsSnapshot,
      });
      lastSceneUiPath = await hideAllCandidates(
        ctx,
        sceneCandidates,
        visibleScene ?? lastSceneUiPath,
      );
    }

    logDebug("jump-fragment", "可跳回：叠层已卸，await callFragment", {
      fragmentId,
      signalAbortedAfterHide: ctx.flow.signal.aborted,
      t: Date.now(),
    });

    await fragmentPromise;

    const elapsedMs = Date.now() - startedAt;
    logDebug("jump-fragment", "可跳回：ctx.flow.callFragment 已返回", {
      fragmentId,
      elapsedMs,
      sessionPending,
      t: Date.now(),
    });

    if (elapsedMs < 100) {
      logWarn(
        "jump-fragment",
        "可跳回：callFragment 返回过快（对话可能未播放）",
        {
          fragmentId,
          elapsedMs,
          sessionPending,
          signalAborted: ctx.flow.signal.aborted,
        },
      );
    }
  } finally {
    logDebug("jump-fragment", "可跳回：finally 开始恢复叠层", {
      fragmentId,
      restoreScene,
      restoreHud,
      playerOverlaySession,
      overlayYieldDepth,
      t: Date.now(),
    });

    try {
      if (restoreScene) {
        const scenePath = pickRestoreScenePath(
          lastSceneUiPath,
          visibleScene,
          sceneCandidates,
        );

        logDebug("jump-fragment", "可跳回：show 场景交互", {
          scenePath,
          props: restorePropsSnapshot,
          lastSceneUiPath,
        });
        await safeShow(
          ctx,
          scenePath,
          restorePropsSnapshot,
          SCENE_UI_SHOW_OPTS,
        );
        lastSceneUiPath = scenePath;
        /** 重挂后 React effect 可能抢写；再次钉死本次快照 */
        if (Object.keys(restorePropsSnapshot).length > 0) {
          setSceneInteractionRestoreProps(restorePropsSnapshot);
        }
      }

      if (restoreHud) {
        logDebug("jump-fragment", "可跳回：show HUD", {
          lastBagUiPath,
          visibleHud,
        });
        await openInventoryHudPreferVisual(ctx, async () => {
          const hudPath =
            lastBagUiPath ?? visibleHud ?? hudCandidates[0]!;

          await safeShow(
            ctx,
            hudPath,
            { compactHost: true },
            getTightBackpackHudShowOptions(ctx),
          );
        });
      }
    } finally {
      onLocalSuspend?.(false);
      endOverlayYield();
      logDebug("jump-fragment", "可跳回：本地挂起已置 false", { fragmentId });
    }

    logInfo("jump-fragment", "片段结束，已尝试恢复扩展叠层", {
      fragmentId,
      restoreScene,
      restoreHud,
      scenePath: lastSceneUiPath,
      hudPath: lastBagUiPath,
      playerOverlaySession,
    });
  }
}

/**
 * 不可跳回：卸扩展叠层后 `unsafe_goToFragment`（不恢复）。
 *
 * @param ctx - 扩展上下文
 * @param fragmentId - 目标片段
 * @param chapterId - 可选章节
 * @param onLocalSuspend - 可选本地挂起
 */
export function goToFragmentYieldingOverlay(
  ctx: ExtensionContext,
  fragmentId: string,
  chapterId: string | undefined,
  onLocalSuspend?: LocalOverlaySuspend,
): void {
  const sceneCandidates = sceneInteractionUiPathCandidates();
  const hudCandidates = backpackHudUiPathCandidates();
  const backpackCandidates = backpackUiPathCandidates();

  const visibleScene = findVisiblePath(ctx, sceneCandidates);
  const visibleHud = findVisiblePath(ctx, hudCandidates);
  const visibleBackpack = findVisiblePath(ctx, backpackCandidates);
  const hideScene = playerOverlaySession || visibleScene !== null;
  const hideHud =
    hudUiSession ||
    visibleHud !== null ||
    isVisualInventoryHudSessionOpen();
  const hideBackpack = visibleBackpack !== null;

  logInfo("jump-fragment", "不可跳回：卸叠层后 goToFragment", {
    fragmentId,
    chapterId: chapterId ?? "(未指定)",
    hideScene,
    hideHud,
    hudUiSession,
    hideBackpack,
    playerOverlaySession,
    visibleScene,
    visibleHud,
    visibleBackpack,
  });

  beginOverlayYield();
  onLocalSuspend?.(true);
  logDebug("jump-fragment", "不可跳回：本地挂起已置 true（异步 hide 启动）", {
    fragmentId,
  });

  void (async () => {
    try {
      if (hideBackpack) {
        logDebug("jump-fragment", "不可跳回：hide 全屏背包", {
          visibleBackpack,
        });
        await hideAllCandidates(ctx, backpackCandidates, visibleBackpack);
      }

      if (hideHud) {
        logDebug("jump-fragment", "不可跳回：hide HUD", { visibleHud });
        closeVisualInventoryHud(ctx);
        await hideAllCandidates(
          ctx,
          hudCandidates,
          visibleHud ?? lastBagUiPath,
        );
      }

      if (hideScene) {
        logDebug("jump-fragment", "不可跳回：hide 场景交互叠层", {
          visibleScene,
        });
        await hideAllCandidates(
          ctx,
          sceneCandidates,
          visibleScene ?? lastSceneUiPath,
        );
      }
    } finally {
      endOverlayYield();
      logDebug("jump-fragment", "不可跳回：clear session 后 goToFragment", {
        fragmentId,
        chapterId: chapterId ?? "(未指定)",
        t: Date.now(),
      });
      forceClearPlayerOverlaySession();

      const options = chapterId ? { chapterId } : undefined;

      ctx.flow.unsafe_goToFragment(fragmentId, options);
      logDebug("jump-fragment", "不可跳回：unsafe_goToFragment 已调用", {
        fragmentId,
        t: Date.now(),
      });
    }
  })();
}

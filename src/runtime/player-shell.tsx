/**
 * player-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.2
 *
 * 玩家会话壳（modal）：纯运行时画面（场景 + 动作链 / toast / once）+ 库存 / 进度；
 * 无上方预览条；右上角浮层「退出」关闭阻塞会话。
 * 背包 / 快捷栏 UI 由独立程序 `backpack-hud` 模块负责，本壳不再挂载 InventoryHudLayer。
 * 片段跳转经 ctx.flow 注入 ActionRuntime。
 * 根背景透明，letterbox 透明时才能透出引擎对话框等下层 UI。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useExtensionContext,
  type SaveAPI,
} from "@avg-studio/sdk";
import type { ActionRuntime } from "../domain/actions";
import { executeSceneActions } from "../domain/actions";
import { resolveItemToastAppearance } from "../domain/item-toast-config";
import { findScene } from "../domain/scene-registry";
import { markHotspotInteracted } from "../domain/progress";
import {
  parseSceneReturnStackJson,
  stringifySceneReturnStack,
} from "../domain/scene-return-stack";
import {
  advanceRewardFlyQueue,
  emptyRewardFlyQueue,
  enqueueRewardFly,
  type RewardFlyQueueState,
} from "../domain/reward-fly";
import {
  advanceToastQueue,
  emptyToastQueue,
  enqueueToast,
  type ToastQueueState,
} from "../domain/toast-queue";
import type {
  HotspotElement,
  InventoryState,
  ItemDefinition,
  SceneDefinition,
  SceneProgress,
} from "../domain/types";
import { resolveAssetUrl } from "../shared/resolve-asset-url";
import {
  useProgress,
} from "../store/inventory-persistence";
import {
  getInventorySession,
  useInventorySession,
} from "../store/inventory-session";
import { readAuthorSetting } from "../store/author-settings";
import {
  getForcedOpenSceneId,
  subscribeForcedOpenSceneId,
} from "../store/open-scene-target";
import { useItemsLibrary } from "../store/items-persistence";
import { useScenesLibrary } from "../store/scenes-persistence";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { useDesignSize } from "../store/use-design-size";
import { useSaveValue } from "../store/use-save-value";
import { useSceneUiConfig } from "../store/use-scene-ui-config";
import { FONT_SIZE_DEFAULT, useTheme } from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";
import { logDebug } from "../shared/logger";
import { createActionRuntime } from "./create-action-runtime";
import { isPlayerSessionPending } from "./player-session";
import { RewardFlyLayer } from "./reward-fly-layer";
import { SceneReturnButton } from "./scene-return-button";
import { SceneView } from "./scene-view";
import {
  callFragmentYieldingOverlay,
  goToFragmentYieldingOverlay,
  isPlayerOverlaySessionActive,
} from "./suspend-overlay-for-fragment";

/**
 * PlayerShell 组件属性。
 */
export interface PlayerShellProps {
  /**
   * 强类型存档 API（读写 currentSceneId / inventory / progress）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;

  /**
   * 方法 ui.show 直传的目标场景 id；优先于 save，避免首帧错场景。
   */
  openSceneId?: string;

  /**
   * 玩家点击「退出」时调用。
   * App 注入实现：`ctx.ui.hide(SCENE_INTERACTION_UI_ID)` + `endPlayerSessionWait()`。
   *
   * @returns void | Promise<void>
   */
  onRequestClose: () => void | Promise<void>;
}

/**
 * 浮层退出按钮样式（非预览顶栏）。
 *
 * @param tokens - 主题 token
 * @returns CSSProperties
 */
function exitButtonStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${tokens.accent}`,
    background: tokens.accent,
    color: "#0B1210",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 600,
    cursor: "pointer",
    lineHeight: 1.2,
    pointerEvents: "auto",
  };
}

/**
 * 根据 save.currentSceneId 与场景库解析当前场景。
 *
 * 优先级：currentSceneId → 开场强制 id（仅兜底）→ mainSceneId →
 * 编辑器 defaultSceneId → 库首项。
 * current 必须优先，否则 hotspot openScene 会被开场 forced id 锁死。
 *
 * @param scenes - 场景列表
 * @param currentSceneId - 存档中的场景 id
 * @param mainSceneId - 存档本次交互主场景 id（可空）
 * @param editorDefaultSceneId - 编辑器全局主场景 id（可空）
 * @param forcedSceneId - 方法开场直传 id（可空；current 为空时才有意义）
 * @returns 场景定义或 null
 */
function resolveCurrentScene(
  scenes: SceneDefinition[],
  currentSceneId: string,
  mainSceneId = "",
  editorDefaultSceneId = "",
  forcedSceneId = "",
): SceneDefinition | null {
  if (scenes.length === 0) {
    return null;
  }

  for (const key of [
    currentSceneId,
    forcedSceneId,
    mainSceneId,
    editorDefaultSceneId,
  ]) {
    const trimmed = typeof key === "string" ? key.trim() : "";

    if (trimmed.length === 0) {
      continue;
    }

    const found = findScene(scenes, trimmed);

    if (found !== undefined) {
      return found;
    }
  }

  return scenes[0] ?? null;
}

/**
 * 玩家会话壳：全屏场景交互，无编辑入口，顶栏「退出」关闭会话。
 *
 * 交互逻辑与 RuntimeShell 对齐（动作链、toast、once 防抖）；
 * 背包 UI 由 `backpack-hud` 模块提供，不在本壳内渲染。
 *
 * @param props.save - 存档 API
 * @param props.onRequestClose - 退出回调
 * @returns 全屏玩家 UI
 *
 * @example
 * ```tsx
 * <PlayerShell
 *   save={save}
 *   onRequestClose={() => endPlayerSessionWait()}
 * />
 * ```
 *
 * @remarks
 * - data-testid：`player-shell` / `player-shell-exit`
 * - 不自动 end session；仅由退出按钮触发 onRequestClose
 */
export function PlayerShell({
  save,
  openSceneId,
  onRequestClose,
}: PlayerShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();
  const [moduleForcedId, setModuleForcedId] = useState<string | null>(() =>
    getForcedOpenSceneId(),
  );

  useEffect(() => subscribeForcedOpenSceneId(() => {
    setModuleForcedId(getForcedOpenSceneId());
  }), []);

  const forcedOpenSceneId =
    (typeof openSceneId === "string" ? openSceneId.trim() : "") ||
    (moduleForcedId ?? "");

  const [library] = useScenesLibrary();
  const [itemsLibrary] = useItemsLibrary();
  /** 经会话桥读写，hide/show 重挂不丢；并同步 save.inventoryJson */
  const [inventory, setInventory] = useInventorySession();
  const [progress, setProgress] = useProgress(save, ctx);
  const [currentSceneId, setCurrentSceneId] = useSaveValue(
    save,
    "currentSceneId",
    ctx,
  );
  const [mainSceneId, setMainSceneId] = useSaveValue(save, "mainSceneId", ctx);
  const [returnStackJson, setReturnStackJson] = useSaveValue(
    save,
    "sceneReturnStackJson",
    ctx,
  );

  const [toastQueue, setToastQueue] = useState<ToastQueueState>(() =>
    emptyToastQueue(),
  );
  const [rewardFlyQueue, setRewardFlyQueue] = useState<RewardFlyQueueState>(
    () => emptyRewardFlyQueue(),
  );

  /** 场景 UI 预设（itemToast + hotspotHover），订阅 editor.sceneUiJson 写入 */
  const sceneUi = useSceneUiConfig();

  /** 最新库存 / 库引用，供 ActionRuntime 闭包读取 */
  const inventoryRef = useRef<InventoryState>(inventory);
  const scenesRef = useRef<SceneDefinition[]>(library.scenes);
  const itemsRef = useRef<ItemDefinition[]>(itemsLibrary.items);
  const progressRef = useRef<SceneProgress>(progress);
  /** 当前场景 id / 返回栈 JSON 引用，供 ActionRuntime 闭包读取最新值 */
  const currentSceneIdRef = useRef<string>(currentSceneId);
  const returnStackJsonRef = useRef<string>(returnStackJson);

  /**
   * 动作链执行中为 true；期间忽略重复 hotspot 点击，避免并发动作链。
   */
  const hotspotBusyRef = useRef(false);

  inventoryRef.current = inventory;
  scenesRef.current = library.scenes;
  itemsRef.current = itemsLibrary.items;
  progressRef.current = progress;
  currentSceneIdRef.current = currentSceneId;
  returnStackJsonRef.current = returnStackJson;

  const editorDefaultSceneId = String(
    readAuthorSetting(ctx, "defaultSceneId") ?? "",
  ).trim();

  const safeCurrentSceneId =
    typeof currentSceneId === "string" ? currentSceneId : "";
  const safeMainSceneId = typeof mainSceneId === "string" ? mainSceneId : "";

  const scene = useMemo(
    () =>
      resolveCurrentScene(
        library.scenes,
        safeCurrentSceneId,
        safeMainSceneId,
        editorDefaultSceneId,
        forcedOpenSceneId,
      ),
    [
      library.scenes,
      safeCurrentSceneId,
      safeMainSceneId,
      editorDefaultSceneId,
      forcedOpenSceneId,
    ],
  );

  /**
   * 仅在 current 为空时用开场 forced id 播种；
   * 禁止用 forced 覆盖已有 current（否则场景内 openScene 会被立刻打回）。
   */
  useEffect(() => {
    if (safeCurrentSceneId.length > 0) {
      return;
    }

    if (forcedOpenSceneId.length > 0) {
      setCurrentSceneId(forcedOpenSceneId);

      if (safeMainSceneId.length === 0) {
        setMainSceneId(forcedOpenSceneId);
      }

      return;
    }

    if (scene !== null) {
      setCurrentSceneId(scene.id);
    }
  }, [
    forcedOpenSceneId,
    safeCurrentSceneId,
    safeMainSceneId,
    scene,
    setCurrentSceneId,
    setMainSceneId,
  ]);

  /**
   * toast 入队（ActionRuntime 回调）。
   *
   * 全局 Toast 配置取自 `SceneUiConfig.itemToast`（editor.sceneUiJson），
   * 与动作级覆盖合并，得到完整外观后写入 `ToastRequest`，
   * 保证队列中的请求始终包含必填的 `placement/offsetX/offsetY/gap/style`。
   *
   * @param payload - toast 载荷（含可选覆盖）
   */
  const handleEnqueueToast = useCallback(
    (payload: Parameters<ActionRuntime["enqueueToast"]>[0]): void => {
      const global = sceneUi.itemToast;
      const {
        text,
        anchorHotspotId,
        motion,
        screenCenter,
        ...overrides
      } = payload;
      const appearance = resolveItemToastAppearance(global, overrides);

      setToastQueue((prev) =>
        enqueueToast(prev, {
          text,
          anchorHotspotId,
          motion,
          ...appearance,
          ...(screenCenter === true ? { screenCenter: true } : {}),
        }),
      );
    },
    [sceneUi],
  );

  /**
   * 奖励飞入入队。
   *
   * @param payload - 已解析的飞入载荷
   */
  const handleEnqueueRewardFly = useCallback(
    (payload: {
      itemId: string;
      iconUrl: string;
      displayName: string;
      slotIndex: number;
    }): void => {
      setRewardFlyQueue((prev) => enqueueRewardFly(prev, payload));
    },
    [],
  );

  /**
   * 可跳回：卸扩展叠层后再 callFragment（避免盖住引擎对话框）。
   *
   * @param fragmentId - 片段 id
   * @param chapterId - 可选章节
   */
  /** hide 未立刻卸树时，先本地藏起场景区 */
  const [overlayYielded, setOverlayYielded] = useState(false);

  const handleCallFragment = useCallback(
    async (fragmentId: string, chapterId?: string): Promise<void> => {
      await callFragmentYieldingOverlay(
        ctx,
        fragmentId,
        chapterId,
        setOverlayYielded,
      );
    },
    [ctx],
  );

  /**
   * 不可跳回：卸扩展叠层后 goToFragment。
   *
   * @param fragmentId - 片段 id
   * @param chapterId - 可选章节
   */
  const handleGoToFragment = useCallback(
    (fragmentId: string, chapterId?: string): void => {
      goToFragmentYieldingOverlay(
        ctx,
        fragmentId,
        chapterId,
        setOverlayYielded,
      );
    },
    [ctx],
  );

  const actionRuntime = useMemo(
    () =>
      createActionRuntime({
        getScenes: () => scenesRef.current,
        getItems: () => itemsRef.current,
        /** 读模块会话，避免 inventoryRef 尚未随 React 重渲染更新时用空库存覆盖 */
        getInventory: () => getInventorySession(),
        setInventory,
        setCurrentSceneId: (id) => {
          currentSceneIdRef.current = id;
          setCurrentSceneId(id);
        },
        getCurrentSceneId: () => currentSceneIdRef.current,
        getReturnStack: () =>
          parseSceneReturnStackJson(returnStackJsonRef.current),
        setReturnStack: (stack) => {
          const json = stringifySceneReturnStack(stack);
          returnStackJsonRef.current = json;
          setReturnStackJson(json);
        },
        enqueueToast: handleEnqueueToast,
        enqueueRewardFly: handleEnqueueRewardFly,
        resolveUrl: (uri) =>
          resolveAssetUrl(uri, ctx.asset?.resolve?.bind(ctx.asset)),
        callFragment: handleCallFragment,
        goToFragment: handleGoToFragment,
        continueStory: async () => {
          logDebug("continue-story", "PlayerShell.continueStory → onRequestClose", {
            playerOverlaySession: isPlayerOverlaySessionActive(),
            sessionPending: isPlayerSessionPending(),
            t: Date.now(),
          });
          await onRequestClose();
          logDebug("continue-story", "PlayerShell.continueStory ← onRequestClose 返回", {
            sessionPending: isPlayerSessionPending(),
            t: Date.now(),
          });
        },
      }),
    [
      setInventory,
      setCurrentSceneId,
      setReturnStackJson,
      handleEnqueueToast,
      handleEnqueueRewardFly,
      ctx.asset,
      handleCallFragment,
      handleGoToFragment,
      onRequestClose,
    ],
  );

  /**
   * 推进 toast 队列。
   */
  const handleToastAdvance = useCallback((): void => {
    setToastQueue((prev) => advanceToastQueue(prev));
  }, []);

  /**
   * 推进奖励飞入队列。
   */
  const handleRewardFlyAdvance = useCallback((): void => {
    setRewardFlyQueue((prev) => advanceRewardFlyQueue(prev));
  }, []);

  /**
   * 交互点点击：动作链完成后记录交互；once 点同时消耗并隐藏。
   * 动作链未结束前忽略再次点击（防抖）。
   *
   * @param hotspot - 被激活的交互点
   */
  const handleHotspotActivate = useCallback(
    async (hotspot: HotspotElement): Promise<void> => {
      if (hotspotBusyRef.current) {
        return;
      }

      hotspotBusyRef.current = true;

      try {
        const { aborted } = await executeSceneActions(
          hotspot.actions,
          hotspot.id,
          actionRuntime,
        );

        if (!aborted) {
          setProgress(markHotspotInteracted(progressRef.current, hotspot));
        }
      } catch (err) {
        console.warn("[scene-interaction]", "hotspot activate failed", err);
      } finally {
        hotspotBusyRef.current = false;
      }
    },
    [actionRuntime, setProgress],
  );

  /**
   * 顶栏「退出」：委托给 App / 方法层注入的关闭回调。
   */
  const handleExit = useCallback((): void => {
    onRequestClose();
  }, [onRequestClose]);

  return (
    <div
      data-testid="player-shell"
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        minHeight: 0,
        /** 透明根：场景透明铺底，透出引擎层 */
        background: "transparent",
        color: tokens.textPrimary,
        visibility: overlayYielded ? "hidden" : "visible",
        /**
         * 全屏根不抢指针：空白穿透到引擎对话框；
         * 交互点 / 返回钮 / 退出钮各自 pointerEvents:auto。
         */
        pointerEvents: "none",
      }}
    >
      <div
        data-testid="player-body"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          pointerEvents: "none",
        }}
      >
        <SceneView
          scene={scene}
          progress={progress}
          designWidth={designSize.width}
          designHeight={designSize.height}
          toastQueue={toastQueue}
          onToastAdvance={handleToastAdvance}
          onHotspotActivate={handleHotspotActivate}
          globalHoverShadow={sceneUi.hotspotHover}
          globalHotspotLabel={sceneUi.hotspotLabel}
        />

        {/* 场景返回浮层按钮：栈顶存在有效目标且 ≠ 当前场景时显示 */}
        <SceneReturnButton
          config={sceneUi.sceneReturn}
          stackJson={returnStackJson}
          currentSceneId={currentSceneId}
          scenes={library.scenes}
          designWidth={designSize.width}
          designHeight={designSize.height}
          onReturn={(id, stack) => {
            const json = stringifySceneReturnStack(stack);
            returnStackJsonRef.current = json;
            setReturnStackJson(json);
            currentSceneIdRef.current = id;
            setCurrentSceneId(id);
          }}
        />
      </div>

      <RewardFlyLayer
        queue={rewardFlyQueue}
        onAdvance={handleRewardFlyAdvance}
      />

      {/* 浮层退出：不占用预览顶栏区域 */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 60,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          data-testid="player-shell-exit"
          onClick={handleExit}
          style={exitButtonStyle(tokens)}
        >
          退出
        </button>
      </div>
    </div>
  );
}

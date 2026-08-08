/**
 * player-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.1
 *
 * 玩家会话壳（modal）：纯运行时画面（场景 + 动作链 / toast / once）+ 库存 / 进度；
 * 无上方预览条；右上角浮层「退出」关闭阻塞会话。
 * 背包 / 快捷栏 UI 由独立程序 `backpack-hud` 模块负责，本壳不再挂载 InventoryHudLayer。
 * Toast / 悬停预设经 editor.sceneUiJson（useSceneUiConfig）注入。
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
import { markConsumed } from "../domain/progress";
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
import {
  useInventory,
  useProgress,
} from "../store/inventory-persistence";
import { useItemsLibrary } from "../store/items-persistence";
import { useScenesLibrary } from "../store/scenes-persistence";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { useDesignSize } from "../store/use-design-size";
import { useSaveValue } from "../store/use-save-value";
import { useSceneUiConfig } from "../store/use-scene-ui-config";
import { FONT_SIZE_DEFAULT, useTheme } from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";
import { createActionRuntime } from "./create-action-runtime";
import { SceneView } from "./scene-view";

/**
 * PlayerShell 组件属性。
 */
export interface PlayerShellProps {
  /**
   * 强类型存档 API（读写 currentSceneId / inventory / progress）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;

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
 * 根据 save.currentSceneId 与场景库解析当前场景；空 id 时回退首个场景。
 *
 * @param scenes - 场景列表
 * @param currentSceneId - 存档中的场景 id
 * @returns 场景定义或 null
 */
function resolveCurrentScene(
  scenes: SceneDefinition[],
  currentSceneId: string,
): SceneDefinition | null {
  if (scenes.length === 0) {
    return null;
  }

  if (currentSceneId) {
    const found = findScene(scenes, currentSceneId);

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
  onRequestClose,
}: PlayerShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();

  const [library] = useScenesLibrary();
  const [itemsLibrary] = useItemsLibrary();
  const [inventory, setInventory] = useInventory(save, ctx);
  const [progress, setProgress] = useProgress(save, ctx);
  const [currentSceneId, setCurrentSceneId] = useSaveValue(
    save,
    "currentSceneId",
    ctx,
  );

  const [toastQueue, setToastQueue] = useState<ToastQueueState>(() =>
    emptyToastQueue(),
  );

  /** 场景 UI 预设（itemToast + hotspotHover），订阅 editor.sceneUiJson 写入 */
  const sceneUi = useSceneUiConfig();

  /** 最新库存 / 库引用，供 ActionRuntime 闭包读取 */
  const inventoryRef = useRef<InventoryState>(inventory);
  const scenesRef = useRef<SceneDefinition[]>(library.scenes);
  const itemsRef = useRef<ItemDefinition[]>(itemsLibrary.items);
  const progressRef = useRef<SceneProgress>(progress);

  /**
   * 动作链执行中为 true；期间忽略重复 hotspot 点击，避免并发动作链。
   */
  const hotspotBusyRef = useRef(false);

  inventoryRef.current = inventory;
  scenesRef.current = library.scenes;
  itemsRef.current = itemsLibrary.items;
  progressRef.current = progress;

  const scene = useMemo(
    () => resolveCurrentScene(library.scenes, currentSceneId),
    [library.scenes, currentSceneId],
  );

  /**
   * 存档 currentSceneId 为空但库有场景时，回写首个场景 id。
   */
  useEffect(() => {
    if (!currentSceneId && scene !== null) {
      setCurrentSceneId(scene.id);
    }
  }, [currentSceneId, scene, setCurrentSceneId]);

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
      const { text, anchorHotspotId, motion, ...overrides } = payload;
      const appearance = resolveItemToastAppearance(global, overrides);

      setToastQueue((prev) =>
        enqueueToast(prev, {
          text,
          anchorHotspotId,
          motion,
          ...appearance,
        }),
      );
    },
    [sceneUi],
  );

  const actionRuntime = useMemo(
    () =>
      createActionRuntime({
        getScenes: () => scenesRef.current,
        getItems: () => itemsRef.current,
        getInventory: () => inventoryRef.current,
        setInventory,
        setCurrentSceneId,
        enqueueToast: handleEnqueueToast,
      }),
    [setInventory, setCurrentSceneId, handleEnqueueToast],
  );

  /**
   * 推进 toast 队列。
   */
  const handleToastAdvance = useCallback((): void => {
    setToastQueue((prev) => advanceToastQueue(prev));
  }, []);

  /**
   * 交互点点击：执行动作链；once 完成后 markConsumed 并隐藏。
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
        await executeSceneActions(
          hotspot.actions,
          hotspot.id,
          actionRuntime,
        );

        if (hotspot.once) {
          setProgress(markConsumed(progressRef.current, hotspot.id));
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
        background: tokens.bgBase,
        color: tokens.textPrimary,
      }}
    >
      <div
        data-testid="player-body"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
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
        />
      </div>

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

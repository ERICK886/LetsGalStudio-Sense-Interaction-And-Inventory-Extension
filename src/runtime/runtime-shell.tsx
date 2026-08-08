/**
 * runtime-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.4
 *
 * 场景交互运行时壳（纯玩家画面）：场景 + 动作链 / toast / once；
 * 无预览顶栏、无背包 HUD（背包由独立程序 backpack-hud 负责）。
 * 动作链执行中忽略重复 hotspot 点击（防抖）。
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
  parseSceneReturnStackJson,
  stringifySceneReturnStack,
} from "../domain/scene-return-stack";
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
import { useTheme } from "../theme/theme-provider";
import { createActionRuntime } from "./create-action-runtime";
import { SceneReturnButton } from "./scene-return-button";
import { SceneView } from "./scene-view";

/**
 * RuntimeShell 组件属性。
 */
export interface RuntimeShellProps {
  /**
   * 强类型存档 API（读写 currentSceneId / inventory / progress）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;
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
 * 玩家运行时壳：全屏场景 + 动作链 / once / toast（无预览顶栏）。
 *
 * @param props.save - 存档 API
 * @returns 全屏运行时 UI
 *
 * @example
 * ```tsx
 * <RuntimeShell save={save} />
 * ```
 */
export function RuntimeShell({
  save,
}: RuntimeShellProps): React.ReactElement {
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
  const [returnStackJson, setReturnStackJson] = useSaveValue(
    save,
    "sceneReturnStackJson",
    ctx,
  );

  const [toastQueue, setToastQueue] = useState<ToastQueueState>(() =>
    emptyToastQueue(),
  );

  /** 场景 UI 预设（itemToast + hotspotHover），订阅 editor.sceneUiJson 写入 */
  const sceneUi = useSceneUiConfig();

  /** 最新库存 / 库引用，供 ActionRuntime 读取 */
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

  const scene = useMemo(
    () => resolveCurrentScene(library.scenes, currentSceneId),
    [library.scenes, currentSceneId],
  );

  /**
   * 存档 currentSceneId 为空但库有场景时，回写首个场景 id（便于剧本/重开一致性）。
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
      }),
    [
      setInventory,
      setCurrentSceneId,
      setReturnStackJson,
      handleEnqueueToast,
    ],
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

  return (
    <div
      data-testid="runtime-shell"
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
        data-testid="runtime-body"
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
    </div>
  );
}

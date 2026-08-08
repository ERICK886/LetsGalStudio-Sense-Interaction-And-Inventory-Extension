/**
 * runtime-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 场景交互运行时壳：顶栏 + 当前场景渲染 + 动作链 / toast / once 进度。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useExtensionContext,
  type SaveAPI,
} from "@avg-studio/sdk";
import { executeSceneActions } from "../domain/actions";
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
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";
import { createActionRuntime } from "./create-action-runtime";
import { SceneView } from "./scene-view";

/**
 * RuntimeShell 组件属性。
 */
export interface RuntimeShellProps {
  /**
   * 强类型存档 API（读写 currentSceneId / inventory / progress）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;

  /**
   * 是否允许进入编辑器。
   * true 时顶栏显示「编辑」按钮。
   */
  allowEdit: boolean;

  /**
   * 切回编辑模式（仅 allowEdit 时使用）。
   *
   * @param enabled - true 进入编辑
   */
  onSetEditMode: (enabled: boolean) => void;
}

/**
 * 顶栏按钮样式。
 *
 * @param tokens - 主题 token
 * @param variant - 按钮变体
 * @returns CSSProperties
 */
function topBarButtonStyle(
  tokens: ThemeTokens,
  variant: "default" | "primary" = "default",
): React.CSSProperties {
  const isPrimary = variant === "primary";

  return {
    appearance: "none",
    border: `1px solid ${isPrimary ? tokens.accent : tokens.borderStrong}`,
    background: isPrimary ? tokens.accent : tokens.bgSunken,
    color: isPrimary ? "#0B1210" : tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: isPrimary ? 600 : 500,
    cursor: "pointer",
    lineHeight: 1.2,
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
 * 玩家 / 预览运行时壳：渲染当前场景、点击动作链、once 与 toast。
 *
 * @param props.save - 存档 API
 * @param props.allowEdit - 是否显示编辑入口
 * @param props.onSetEditMode - 切换编辑模式
 * @returns 全屏运行时 UI
 *
 * @example
 * ```tsx
 * <RuntimeShell
 *   save={save}
 *   allowEdit={allowEdit}
 *   onSetEditMode={(v) => save.set("isEditMode", v)}
 * />
 * ```
 */
export function RuntimeShell({
  save,
  allowEdit,
  onSetEditMode,
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

  const [toastQueue, setToastQueue] = useState<ToastQueueState>(() =>
    emptyToastQueue(),
  );

  /** 最新库存 / 库引用，供 ActionRuntime 闭包读取 */
  const inventoryRef = useRef<InventoryState>(inventory);
  const scenesRef = useRef<SceneDefinition[]>(library.scenes);
  const itemsRef = useRef<ItemDefinition[]>(itemsLibrary.items);
  const progressRef = useRef<SceneProgress>(progress);

  inventoryRef.current = inventory;
  scenesRef.current = library.scenes;
  itemsRef.current = itemsLibrary.items;
  progressRef.current = progress;

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
   * @param payload - toast 载荷
   */
  const handleEnqueueToast = useCallback(
    (payload: {
      text: string;
      anchorHotspotId: string;
      motion: import("../domain/types").ElementMotion;
    }): void => {
      setToastQueue((prev) =>
        enqueueToast(prev, {
          text: payload.text,
          anchorHotspotId: payload.anchorHotspotId,
          motion: payload.motion,
        }),
      );
    },
    [],
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
   *
   * @param hotspot - 被激活的交互点
   */
  const handleHotspotActivate = useCallback(
    async (hotspot: HotspotElement): Promise<void> => {
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
      }
    },
    [actionRuntime, setProgress],
  );

  const sceneTitle = scene?.name ?? "（无场景）";

  return (
    <div
      data-testid="runtime-shell"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: tokens.bgBase,
        color: tokens.textPrimary,
      }}
    >
      <header
        data-testid="runtime-top-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.bgElevated,
          flexShrink: 0,
          boxShadow: "0 1px 0 rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginRight: 4,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: tokens.accent,
              boxShadow: `0 0 0 3px ${tokens.accent}33`,
            }}
          />
          <span
            style={{
              fontSize: FONT_SIZE_TITLE,
              fontWeight: 650,
              color: tokens.textPrimary,
              letterSpacing: "0.02em",
            }}
          >
            场景交互
          </span>
        </div>

        {allowEdit ? (
          <button
            type="button"
            data-testid="runtime-mode-toggle"
            onClick={() => onSetEditMode(true)}
            style={topBarButtonStyle(tokens, "primary")}
          >
            编辑
          </button>
        ) : null}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: FONT_SIZE_DEFAULT, color: tokens.textMuted }}>
          {sceneTitle}
        </span>
      </header>

      <main
        data-testid="runtime-body"
        style={{
          flex: 1,
          minHeight: 0,
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
        />
      </main>
    </div>
  );
}

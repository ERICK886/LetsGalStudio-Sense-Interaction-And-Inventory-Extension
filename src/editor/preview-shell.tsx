/**
 * preview-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.3
 *
 * 编辑器内「运行预览」壳（作者工具侧，≠ scene-interaction 玩家运行时）。
 * 提供场景 / 动作链 / toast / once 预览。
 * `save` 为扩展 settings 沙箱，与玩家 slot 隔离。
 * 背包以内嵌 BackpackShell 叠层显示（勿 ui.show，以免顶掉编辑器预览容器）。
 * 另带预览顶栏：品牌、场景名、「编辑」返回 EditorShell。
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
import { createActionRuntime } from "../runtime/create-action-runtime";
import { SceneView } from "../runtime/scene-view";
import {
  useInventory,
  useProgress,
} from "../store/inventory-persistence";
import { bindInventoryPersistence } from "../store/inventory-session";
import { useItemsLibrary } from "../store/items-persistence";
import { useScenesLibrary } from "../store/scenes-persistence";
import type { SceneInteractionSaveMap } from "../store/save-types";
import { useDesignSize } from "../store/use-design-size";
import { useSaveValue } from "../store/use-save-value";
import { useSceneUiConfig } from "../store/use-scene-ui-config";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

type BackpackShellComponent = React.ComponentType<{
  openBackpack?: boolean;
}>;

/**
 * PreviewShell 组件属性。
 */
export interface PreviewShellProps {
  /**
   * 预览会话内存存档（与玩家 slot 隔离）。
   */
  save: SaveAPI<SceneInteractionSaveMap>;

  /**
   * 返回编辑器（顶栏「编辑」）。
   *
   * @param enabled - 恒为 true（进入编辑）
   */
  onBackToEditor: (enabled: boolean) => void;
}

/**
 * 预览顶栏按钮样式。
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
 * 根据 currentSceneId 与场景库解析当前场景；空 id 时回退首个场景。
 *
 * @param scenes - 场景列表
 * @param currentSceneId - 预览存档中的场景 id
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
 * 编辑器运行预览壳：顶栏 + 场景交互能力（作者调试用）。
 *
 * 背包以内嵌 BackpackShell 叠在场景上（与库存会话共享）。
 *
 * @param props.save - settings 沙箱预览存档
 * @param props.onBackToEditor - 点「编辑」返回 EditorShell
 * @returns 带预览顶栏的运行时 UI
 *
 * @example
 * ```tsx
 * <PreviewShell
 *   save={previewSave}
 *   onBackToEditor={() => setMode("edit")}
 * />
 * ```
 */
export function PreviewShell({
  save,
  onBackToEditor,
}: PreviewShellProps): React.ReactElement {
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

  const [BackpackShellComp, setBackpackShellComp] =
    useState<BackpackShellComponent | null>(null);

  const inventoryRef = useRef<InventoryState>(inventory);
  const scenesRef = useRef<SceneDefinition[]>(library.scenes);
  const itemsRef = useRef<ItemDefinition[]>(itemsLibrary.items);
  const progressRef = useRef<SceneProgress>(progress);
  const hotspotBusyRef = useRef(false);

  inventoryRef.current = inventory;
  scenesRef.current = library.scenes;
  itemsRef.current = itemsLibrary.items;
  progressRef.current = progress;

  const scene = useMemo(
    () => resolveCurrentScene(library.scenes, currentSceneId),
    [library.scenes, currentSceneId],
  );

  const sceneTitle = scene?.name ?? "（无场景）";

  useEffect(() => {
    if (!currentSceneId && scene !== null) {
      setCurrentSceneId(scene.id);
    }
  }, [currentSceneId, scene, setCurrentSceneId]);

  /** 绑定库存会话，供内嵌背包共享 */
  useEffect(() => bindInventoryPersistence(save), [save]);

  /** 预览内嵌背包壳（不走 ui.show） */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("../backpack/backpack-shell");

        if (!cancelled) {
          setBackpackShellComp(() => mod.BackpackShell);
        }
      } catch (err) {
        console.warn("[editor-preview]", "加载 BackpackShell 失败", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleToastAdvance = useCallback((): void => {
    setToastQueue((prev) => advanceToastQueue(prev));
  }, []);

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
        console.warn("[editor-preview]", "hotspot activate failed", err);
      } finally {
        hotspotBusyRef.current = false;
      }
    },
    [actionRuntime, setProgress],
  );

  return (
    <div
      data-testid="preview-shell"
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
        data-testid="preview-top-bar"
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
            运行预览
          </span>
        </div>

        <button
          type="button"
          data-testid="preview-mode-toggle"
          onClick={() => onBackToEditor(true)}
          style={topBarButtonStyle(tokens, "primary")}
        >
          编辑
        </button>

        <div style={{ flex: 1 }} />

        <span
          style={{ fontSize: FONT_SIZE_DEFAULT, color: tokens.textMuted }}
        >
          {sceneTitle}
        </span>
      </header>

      <main
        data-testid="preview-body"
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
          globalHoverShadow={sceneUi.hotspotHover}
        />

        {BackpackShellComp ? (
          <div
            data-testid="preview-backpack-overlay"
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 90,
              pointerEvents: "none",
            }}
          >
            <BackpackShellComp />
          </div>
        ) : null}
      </main>
    </div>
  );
}

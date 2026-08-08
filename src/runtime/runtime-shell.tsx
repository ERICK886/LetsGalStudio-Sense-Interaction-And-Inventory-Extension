/**
 * runtime-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.2
 *
 * 场景交互运行时壳：顶栏 + 当前场景渲染 + 动作链 / toast / once 进度；
 * `inventoryHudMode === "withScene"` 时挂载快捷栏 HUD（含背包合成 Tab）。
 * 动作链执行中忽略重复 hotspot 点击（防抖）。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useExtensionContext,
  type SaveAPI,
} from "@avg-studio/sdk";
import { executeSceneActions } from "../domain/actions";
import { craftRecipeInInventory } from "../domain/crafting";
import { findRecipe } from "../domain/recipe-registry";
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
  InventoryHudMode,
  InventoryState,
  ItemDefinition,
  RecipeDefinition,
  SceneDefinition,
  SceneProgress,
} from "../domain/types";
import {
  useInventory,
  useProgress,
} from "../store/inventory-persistence";
import { useItemsLibrary } from "../store/items-persistence";
import { useRecipesLibrary } from "../store/recipes-persistence";
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
import { CraftBagContext } from "./craft-panel";
import { createActionRuntime } from "./create-action-runtime";
import { InventoryHudLayer } from "./inventory-quickbar";
import { SceneView } from "./scene-view";

/**
 * 解析 settings.inventoryHudMode；非法值回退 withScene。
 *
 * @param raw - settings 原始值
 * @returns InventoryHudMode
 */
function resolveInventoryHudMode(raw: unknown): InventoryHudMode {
  return raw === "always" ? "always" : "withScene";
}

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
   * 打开独立编辑器程序（仅 allowEdit 时使用）。
   *
   * @param enabled - true 显示 editor；false 隐藏 editor
   */
  onSetEditMode: (enabled: boolean) => void;

  /**
   * 物品栏 HUD 模式；省略时从 settings.inventoryHudMode 读取。
   * - `withScene`：本壳内挂载快捷栏
   * - `always`：由 App 层挂载，本壳不重复渲染
   */
  inventoryHudMode?: InventoryHudMode;
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
 *   onSetEditMode={(v) => { if (v) ctx.ui.show("editor"); }}
 * />
 * ```
 */
export function RuntimeShell({
  save,
  allowEdit,
  onSetEditMode,
  inventoryHudMode: inventoryHudModeProp,
}: RuntimeShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();

  const [library] = useScenesLibrary();
  const [itemsLibrary] = useItemsLibrary();
  const [recipesLibrary] = useRecipesLibrary();
  const [inventory, setInventory] = useInventory(save, ctx);
  const [progress, setProgress] = useProgress(save, ctx);
  const [currentSceneId, setCurrentSceneId] = useSaveValue(
    save,
    "currentSceneId",
    ctx,
  );
  const [hudModeSetting] = ctx.settings.useValue("inventoryHudMode");

  /**
   * withScene：在本壳挂载快捷栏；always 由 App 层负责，避免双份 HUD。
   */
  const hudMode = resolveInventoryHudMode(
    inventoryHudModeProp ??
      (hudModeSetting !== undefined
        ? hudModeSetting
        : ctx.settings.get("inventoryHudMode")),
  );
  const showHudInShell = hudMode === "withScene";

  const [toastQueue, setToastQueue] = useState<ToastQueueState>(() =>
    emptyToastQueue(),
  );

  /** 最新库存 / 库引用，供 ActionRuntime 与合成闭包读取 */
  const inventoryRef = useRef<InventoryState>(inventory);
  const scenesRef = useRef<SceneDefinition[]>(library.scenes);
  const itemsRef = useRef<ItemDefinition[]>(itemsLibrary.items);
  const recipesRef = useRef<RecipeDefinition[]>(recipesLibrary.recipes);
  const progressRef = useRef<SceneProgress>(progress);

  /**
   * 动作链执行中为 true；期间忽略重复 hotspot 点击，避免并发动作链。
   */
  const hotspotBusyRef = useRef(false);

  inventoryRef.current = inventory;
  scenesRef.current = library.scenes;
  itemsRef.current = itemsLibrary.items;
  recipesRef.current = recipesLibrary.recipes;
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
   * 背包合成：findRecipe → craftRecipeInInventory → 成功则写回 inventory。
   * 预览壳同样提供合成 Tab，便于 Studio 调试。
   *
   * @param recipeId - 配方 id
   */
  const handleCraftRecipe = useCallback(
    (recipeId: string): void => {
      const recipe = findRecipe(recipesRef.current, recipeId);

      if (recipe === undefined) {
        console.warn(
          "[scene-interaction]",
          "craft: recipe not found",
          recipeId,
        );

        return;
      }

      const result = craftRecipeInInventory(
        inventoryRef.current,
        recipe,
        itemsRef.current,
        Date.now(),
      );

      if (!result.ok) {
        console.warn(
          "[scene-interaction]",
          "craft: failed",
          recipeId,
          result.reason,
        );

        return;
      }

      setInventory(result.state);
    },
    [setInventory],
  );

  /**
   * 注入背包合成 Tab（InventoryBackpack 经 Context 读取）。
   */
  const craftBagValue = useMemo(
    () => ({
      recipes: recipesLibrary.recipes,
      onCraftRecipe: handleCraftRecipe,
    }),
    [recipesLibrary.recipes, handleCraftRecipe],
  );

  const sceneTitle = scene?.name ?? "（无场景）";

  return (
    <CraftBagContext.Provider value={craftBagValue}>
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

        {showHudInShell ? <InventoryHudLayer save={save} /> : null}
      </main>
    </div>
    </CraftBagContext.Provider>
  );
}

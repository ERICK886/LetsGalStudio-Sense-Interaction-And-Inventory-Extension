/**
 * player-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 玩家会话壳（modal）：场景交互 + toast / once / 动作链；
 * 无编辑顶栏，提供「退出」以关闭会话。
 * `inventoryHudMode === "withScene"`（默认）时挂载快捷栏（含打开背包 / 合成）。
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

  /**
   * 物品栏 HUD 模式；省略时默认 withScene（玩家会话按「场景已打开」显示快捷栏）。
   * - `withScene`：本壳内挂载快捷栏（含打开背包）
   * - `always`：由外层挂载时本壳不重复渲染（玩家 modal 通常仍用 withScene）
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
 * 玩家会话壳：全屏场景交互，无编辑入口，顶栏「退出」关闭会话。
 *
 * 交互逻辑与 RuntimeShell 对齐（动作链、toast、once 防抖），
 * 避免过度抽取共享模块；结构可并行演进。
 *
 * @param props.save - 存档 API
 * @param props.onRequestClose - 退出回调
 * @param props.inventoryHudMode - HUD 模式；默认 withScene
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
  inventoryHudMode: inventoryHudModeProp,
}: PlayerShellProps): React.ReactElement {
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
   * 玩家会话默认 withScene：壳内挂快捷栏；always 时避免双份 HUD。
   */
  const hudMode = resolveInventoryHudMode(
    inventoryHudModeProp ??
      (hudModeSetting !== undefined
        ? hudModeSetting
        : ctx.settings.get("inventoryHudMode")) ??
      "withScene",
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
   * 顶栏「退出」：委托给 App / 方法层注入的关闭回调。
   */
  const handleExit = useCallback((): void => {
    onRequestClose();
  }, [onRequestClose]);

  /**
   * 背包合成：findRecipe → craftRecipeInInventory → 成功则写回 inventory。
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
   * 注入背包合成 Tab（InventoryBackpack 经 Context 读取；
   * 无需改 inventory-quickbar 传参）。
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
      data-testid="player-shell"
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
        data-testid="player-top-bar"
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

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: FONT_SIZE_DEFAULT, color: tokens.textMuted }}>
          {sceneTitle}
        </span>

        <button
          type="button"
          data-testid="player-shell-exit"
          onClick={handleExit}
          style={topBarButtonStyle(tokens, "primary")}
        >
          退出
        </button>
      </header>

      <main
        data-testid="player-body"
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

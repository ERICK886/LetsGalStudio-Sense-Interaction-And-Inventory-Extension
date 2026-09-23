/**
 * editor-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.1
 *
 * 场景交互编辑器主壳：顶栏 + 左中右三栏。
 * - 场景分区：场景/交互点列表、画布、Schema 属性
 * - 物品库分区：物品列表、预览、物品属性
 * - 配方分区：配方列表、公式预览、配方属性（v0.2 Task 5）
 * - Ctrl/Cmd+Z / Ctrl+Y / Ctrl+Shift+Z 按当前分区撤销重做
 * - 中栏 scene-canvas-host：保证画布 letterbox 居中
 * - 「运行预览」以左侧当前编辑/选中场景为预览场景
 */

import { chakra } from "@chakra-ui/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { scaleBackpackScreenLayout } from "../domain/backpack-screen-config";
import type { DesignSize } from "../domain/design-resolution";
import { scaleInventoryHudLayout } from "../domain/inventory-hud";
import {
  parseBackpackScreenJson,
  parseInventoryHudJson,
  stringifyBackpackScreen,
  stringifyInventoryHud,
} from "../domain/serialize";
import { scaleSceneUiLayout } from "../domain/scene-ui-config";
import type {
  ItemDefinition,
  ItemsLibraryFile,
  RecipeDefinition,
  RecipesLibraryFile,
  SceneDefinition,
  ScenesLibraryFile,
} from "../domain/types";
import { createHistory } from "../store/history";
import {
  BACKPACK_SCREEN_JSON_KEY,
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
  writeHudSetting,
} from "../store/hud-settings";
import {
  readSceneUiConfig,
  writeSceneUiConfig,
} from "../store/scene-ui-settings";
import { writeAuthorSetting } from "../store/author-settings";
import { notifySettingsField } from "../store/settings-sync";
import {
  subscribeUiHistoryTick,
  uiHistoryCanRedo,
  uiHistoryCanUndo,
  uiHistoryRedo,
  uiHistoryUndo,
} from "../store/ui-edit-history-bridge";
import { useItemsLibrary } from "../store/items-persistence";
import { useRecipesLibrary } from "../store/recipes-persistence";
import { useScenesLibrary } from "../store/scenes-persistence";
import { useDesignSize } from "../store/use-design-size";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";
import { SceneCanvas } from "./canvas/scene-canvas";
import {
  downloadJsonFile,
  exportItemsLibrary,
  exportRecipesLibrary,
  exportScenesLibrary,
  tryImportItemsLibrary,
  tryImportRecipesLibrary,
  tryImportScenesLibrary,
} from "./io/import-export";
import {
  createDefaultHotspot,
  HotspotListPanel,
} from "./panels/hotspot-list-panel";
import { ItemListPanel } from "./panels/item-list-panel";
import { ItemPreviewPanel } from "./panels/item-preview-panel";
import { ItemPropertyPanel } from "./panels/item-property-panel";
import { PropertyPanel } from "./panels/property-panel";
import { RecipeListPanel } from "./panels/recipe-list-panel";
import { RecipePreviewPanel } from "./panels/recipe-preview-panel";
import { RecipePropertyPanel } from "./panels/recipe-property-panel";
import { SceneListPanel } from "./panels/scene-list-panel";
import { IconLabel } from "../shared/fa-icon";
import { DesignResolutionMenu } from "./ui/design-resolution-menu";
import { UiEditorPanel } from "./ui/ui-editor-panel";

/** 编辑器顶部分区：场景 / 物品库 / 配方 / UI。 */
export type EditorSection = "scenes" | "items" | "recipes" | "ui";

/**
 * EditorShell 组件属性。
 */
export interface EditorShellProps {
  /** 当前编辑分区 */
  editorSection: EditorSection;

  /**
   * 切换编辑分区。
   *
   * @param section - `"scenes"` | `"items"` | `"recipes"` | `"ui"`
   */
  onEditorSectionChange: (section: EditorSection) => void;

  /**
   * 切换编辑 / 运行预览（由 EditorApp 在本程序内切换 EditorShell ↔ PreviewShell）。
   *
   * @param enabled - false → 运行预览；true → 回到编辑
   * @param options.sceneId - 进预览时传入左侧选中场景 id（可空）
   */
  onSetEditMode: (
    enabled: boolean,
    options?: { sceneId?: string | null },
  ) => void;
}

/**
 * 顶栏按钮样式工厂（轻量 chrome）。
 *
 * @param tokens - 主题 token
 * @param options.disabled - 是否禁用
 * @param options.variant - `"default"` | `"primary"` | `"active"`
 * @returns 可直接赋给 style 的 CSSProperties
 */
function topBarButtonStyle(
  tokens: ThemeTokens,
  options: {
    disabled?: boolean;
    variant?: "default" | "primary" | "active";
  } = {},
): React.CSSProperties {
  const { disabled = false, variant = "default" } = options;
  const isPrimary = variant === "primary";
  const isActive = variant === "active";

  return {
    appearance: "none",
    border: `1px solid ${
      isPrimary || isActive ? tokens.accent : tokens.borderStrong
    }`,
    background: isPrimary
      ? tokens.accent
      : isActive
        ? `${tokens.accent}22`
        : tokens.bgSunken,
    color: isPrimary ? "#0B1210" : tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: isPrimary || isActive ? 600 : 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

/**
 * 在场景库中按 id 替换（或追加）一条场景定义。
 *
 * @param library - 当前库
 * @param scene - 新场景定义
 * @returns 更新后的 ScenesLibraryFile
 */
function upsertScene(
  library: ScenesLibraryFile,
  scene: SceneDefinition,
): ScenesLibraryFile {
  const idx = library.scenes.findIndex((s) => s.id === scene.id);

  if (idx < 0) {
    return { version: 1, scenes: [...library.scenes, scene] };
  }

  const scenes = library.scenes.slice();
  scenes[idx] = scene;

  return { version: 1, scenes };
}

/**
 * 在物品库中按「原 id」替换一条物品定义（支持表单改 id）。
 *
 * @param library - 当前物品库
 * @param previousId - 编辑前的物品 id（选中态）
 * @param item - 新物品定义
 * @returns 更新后的 ItemsLibraryFile；找不到 previousId 时原样返回
 */
function upsertItem(
  library: ItemsLibraryFile,
  previousId: string,
  item: ItemDefinition,
): ItemsLibraryFile {
  const idx = library.items.findIndex((entry) => entry.id === previousId);

  if (idx < 0) {
    return library;
  }

  const items = library.items.slice();
  items[idx] = item;

  return { version: 1, items };
}

/**
 * 在配方库中按 id 替换一条配方定义。
 *
 * @param library - 当前配方库
 * @param previousId - 编辑前的配方 id（选中态）
 * @param recipe - 新配方定义
 * @returns 更新后的 RecipesLibraryFile；找不到 previousId 时原样返回
 */
function upsertRecipe(
  library: RecipesLibraryFile,
  previousId: string,
  recipe: RecipeDefinition,
): RecipesLibraryFile {
  const idx = library.recipes.findIndex((entry) => entry.id === previousId);

  if (idx < 0) {
    return library;
  }

  const recipes = library.recipes.slice();
  recipes[idx] = recipe;

  return { version: 1, recipes };
}

/**
 * 编辑器主壳：场景 / 物品 / 配方分区共用顶栏，按 `editorSection` 切换三栏内容。
 *
 * @param props.editorSection - 当前分区（场景 / 物品库 / 配方）
 * @param props.onEditorSectionChange - 分区切换回调
 * @param props.onSetEditMode - 退出编辑模式回调
 * @returns 完整编辑器 UI
 *
 * @example
 * ```tsx
 * <EditorShell
 *   editorSection="scenes"
 *   onEditorSectionChange={setSection}
 *   onSetEditMode={(v) => { if (!v) openRuntimePreview(); }}
 * />
 * ```
 */
export function EditorShell({
  editorSection,
  onEditorSectionChange,
  onSetEditMode,
}: EditorShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const [library, setLibrary] = useScenesLibrary();
  const [itemsLibrary, setItemsLibrary] = useItemsLibrary();
  const [recipesLibrary, setRecipesLibrary] = useRecipesLibrary();
  const { size: designSize, setSize: setDesignSize } = useDesignSize();

  /** 主场景 id（打开场景交互留空时优先打开） */
  const [defaultSceneIdSetting] = ctx.settings.useValue<string>("defaultSceneId");
  const defaultSceneId =
    typeof defaultSceneIdSetting === "string" ? defaultSceneIdSetting : "";

  /**
   * 将场景设为主场景（写入 editor.defaultSceneId）。
   *
   * @param sceneId - 场景定义 id
   */
  const handleSetDefaultSceneId = useCallback(
    (sceneId: string) => {
      writeAuthorSetting(ctx, "defaultSceneId", sceneId.trim());
      notifySettingsField("defaultSceneId");
    },
    [ctx],
  );

  /**
   * 切换设计分辨率时，将背包 / HUD / 场景 UI 从旧画幅等比缩放到新画幅并写回。
   *
   * @param next - 新设计尺寸
   */
  const handleDesignSizeChange = useCallback(
    (next: DesignSize): void => {
      if (
        next.width !== designSize.width ||
        next.height !== designSize.height
      ) {
        const bagRaw = readHudSetting(ctx, BACKPACK_SCREEN_JSON_KEY);
        const bagText =
          typeof bagRaw === "string" ? bagRaw : String(bagRaw ?? "");
        const bagScaled = scaleBackpackScreenLayout(
          parseBackpackScreenJson(
            bagText,
            designSize.width,
            designSize.height,
          ),
          designSize.width,
          designSize.height,
          next.width,
          next.height,
        );

        writeHudSetting(
          ctx,
          BACKPACK_SCREEN_JSON_KEY,
          stringifyBackpackScreen(bagScaled),
        );
        notifySettingsField(BACKPACK_SCREEN_JSON_KEY);

        const hudRaw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);
        const hudText =
          typeof hudRaw === "string" ? hudRaw : String(hudRaw ?? "");
        const hudScaled = scaleInventoryHudLayout(
          parseInventoryHudJson(
            hudText,
            designSize.width,
            designSize.height,
          ),
          designSize.width,
          designSize.height,
          next.width,
          next.height,
        );

        writeHudSetting(
          ctx,
          INVENTORY_HUD_JSON_KEY,
          stringifyInventoryHud(hudScaled),
        );
        notifySettingsField(INVENTORY_HUD_JSON_KEY);

        const sceneUi = readSceneUiConfig(
          ctx,
          designSize.width,
          designSize.height,
        );
        writeSceneUiConfig(
          ctx,
          scaleSceneUiLayout(
            sceneUi,
            designSize.width,
            designSize.height,
            next.width,
            next.height,
          ),
        );
      }

      setDesignSize(next);
    },
    [ctx, designSize.height, designSize.width, setDesignSize],
  );

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    null,
  );
  const [placementActive, setPlacementActive] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  /** 场景库撤销栈：commit 时 push；快捷键 undo/redo 后写回 setLibrary */
  const historyRef = useRef(createHistory<ScenesLibraryFile>());
  const historySeededRef = useRef(false);

  /** 物品库撤销栈：commit 时 push；快捷键 undo/redo 后写回 setItemsLibrary */
  const itemsHistoryRef = useRef(createHistory<ItemsLibraryFile>());
  const itemsHistorySeededRef = useRef(false);

  /** 配方库撤销栈：commit 时 push；快捷键 undo/redo 后写回 setRecipesLibrary */
  const recipesHistoryRef = useRef(createHistory<RecipesLibraryFile>());
  const recipesHistorySeededRef = useRef(false);

  /**
   * 强制刷新顶栏撤销/重做按钮的 disabled（history 存在 ref 内，push 后需重渲染）。
   * 仅用于 chrome；快捷键不依赖此 state。
   */
  const [, setHistoryUiTick] = useState(0);

  /** 隐藏文件选择器：场景库 / 物品库 / 配方库 JSON 导入 */
  const scenesImportInputRef = useRef<HTMLInputElement>(null);
  const itemsImportInputRef = useRef<HTMLInputElement>(null);
  const recipesImportInputRef = useRef<HTMLInputElement>(null);

  // 首次加载后以当前库播种历史，便于后续 undo
  useEffect(() => {
    if (!historySeededRef.current) {
      historyRef.current.push(library);
      historySeededRef.current = true;
    }
  }, [library]);

  useEffect(() => {
    if (!itemsHistorySeededRef.current) {
      itemsHistoryRef.current.push(itemsLibrary);
      itemsHistorySeededRef.current = true;
    }
  }, [itemsLibrary]);

  useEffect(() => {
    if (!recipesHistorySeededRef.current) {
      recipesHistoryRef.current.push(recipesLibrary);
      recipesHistorySeededRef.current = true;
    }
  }, [recipesLibrary]);

  // 库变化时校正选中场景（删除 / 导入等）
  useEffect(() => {
    if (library.scenes.length === 0) {
      setSelectedSceneId(null);

      return;
    }

    if (
      selectedSceneId === null ||
      !library.scenes.some((s) => s.id === selectedSceneId)
    ) {
      setSelectedSceneId(library.scenes[0]!.id);
    }
  }, [library.scenes, selectedSceneId]);

  // 物品库变化时校正选中物品
  useEffect(() => {
    if (itemsLibrary.items.length === 0) {
      setSelectedItemId(null);

      return;
    }

    if (
      selectedItemId === null ||
      !itemsLibrary.items.some((item) => item.id === selectedItemId)
    ) {
      setSelectedItemId(itemsLibrary.items[0]!.id);
    }
  }, [itemsLibrary.items, selectedItemId]);

  // 配方库变化时校正选中配方
  useEffect(() => {
    if (recipesLibrary.recipes.length === 0) {
      setSelectedRecipeId(null);

      return;
    }

    if (
      selectedRecipeId === null ||
      !recipesLibrary.recipes.some((recipe) => recipe.id === selectedRecipeId)
    ) {
      setSelectedRecipeId(recipesLibrary.recipes[0]!.id);
    }
  }, [recipesLibrary.recipes, selectedRecipeId]);

  // 切换场景时清空 hotspot 选中与放置模式
  useEffect(() => {
    setSelectedHotspotId(null);
    setPlacementActive(false);
  }, [selectedSceneId]);

  const selectedScene = useMemo((): SceneDefinition | null => {
    if (selectedSceneId === null) {
      return null;
    }

    return library.scenes.find((s) => s.id === selectedSceneId) ?? null;
  }, [library.scenes, selectedSceneId]);

  const selectedItem = useMemo((): ItemDefinition | null => {
    if (selectedItemId === null) {
      return null;
    }

    return itemsLibrary.items.find((item) => item.id === selectedItemId) ?? null;
  }, [itemsLibrary.items, selectedItemId]);

  const selectedRecipe = useMemo((): RecipeDefinition | null => {
    if (selectedRecipeId === null) {
      return null;
    }

    return (
      recipesLibrary.recipes.find((recipe) => recipe.id === selectedRecipeId) ??
      null
    );
  }, [recipesLibrary.recipes, selectedRecipeId]);

  /**
   * 提交场景库变更：history.push(next) → 持久化。
   *
   * @param next - 新场景库
   */
  const commitLibrary = useCallback(
    (next: ScenesLibraryFile) => {
      historyRef.current.push(next);
      setLibrary(next);
      setHistoryUiTick((n) => n + 1);
    },
    [setLibrary],
  );

  /**
   * 提交物品库变更：history.push(next) → 持久化。
   *
   * @param next - 新物品库
   */
  const commitItemsLibrary = useCallback(
    (next: ItemsLibraryFile) => {
      itemsHistoryRef.current.push(next);
      setItemsLibrary(next);
      setHistoryUiTick((n) => n + 1);
    },
    [setItemsLibrary],
  );

  /**
   * 提交配方库变更：history.push(next) → 持久化。
   *
   * @param next - 新配方库
   */
  const commitRecipesLibrary = useCallback(
    (next: RecipesLibraryFile) => {
      recipesHistoryRef.current.push(next);
      setRecipesLibrary(next);
      setHistoryUiTick((n) => n + 1);
    },
    [setRecipesLibrary],
  );

  /**
   * 按当前编辑分区撤销一步，并用 history.present 写回对应库。
   *
   * @returns 是否实际发生了撤销
   */
  const handleUndo = useCallback((): boolean => {
    if (editorSection === "scenes") {
      const next = historyRef.current.undo();

      if (next === undefined) {
        return false;
      }

      // 规格：undo 后以 present 写回（undo() 返回值即 present 副本）
      setLibrary(historyRef.current.present ?? next);
      setHistoryUiTick((n) => n + 1);

      return true;
    }

    if (editorSection === "items") {
      const next = itemsHistoryRef.current.undo();

      if (next === undefined) {
        return false;
      }

      setItemsLibrary(itemsHistoryRef.current.present ?? next);
      setHistoryUiTick((n) => n + 1);

      return true;
    }

    if (editorSection === "ui") {
      const ok = uiHistoryUndo();

      if (ok) {
        setHistoryUiTick((n) => n + 1);
      }

      return ok;
    }

    if (editorSection !== "recipes") {
      return false;
    }

    const next = recipesHistoryRef.current.undo();

    if (next === undefined) {
      return false;
    }

    setRecipesLibrary(recipesHistoryRef.current.present ?? next);
    setHistoryUiTick((n) => n + 1);

    return true;
  }, [editorSection, setLibrary, setItemsLibrary, setRecipesLibrary]);

  /**
   * 按当前编辑分区重做一步，并用 history.present 写回对应库。
   *
   * @returns 是否实际发生了重做
   */
  const handleRedo = useCallback((): boolean => {
    if (editorSection === "scenes") {
      const next = historyRef.current.redo();

      if (next === undefined) {
        return false;
      }

      setLibrary(historyRef.current.present ?? next);
      setHistoryUiTick((n) => n + 1);

      return true;
    }

    if (editorSection === "items") {
      const next = itemsHistoryRef.current.redo();

      if (next === undefined) {
        return false;
      }

      setItemsLibrary(itemsHistoryRef.current.present ?? next);
      setHistoryUiTick((n) => n + 1);

      return true;
    }

    if (editorSection === "ui") {
      const ok = uiHistoryRedo();

      if (ok) {
        setHistoryUiTick((n) => n + 1);
      }

      return ok;
    }

    if (editorSection !== "recipes") {
      return false;
    }

    const next = recipesHistoryRef.current.redo();

    if (next === undefined) {
      return false;
    }

    setRecipesLibrary(recipesHistoryRef.current.present ?? next);
    setHistoryUiTick((n) => n + 1);

    return true;
  }, [editorSection, setLibrary, setItemsLibrary, setRecipesLibrary]);

  /**
   * 全局快捷键：Ctrl/Cmd+Z 撤销；Ctrl/Cmd+Y 或 Ctrl/Cmd+Shift+Z 重做。
   * 在 INPUT / TEXTAREA / contentEditable 内不拦截，避免破坏文本编辑。
   */
  useEffect(() => {
    /**
     * @param event - 键盘事件
     */
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;

      if (!mod) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;

      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = key === "y" || (key === "z" && event.shiftKey);

      if (!isUndo && !isRedo) {
        return;
      }

      event.preventDefault();

      if (isUndo) {
        handleUndo();
      } else {
        handleRedo();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleUndo, handleRedo]);

  /**
   * UI 分区历史桥接变化时刷新顶栏撤销/重做 disabled。
   */
  useEffect(() => {
    return subscribeUiHistoryTick(() => {
      setHistoryUiTick((n) => n + 1);
    });
  }, []);

  const canUndo =
    editorSection === "scenes"
      ? historyRef.current.canUndo
      : editorSection === "items"
        ? itemsHistoryRef.current.canUndo
        : editorSection === "recipes"
          ? recipesHistoryRef.current.canUndo
          : editorSection === "ui"
            ? uiHistoryCanUndo()
            : false;
  const canRedo =
    editorSection === "scenes"
      ? historyRef.current.canRedo
      : editorSection === "items"
        ? itemsHistoryRef.current.canRedo
        : editorSection === "recipes"
          ? recipesHistoryRef.current.canRedo
          : editorSection === "ui"
            ? uiHistoryCanRedo()
            : false;

  /**
   * 更新当前场景定义并写回库。
   *
   * @param nextScene - 新 SceneDefinition
   */
  const handleSceneChange = useCallback(
    (nextScene: SceneDefinition) => {
      commitLibrary(upsertScene(library, nextScene));
    },
    [library, commitLibrary],
  );

  /**
   * 更新当前物品定义并写回库；若改了 id 则同步选中态。
   *
   * @param nextItem - 新 ItemDefinition
   */
  const handleItemChange = useCallback(
    (nextItem: ItemDefinition) => {
      if (selectedItemId === null) {
        return;
      }

      const next = upsertItem(itemsLibrary, selectedItemId, nextItem);

      commitItemsLibrary(next);

      if (nextItem.id !== selectedItemId) {
        setSelectedItemId(nextItem.id);
      }
    },
    [selectedItemId, itemsLibrary, commitItemsLibrary],
  );

  /**
   * 更新当前配方定义并写回库。
   *
   * @param nextRecipe - 新 RecipeDefinition
   */
  const handleRecipeChange = useCallback(
    (nextRecipe: RecipeDefinition) => {
      if (selectedRecipeId === null) {
        return;
      }

      const next = upsertRecipe(recipesLibrary, selectedRecipeId, nextRecipe);

      commitRecipesLibrary(next);

      if (nextRecipe.id !== selectedRecipeId) {
        setSelectedRecipeId(nextRecipe.id);
      }
    },
    [selectedRecipeId, recipesLibrary, commitRecipesLibrary],
  );

  /**
   * 拖拽移动 hotspot：写回归一化 x/y（单次抬起一次 commit）。
   *
   * @param id - hotspot id
   * @param x - 归一化 X
   * @param y - 归一化 Y
   */
  const handleHotspotMove = useCallback(
    (id: string, x: number, y: number) => {
      if (selectedScene === null) {
        return;
      }

      const hotspots = selectedScene.hotspots.map((hs) =>
        hs.id === id ? { ...hs, x, y } : hs,
      );

      handleSceneChange({ ...selectedScene, hotspots });
    },
    [selectedScene, handleSceneChange],
  );

  /**
   * 边框拉伸 hotspot：写回中心坐标与 visual.width / visual.height。
   *
   * @param id - hotspot id
   * @param geometry - 中心归一化 + 设计像素尺寸
   */
  const handleHotspotResize = useCallback(
    (
      id: string,
      geometry: { x: number; y: number; width: number; height: number },
    ) => {
      if (selectedScene === null) {
        return;
      }

      const hotspots = selectedScene.hotspots.map((hs) => {
        if (hs.id !== id) {
          return hs;
        }

        return {
          ...hs,
          x: geometry.x,
          y: geometry.y,
          visual: {
            ...hs.visual,
            width: geometry.width,
            height: geometry.height,
          },
        };
      });

      handleSceneChange({ ...selectedScene, hotspots });
    },
    [selectedScene, handleSceneChange],
  );

  /**
   * 点击画布放置新 hotspot。
   *
   * @param x - 归一化 X
   * @param y - 归一化 Y
   */
  const handleCanvasPlace = useCallback(
    (x: number, y: number) => {
      if (selectedScene === null) {
        return;
      }

      const hs = createDefaultHotspot(x, y);

      handleSceneChange({
        ...selectedScene,
        hotspots: [...selectedScene.hotspots, hs],
      });
      setSelectedHotspotId(hs.id);
      setPlacementActive(false);
    },
    [selectedScene, handleSceneChange],
  );

  const sectionLabel =
    editorSection === "scenes"
      ? "场景"
      : editorSection === "items"
        ? "物品库"
        : editorSection === "recipes"
          ? "配方"
          : "UI";

  /**
   * 导出当前场景库 JSON 并触发下载。
   */
  const handleExportScenes = useCallback(() => {
    downloadJsonFile(exportScenesLibrary(library), "scenes-library.json");
  }, [library]);

  /**
   * 导出当前物品库 JSON 并触发下载。
   */
  const handleExportItems = useCallback(() => {
    downloadJsonFile(exportItemsLibrary(itemsLibrary), "items-library.json");
  }, [itemsLibrary]);

  /**
   * 导出当前配方库 JSON 并触发下载。
   */
  const handleExportRecipes = useCallback(() => {
    downloadJsonFile(
      exportRecipesLibrary(recipesLibrary),
      "recipes-library.json",
    );
  }, [recipesLibrary]);

  /**
   * 打开场景库 JSON 文件选择器。
   */
  const handlePickScenesImport = useCallback(() => {
    scenesImportInputRef.current?.click();
  }, []);

  /**
   * 打开物品库 JSON 文件选择器。
   */
  const handlePickItemsImport = useCallback(() => {
    itemsImportInputRef.current?.click();
  }, []);

  /**
   * 打开配方库 JSON 文件选择器。
   */
  const handlePickRecipesImport = useCallback(() => {
    recipesImportInputRef.current?.click();
  }, []);

  /**
   * 读取选中的场景库 JSON；失败时不写 settings。
   *
   * @param event - file input change 事件
   */
  const handleScenesImportChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      event.target.value = "";

      if (file === undefined) {
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const raw = typeof reader.result === "string" ? reader.result : "";
        const result = tryImportScenesLibrary(raw);

        if (!result.ok) {
          window.alert(result.error);

          return;
        }

        commitLibrary(result.value);
      };

      reader.onerror = () => {
        window.alert("读取文件失败");
      };

      reader.readAsText(file);
    },
    [commitLibrary],
  );

  /**
   * 读取选中的物品库 JSON；失败时不写 settings。
   *
   * @param event - file input change 事件
   */
  const handleItemsImportChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      event.target.value = "";

      if (file === undefined) {
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const raw = typeof reader.result === "string" ? reader.result : "";
        const result = tryImportItemsLibrary(raw);

        if (!result.ok) {
          window.alert(result.error);

          return;
        }

        commitItemsLibrary(result.value);
      };

      reader.onerror = () => {
        window.alert("读取文件失败");
      };

      reader.readAsText(file);
    },
    [commitItemsLibrary],
  );

  /**
   * 读取选中的配方库 JSON；失败时不写 settings。
   *
   * @param event - file input change 事件
   */
  const handleRecipesImportChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      event.target.value = "";

      if (file === undefined) {
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const raw = typeof reader.result === "string" ? reader.result : "";
        const result = tryImportRecipesLibrary(raw);

        if (!result.ok) {
          window.alert(result.error);

          return;
        }

        commitRecipesLibrary(result.value);
      };

      reader.onerror = () => {
        window.alert("读取文件失败");
      };

      reader.readAsText(file);
    },
    [commitRecipesLibrary],
  );

  return (
    <chakra.div
      data-testid="editor-shell"
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
      {/* 隐藏 file input：场景 / 物品 / 配方库导入 */}
      <chakra.input
        ref={scenesImportInputRef}
        type="file"
        accept="application/json,.json"
        data-testid="editor-import-scenes-input"
        style={{ display: "none" }}
        onChange={handleScenesImportChange}
      />
      <chakra.input
        ref={itemsImportInputRef}
        type="file"
        accept="application/json,.json"
        data-testid="editor-import-items-input"
        style={{ display: "none" }}
        onChange={handleItemsImportChange}
      />
      <chakra.input
        ref={recipesImportInputRef}
        type="file"
        accept="application/json,.json"
        data-testid="editor-import-recipes-input"
        style={{ display: "none" }}
        onChange={handleRecipesImportChange}
      />

      {/* 顶栏：品牌 + 分区 Tab + 设计分辨率 + 导入导出 + 运行预览 */}
      <chakra.header
        data-testid="editor-top-bar"
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
        <chakra.div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginRight: 4,
          }}
        >
          <chakra.span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: tokens.accent,
              boxShadow: `0 0 0 3px ${tokens.accent}33`,
            }}
          />
          <chakra.span
            style={{
              fontSize: FONT_SIZE_TITLE,
              fontWeight: 650,
              color: tokens.textPrimary,
              letterSpacing: "0.02em",
            }}
          >
            场景交互
          </chakra.span>
        </chakra.div>

        <chakra.div
          role="tablist"
          aria-label="编辑分区"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <chakra.button
            type="button"
            role="tab"
            data-testid="editor-section-scenes"
            aria-selected={editorSection === "scenes"}
            onClick={() => onEditorSectionChange("scenes")}
            style={topBarButtonStyle(tokens, {
              variant: editorSection === "scenes" ? "active" : "default",
            })}
          >
            <IconLabel icon="image">场景</IconLabel>
          </chakra.button>
          <chakra.button
            type="button"
            role="tab"
            data-testid="editor-section-items"
            aria-selected={editorSection === "items"}
            onClick={() => onEditorSectionChange("items")}
            style={topBarButtonStyle(tokens, {
              variant: editorSection === "items" ? "active" : "default",
            })}
          >
            <IconLabel icon="box-open">物品库</IconLabel>
          </chakra.button>
          <chakra.button
            type="button"
            role="tab"
            data-testid="editor-section-recipes"
            aria-selected={editorSection === "recipes"}
            onClick={() => onEditorSectionChange("recipes")}
            style={topBarButtonStyle(tokens, {
              variant: editorSection === "recipes" ? "active" : "default",
            })}
          >
            <IconLabel icon="flask">配方</IconLabel>
          </chakra.button>
          <chakra.button
            type="button"
            role="tab"
            data-testid="editor-section-ui"
            aria-selected={editorSection === "ui"}
            onClick={() => onEditorSectionChange("ui")}
            style={topBarButtonStyle(tokens, {
              variant: editorSection === "ui" ? "active" : "default",
            })}
          >
            <IconLabel icon="layer-group">UI</IconLabel>
          </chakra.button>
        </chakra.div>

        {editorSection === "scenes" || editorSection === "ui" ? (
          <DesignResolutionMenu
            size={designSize}
            onChange={handleDesignSizeChange}
          />
        ) : null}

        {editorSection === "scenes" ? (
          <>
            <chakra.button
              type="button"
              data-testid="editor-export-scenes"
              onClick={handleExportScenes}
              style={topBarButtonStyle(tokens)}
            >
              <IconLabel icon="file-export">导出场景 JSON</IconLabel>
            </chakra.button>
            <chakra.button
              type="button"
              data-testid="editor-import-scenes"
              onClick={handlePickScenesImport}
              style={topBarButtonStyle(tokens)}
            >
              <IconLabel icon="file-import">导入场景 JSON</IconLabel>
            </chakra.button>
          </>
        ) : null}

        {editorSection === "items" ? (
          <>
            <chakra.button
              type="button"
              data-testid="editor-export-items"
              onClick={handleExportItems}
              style={topBarButtonStyle(tokens)}
            >
              <IconLabel icon="file-export">导出物品 JSON</IconLabel>
            </chakra.button>
            <chakra.button
              type="button"
              data-testid="editor-import-items"
              onClick={handlePickItemsImport}
              style={topBarButtonStyle(tokens)}
            >
              <IconLabel icon="file-import">导入物品 JSON</IconLabel>
            </chakra.button>
          </>
        ) : null}

        {editorSection === "recipes" ? (
          <>
            <chakra.button
              type="button"
              data-testid="editor-export-recipes"
              onClick={handleExportRecipes}
              style={topBarButtonStyle(tokens)}
            >
              <IconLabel icon="file-export">导出配方 JSON</IconLabel>
            </chakra.button>
            <chakra.button
              type="button"
              data-testid="editor-import-recipes"
              onClick={handlePickRecipesImport}
              style={topBarButtonStyle(tokens)}
            >
              <IconLabel icon="file-import">导入配方 JSON</IconLabel>
            </chakra.button>
          </>
        ) : null}

        <chakra.button
          type="button"
          data-testid="editor-undo"
          title="撤销 (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => {
            handleUndo();
          }}
          style={topBarButtonStyle(tokens, { disabled: !canUndo })}
        >
          <IconLabel icon="rotate-left">撤销</IconLabel>
        </chakra.button>
        <chakra.button
          type="button"
          data-testid="editor-redo"
          title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => {
            handleRedo();
          }}
          style={topBarButtonStyle(tokens, { disabled: !canRedo })}
        >
          <IconLabel icon="rotate-right">重做</IconLabel>
        </chakra.button>

        <chakra.button
          type="button"
          data-testid="editor-mode-toggle"
          onClick={() =>
            onSetEditMode(false, { sceneId: selectedSceneId })
          }
          style={topBarButtonStyle(tokens, { variant: "primary" })}
        >
          <IconLabel icon="play">运行预览</IconLabel>
        </chakra.button>

        <chakra.div style={{ flex: 1 }} />

        <chakra.span style={{ fontSize: FONT_SIZE_DEFAULT, color: tokens.textMuted }}>
          {sectionLabel}编辑
        </chakra.span>
      </chakra.header>

      {/* 左中右三栏 */}
      <chakra.div
        data-testid="editor-body"
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {editorSection === "scenes" ? (
          <>
            <chakra.aside
              data-testid="editor-panel-left"
              style={{
                width: 260,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                borderRight: `1px solid ${tokens.border}`,
                background: tokens.bgElevated,
              }}
            >
              <chakra.div style={{ flex: 1, minHeight: 0 }}>
                <SceneListPanel
                  library={library}
                  selectedSceneId={selectedSceneId}
                  onSelectScene={setSelectedSceneId}
                  onLibraryChange={commitLibrary}
                  defaultSceneId={defaultSceneId}
                  onSetDefaultSceneId={handleSetDefaultSceneId}
                />
              </chakra.div>
              <chakra.div style={{ flex: 1, minHeight: 0 }}>
                <HotspotListPanel
                  scene={selectedScene}
                  selectedHotspotId={selectedHotspotId}
                  onSelectHotspot={setSelectedHotspotId}
                  onSceneChange={handleSceneChange}
                  placementActive={placementActive}
                  onRequestPlace={() => setPlacementActive(true)}
                />
              </chakra.div>
            </chakra.aside>

            <chakra.main
              data-testid="editor-panel-center"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                position: "relative",
                background: tokens.bgSunken,
                borderRight: `1px solid ${tokens.border}`,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
              }}
            >
              {/*
                画布宿主：flex:1 给出确定高度，供 SceneCanvas absolute 铺满 +
                ResizeObserver 测到真实中栏尺寸，letterbox 才能居中。
              */}
              <chakra.div
                data-testid="scene-canvas-host"
                style={{
                  flex: 1,
                  minHeight: 0,
                  position: "relative",
                }}
              >
                <SceneCanvas
                  scene={selectedScene}
                  selectedHotspotId={selectedHotspotId}
                  onSelectHotspot={setSelectedHotspotId}
                  onHotspotMove={handleHotspotMove}
                  onHotspotResize={handleHotspotResize}
                  onCanvasPlace={handleCanvasPlace}
                  placementActive={placementActive}
                  designWidth={designSize.width}
                  designHeight={designSize.height}
                />
              </chakra.div>
            </chakra.main>

            <chakra.aside
              data-testid="editor-panel-right"
              style={{
                width: 300,
                flexShrink: 0,
                minHeight: 0,
                borderRight: "none",
                background: tokens.bgElevated,
              }}
            >
              <PropertyPanel
                scene={selectedScene}
                selectedHotspotId={selectedHotspotId}
                onSceneChange={handleSceneChange}
                scenes={library.scenes}
                items={itemsLibrary.items}
              />
            </chakra.aside>
          </>
        ) : null}

        {editorSection === "items" ? (
          <>
            <chakra.aside
              data-testid="editor-panel-left"
              style={{
                width: 260,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                borderRight: `1px solid ${tokens.border}`,
                background: tokens.bgElevated,
              }}
            >
              <ItemListPanel
                library={itemsLibrary}
                selectedItemId={selectedItemId}
                onSelectItem={setSelectedItemId}
                onLibraryChange={commitItemsLibrary}
                scenes={library.scenes}
              />
            </chakra.aside>

            <chakra.main
              data-testid="editor-panel-center"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                background: tokens.bgSunken,
                borderRight: `1px solid ${tokens.border}`,
              }}
            >
              <ItemPreviewPanel item={selectedItem} />
            </chakra.main>

            <chakra.aside
              data-testid="editor-panel-right"
              style={{
                width: 300,
                flexShrink: 0,
                minHeight: 0,
                borderRight: "none",
                background: tokens.bgElevated,
              }}
            >
              <ItemPropertyPanel
                item={selectedItem}
                onItemChange={handleItemChange}
              />
            </chakra.aside>
          </>
        ) : null}

        {editorSection === "recipes" ? (
          <>
            <chakra.aside
              data-testid="editor-panel-left"
              style={{
                width: 260,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                borderRight: `1px solid ${tokens.border}`,
                background: tokens.bgElevated,
              }}
            >
              <RecipeListPanel
                library={recipesLibrary}
                selectedRecipeId={selectedRecipeId}
                onSelectRecipe={setSelectedRecipeId}
                onLibraryChange={commitRecipesLibrary}
              />
            </chakra.aside>

            <chakra.main
              data-testid="editor-panel-center"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                background: tokens.bgSunken,
                borderRight: `1px solid ${tokens.border}`,
              }}
            >
              <RecipePreviewPanel
                recipe={selectedRecipe}
                items={itemsLibrary.items}
              />
            </chakra.main>

            <chakra.aside
              data-testid="editor-panel-right"
              style={{
                width: 300,
                flexShrink: 0,
                minHeight: 0,
                borderRight: "none",
                background: tokens.bgElevated,
              }}
            >
              <RecipePropertyPanel
                recipe={selectedRecipe}
                items={itemsLibrary.items}
                onRecipeChange={handleRecipeChange}
              />
            </chakra.aside>
          </>
        ) : null}

        {editorSection === "ui" ? <UiEditorPanel /> : null}
      </chakra.div>
    </chakra.div>
  );
}

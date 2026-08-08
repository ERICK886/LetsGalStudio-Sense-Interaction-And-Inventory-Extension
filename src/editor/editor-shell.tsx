/**
 * editor-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.4.0
 *
 * 场景交互编辑器主壳：顶栏 + 左中右三栏。
 * - 场景分区：场景/交互点列表、画布、Schema 属性
 * - 物品库分区：物品列表、预览、物品属性（Task 12）
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ItemDefinition,
  ItemsLibraryFile,
  SceneDefinition,
  ScenesLibraryFile,
} from "../domain/types";
import { createHistory } from "../store/history";
import { useItemsLibrary } from "../store/items-persistence";
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
  createDefaultHotspot,
  HotspotListPanel,
} from "./panels/hotspot-list-panel";
import { ItemListPanel } from "./panels/item-list-panel";
import { ItemPreviewPanel } from "./panels/item-preview-panel";
import { ItemPropertyPanel } from "./panels/item-property-panel";
import { PropertyPanel } from "./panels/property-panel";
import { SceneListPanel } from "./panels/scene-list-panel";
import { DesignResolutionMenu } from "./ui/design-resolution-menu";

/** 编辑器顶部分区：场景编辑或物品库。 */
export type EditorSection = "scenes" | "items";

/**
 * EditorShell 组件属性。
 */
export interface EditorShellProps {
  /** 当前编辑分区 */
  editorSection: EditorSection;

  /**
   * 切换编辑分区。
   *
   * @param section - `"scenes"` 或 `"items"`
   */
  onEditorSectionChange: (section: EditorSection) => void;

  /**
   * 切换编辑/运行模式（写入 save.isEditMode）。
   *
   * @param enabled - true 进入编辑；false 运行预览
   */
  onSetEditMode: (enabled: boolean) => void;
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
 * 编辑器主壳：场景分区与物品库分区共用顶栏，按 `editorSection` 切换三栏内容。
 *
 * @param props.editorSection - 当前分区（场景 / 物品库）
 * @param props.onEditorSectionChange - 分区切换回调
 * @param props.onSetEditMode - 退出编辑模式回调
 * @returns 完整编辑器 UI
 *
 * @example
 * ```tsx
 * <EditorShell
 *   editorSection="scenes"
 *   onEditorSectionChange={setSection}
 *   onSetEditMode={(v) => save.set("isEditMode", v)}
 * />
 * ```
 */
export function EditorShell({
  editorSection,
  onEditorSectionChange,
  onSetEditMode,
}: EditorShellProps): React.ReactElement {
  const { tokens } = useTheme();
  const [library, setLibrary] = useScenesLibrary();
  const [itemsLibrary, setItemsLibrary] = useItemsLibrary();
  const { size: designSize, setSize: setDesignSize } = useDesignSize();

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    null,
  );
  const [placementActive, setPlacementActive] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  /** 场景库撤销栈（Task 16 再接快捷键；此处先 push） */
  const historyRef = useRef(createHistory<ScenesLibraryFile>());
  const historySeededRef = useRef(false);

  /** 物品库撤销栈（Task 16 再接快捷键；此处先 push） */
  const itemsHistoryRef = useRef(createHistory<ItemsLibraryFile>());
  const itemsHistorySeededRef = useRef(false);

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

  /**
   * 提交场景库变更：history.push(next) → 持久化。
   *
   * @param next - 新场景库
   */
  const commitLibrary = useCallback(
    (next: ScenesLibraryFile) => {
      historyRef.current.push(next);
      setLibrary(next);
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
    },
    [setItemsLibrary],
  );

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

  const sectionLabel = editorSection === "scenes" ? "场景" : "物品库";

  return (
    <div
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
      {/* 顶栏：品牌 + 分区 Tab + 设计分辨率 + 运行预览 */}
      <header
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

        <div
          role="tablist"
          aria-label="编辑分区"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <button
            type="button"
            role="tab"
            data-testid="editor-section-scenes"
            aria-selected={editorSection === "scenes"}
            onClick={() => onEditorSectionChange("scenes")}
            style={topBarButtonStyle(tokens, {
              variant: editorSection === "scenes" ? "active" : "default",
            })}
          >
            场景
          </button>
          <button
            type="button"
            role="tab"
            data-testid="editor-section-items"
            aria-selected={editorSection === "items"}
            onClick={() => onEditorSectionChange("items")}
            style={topBarButtonStyle(tokens, {
              variant: editorSection === "items" ? "active" : "default",
            })}
          >
            物品库
          </button>
        </div>

        {editorSection === "scenes" ? (
          <DesignResolutionMenu size={designSize} onChange={setDesignSize} />
        ) : null}

        <button
          type="button"
          data-testid="editor-mode-toggle"
          onClick={() => onSetEditMode(false)}
          style={topBarButtonStyle(tokens, { variant: "primary" })}
        >
          运行预览
        </button>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: FONT_SIZE_DEFAULT, color: tokens.textMuted }}>
          {sectionLabel}编辑
        </span>
      </header>

      {/* 左中右三栏 */}
      <div
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
            <aside
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
              <div style={{ flex: 1, minHeight: 0 }}>
                <SceneListPanel
                  library={library}
                  selectedSceneId={selectedSceneId}
                  onSelectScene={setSelectedSceneId}
                  onLibraryChange={commitLibrary}
                />
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <HotspotListPanel
                  scene={selectedScene}
                  selectedHotspotId={selectedHotspotId}
                  onSelectHotspot={setSelectedHotspotId}
                  onSceneChange={handleSceneChange}
                  placementActive={placementActive}
                  onRequestPlace={() => setPlacementActive(true)}
                />
              </div>
            </aside>

            <main
              data-testid="editor-panel-center"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                background: tokens.bgSunken,
                borderRight: `1px solid ${tokens.border}`,
              }}
            >
              <SceneCanvas
                scene={selectedScene}
                selectedHotspotId={selectedHotspotId}
                onSelectHotspot={setSelectedHotspotId}
                onHotspotMove={handleHotspotMove}
                onCanvasPlace={handleCanvasPlace}
                placementActive={placementActive}
                designWidth={designSize.width}
                designHeight={designSize.height}
              />
            </main>

            <aside
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
            </aside>
          </>
        ) : (
          <>
            <aside
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
            </aside>

            <main
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
            </main>

            <aside
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
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

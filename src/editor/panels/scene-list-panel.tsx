/**
 * scene-list-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 编辑器左栏上半：场景列表 CRUD（新建 / 删除 / 选中）。
 */

import React, { useCallback, useMemo, useState } from "react";
import { createId } from "../../domain/id";
import type { SceneDefinition, ScenesLibraryFile } from "../../domain/types";
import { IconLabel } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * SceneListPanel 组件属性。
 */
export interface SceneListPanelProps {
  /** 当前场景库 */
  library: ScenesLibraryFile;

  /** 当前选中场景 ID；无选中时为 null */
  selectedSceneId: string | null;

  /**
   * 选中场景。
   *
   * @param sceneId - 场景 id；取消选中传 null
   */
  onSelectScene: (sceneId: string | null) => void;

  /**
   * 场景库变更（由父级负责 history.push + 持久化）。
   *
   * @param next - 新场景库
   */
  onLibraryChange: (next: ScenesLibraryFile) => void;

  /**
   * 主场景 id（settings.defaultSceneId）；空表示未设置。
   * 「打开场景交互」留空时优先打开此场景。
   */
  defaultSceneId?: string;

  /**
   * 将某场景设为主场景（写入 defaultSceneId）。
   *
   * @param sceneId - 场景 id
   */
  onSetDefaultSceneId?: (sceneId: string) => void;
}

/**
 * 创建空白默认场景定义。
 *
 * @returns 带新 id 的 SceneDefinition（name「未命名场景」）
 *
 * @example
 * const scene = createDefaultScene();
 * // { id: "scene_…", name: "未命名场景", baseImage: "", hotspots: [] }
 */
export function createDefaultScene(): SceneDefinition {
  return {
    id: createId("scene"),
    name: "未命名场景",
    baseImage: "",
    baseImageFit: "contain",
    showQuickbar: true,
    showOpenBagButton: true,
    hotspots: [],
    transitionMode: "fade",
  };
}

/**
 * 工具栏小按钮样式。
 *
 * @param tokens - 主题 token
 * @param options.danger - 危险操作（删除）
 * @returns CSSProperties
 */
function toolButtonStyle(
  tokens: ThemeTokens,
  options: { danger?: boolean } = {},
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${options.danger ? "#C45C5C" : tokens.borderStrong}`,
    background: tokens.bgSunken,
    color: options.danger ? "#E8A0A0" : tokens.textPrimary,
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

/**
 * 场景列表行样式。
 *
 * @param tokens - 主题 token
 * @param selected - 是否选中
 * @returns CSSProperties
 */
function rowStyle(
  tokens: ThemeTokens,
  selected: boolean,
): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${selected ? tokens.accent : "transparent"}`,
    background: selected ? `${tokens.accent}18` : "transparent",
    color: tokens.textPrimary,
    cursor: "pointer",
    fontSize: FONT_SIZE_DEFAULT,
    textAlign: "left",
    width: "100%",
    boxSizing: "border-box",
  };
}

/**
 * 场景列表面板：新建 / 删除 / 选中。
 *
 * @param props - SceneListPanelProps
 * @returns 左栏场景列表 UI
 *
 * @example
 * ```tsx
 * <SceneListPanel
 *   library={library}
 *   selectedSceneId={sceneId}
 *   onSelectScene={setSceneId}
 *   onLibraryChange={commitLibrary}
 * />
 * ```
 */
export function SceneListPanel({
  library,
  selectedSceneId,
  onSelectScene,
  onLibraryChange,
  defaultSceneId = "",
  onSetDefaultSceneId,
}: SceneListPanelProps): React.ReactElement {
  const { tokens } = useTheme();
  const [query, setQuery] = useState("");
  const mainSceneId = defaultSceneId.trim();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return library.scenes;
    }

    return library.scenes.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
  }, [library.scenes, query]);

  /**
   * 新建场景并选中。
   */
  const handleAdd = useCallback(() => {
    const scene = createDefaultScene();
    const next: ScenesLibraryFile = {
      version: 1,
      scenes: [...library.scenes, scene],
    };

    onLibraryChange(next);
    onSelectScene(scene.id);
  }, [library.scenes, onLibraryChange, onSelectScene]);

  /**
   * 删除指定场景；若删当前选中则回落到列表第一项。
   *
   * @param sceneId - 待删场景 id
   * @param event - 鼠标事件（阻止冒泡选中）
   */
  const handleDelete = useCallback(
    (sceneId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      const nextScenes = library.scenes.filter((s) => s.id !== sceneId);
      const next: ScenesLibraryFile = { version: 1, scenes: nextScenes };

      onLibraryChange(next);

      if (selectedSceneId === sceneId) {
        onSelectScene(nextScenes[0]?.id ?? null);
      }

      if (mainSceneId === sceneId && onSetDefaultSceneId) {
        const fallbackId = nextScenes[0]?.id ?? "";
        onSetDefaultSceneId(fallbackId);
      }
    },
    [
      library.scenes,
      mainSceneId,
      onLibraryChange,
      onSelectScene,
      onSetDefaultSceneId,
      selectedSceneId,
    ],
  );

  return (
    <div
      data-testid="scene-list-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        background: tokens.bgElevated,
        color: tokens.textPrimary,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
          }}
        >
          场景
        </span>
        <button
          type="button"
          data-testid="scene-list-add"
          onClick={handleAdd}
          style={toolButtonStyle(tokens)}
        >
          <IconLabel icon="plus">新建</IconLabel>
        </button>
      </div>

      <div style={{ padding: "8px 12px", flexShrink: 0 }}>
        <input
          data-testid="scene-list-search"
          type="search"
          placeholder="搜索场景…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            borderRadius: 6,
            border: `1px solid ${tokens.border}`,
            background: tokens.bgSunken,
            color: tokens.textPrimary,
            fontSize: FONT_SIZE_DEFAULT,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "4px 8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: 16,
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            {library.scenes.length === 0 ? "暂无场景，点击「新建」" : "无匹配场景"}
          </div>
        ) : (
          filtered.map((scene) => {
            const selected = scene.id === selectedSceneId;
            const isMain = mainSceneId.length > 0 && scene.id === mainSceneId;

            return (
              <div
                key={scene.id}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <button
                  type="button"
                  data-testid={`scene-list-item-${scene.id}`}
                  aria-selected={selected}
                  onClick={() => onSelectScene(scene.id)}
                  style={rowStyle(tokens, selected)}
                >
                  <IconLabel icon="image" iconSize={11} />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {scene.name || "（未命名）"}
                  </span>
                  {isMain ? (
                    <span
                      data-testid={`scene-list-main-badge-${scene.id}`}
                      title="编辑器默认主场景：仅当方法未填名称且存档尚无本次主场景时使用"
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 650,
                        color: "#0b1a18",
                        background: tokens.accent,
                        borderRadius: 4,
                        padding: "1px 6px",
                        lineHeight: 1.3,
                      }}
                    >
                      主场景
                    </span>
                  ) : null}
                  <span
                    style={{
                      color: tokens.textMuted,
                      fontSize: 11,
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <IconLabel icon="location-dot" iconSize={10} />
                    {scene.hotspots.length}
                  </span>
                </button>
                {onSetDefaultSceneId && !isMain ? (
                  <button
                    type="button"
                    data-testid={`scene-list-set-main-${scene.id}`}
                    aria-label={`将 ${scene.name} 设为主场景`}
                    title="设为编辑器默认主场景（方法已填写名称时不会覆盖本次打开）"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetDefaultSceneId(scene.id);
                    }}
                    style={{
                      ...toolButtonStyle(tokens),
                      padding: "6px 8px",
                      flexShrink: 0,
                      fontSize: 11,
                    }}
                  >
                    设为主
                  </button>
                ) : null}
                <button
                  type="button"
                  data-testid={`scene-list-delete-${scene.id}`}
                  aria-label={`删除场景 ${scene.name}`}
                  onClick={(e) => handleDelete(scene.id, e)}
                  style={{
                    ...toolButtonStyle(tokens, { danger: true }),
                    padding: "6px 8px",
                    flexShrink: 0,
                  }}
                >
                  <IconLabel icon="trash" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

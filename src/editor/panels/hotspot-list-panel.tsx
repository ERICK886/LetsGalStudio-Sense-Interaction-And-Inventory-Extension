/**
 * hotspot-list-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.1
 *
 * 编辑器左栏下半：当前场景的交互点（hotspot）列表。
 */

import React, { useCallback } from "react";
import { defaultHotspotHoverShadow } from "../../domain/hover-shadow";
import { createId } from "../../domain/id";
import { defaultElementMotion } from "../../domain/motion";
import type { HotspotElement, SceneDefinition } from "../../domain/types";
import { IconLabel } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * HotspotListPanel 组件属性。
 */
export interface HotspotListPanelProps {
  /** 当前场景；无场景时为 null */
  scene: SceneDefinition | null;

  /** 当前选中 hotspot id */
  selectedHotspotId: string | null;

  /**
   * 选中 hotspot。
   *
   * @param hotspotId - hotspot id；取消选中传 null
   */
  onSelectHotspot: (hotspotId: string | null) => void;

  /**
   * 当前场景定义变更（含 hotspot 增删）。
   *
   * @param next - 更新后的 SceneDefinition
   */
  onSceneChange: (next: SceneDefinition) => void;

  /**
   * 进入「点击画布放置」模式。
   * 若未提供，则「新建」直接在 (0.5, 0.5) 落点。
   */
  onRequestPlace?: () => void;

  /** 是否处于点击放置模式 */
  placementActive?: boolean;
}

/**
 * 创建默认交互点（落在归一化坐标，默认图为空串）。
 *
 * @param x - 归一化 X（0~1）
 * @param y - 归一化 Y（0~1）
 * @returns HotspotElement
 *
 * @example
 * const hs = createDefaultHotspot(0.5, 0.5);
 */
export function createDefaultHotspot(x: number, y: number): HotspotElement {
  return {
    type: "hotspot",
    id: createId("hotspot"),
    name: "未命名交互点",
    x,
    y,
    visual: {
      kind: "image",
      src: "",
      width: 64,
      height: 64,
    },
    hoverShadow: { ...defaultHotspotHoverShadow(), useGlobal: true },
    actions: [],
    once: false,
    visibleByDefault: true,
    customCss: "",
    motion: defaultElementMotion(),
  };
}

/**
 * 工具栏小按钮样式。
 *
 * @param tokens - 主题 token
 * @param options.active - 选中/激活态
 * @param options.danger - 危险操作
 * @returns CSSProperties
 */
function toolButtonStyle(
  tokens: ThemeTokens,
  options: { active?: boolean; danger?: boolean } = {},
): React.CSSProperties {
  const { active = false, danger = false } = options;

  return {
    appearance: "none",
    border: `1px solid ${
      danger ? "#C45C5C" : active ? tokens.accent : tokens.borderStrong
    }`,
    background: active ? `${tokens.accent}22` : tokens.bgSunken,
    color: danger ? "#E8A0A0" : tokens.textPrimary,
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

/**
 * 当前场景交互点列表面板。
 *
 * @param props - HotspotListPanelProps
 * @returns 交互点列表 UI
 *
 * @example
 * ```tsx
 * <HotspotListPanel
 *   scene={scene}
 *   selectedHotspotId={hsId}
 *   onSelectHotspot={setHsId}
 *   onSceneChange={handleSceneChange}
 * />
 * ```
 */
export function HotspotListPanel({
  scene,
  selectedHotspotId,
  onSelectHotspot,
  onSceneChange,
  onRequestPlace,
  placementActive = false,
}: HotspotListPanelProps): React.ReactElement {
  const { tokens } = useTheme();

  /**
   * 新建：有放置回调则进入放置模式，否则直接落在中心。
   */
  const handleAdd = useCallback(() => {
    if (scene === null) {
      return;
    }

    if (onRequestPlace !== undefined) {
      onRequestPlace();

      return;
    }

    const hs = createDefaultHotspot(0.5, 0.5);

    onSceneChange({
      ...scene,
      hotspots: [...scene.hotspots, hs],
    });
    onSelectHotspot(hs.id);
  }, [scene, onRequestPlace, onSceneChange, onSelectHotspot]);

  /**
   * 删除交互点。
   *
   * @param hotspotId - 待删 id
   * @param event - 鼠标事件
   */
  const handleDelete = useCallback(
    (hotspotId: string, event: React.MouseEvent) => {
      event.stopPropagation();

      if (scene === null) {
        return;
      }

      const nextHotspots = scene.hotspots.filter((h) => h.id !== hotspotId);

      onSceneChange({ ...scene, hotspots: nextHotspots });

      if (selectedHotspotId === hotspotId) {
        onSelectHotspot(nextHotspots[0]?.id ?? null);
      }
    },
    [scene, onSceneChange, onSelectHotspot, selectedHotspotId],
  );

  return (
    <div
      data-testid="hotspot-list-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        background: tokens.bgElevated,
        color: tokens.textPrimary,
        borderTop: `1px solid ${tokens.border}`,
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
          交互点
        </span>
        <button
          type="button"
          data-testid="hotspot-list-add"
          disabled={scene === null}
          onClick={handleAdd}
          style={{
            ...toolButtonStyle(tokens, { active: placementActive }),
            opacity: scene === null ? 0.45 : 1,
            cursor: scene === null ? "not-allowed" : "pointer",
          }}
        >
          <IconLabel icon={placementActive ? "crosshairs" : "plus"}>
            {placementActive ? "点击画布…" : "新建"}
          </IconLabel>
        </button>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {scene === null ? (
          <div
            style={{
              padding: 16,
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            请先选择场景
          </div>
        ) : scene.hotspots.length === 0 ? (
          <div
            style={{
              padding: 16,
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            暂无交互点
          </div>
        ) : (
          scene.hotspots.map((hs) => {
            const selected = hs.id === selectedHotspotId;

            return (
              <div
                key={hs.id}
                style={{ display: "flex", alignItems: "center", gap: 4 }}
              >
                <button
                  type="button"
                  data-testid={`hotspot-list-item-${hs.id}`}
                  aria-selected={selected}
                  onClick={() => onSelectHotspot(hs.id)}
                  style={{
                    appearance: "none",
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: `1px solid ${
                      selected ? tokens.accent : "transparent"
                    }`,
                    background: selected ? `${tokens.accent}18` : "transparent",
                    color: tokens.textPrimary,
                    cursor: "pointer",
                    fontSize: FONT_SIZE_DEFAULT,
                    fontFamily: "inherit",
                    textAlign: "left",
                    boxSizing: "border-box",
                  }}
                >
                  <IconLabel icon="location-dot" iconSize={11} />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {hs.name || "（未命名）"}
                  </span>
                </button>
                <button
                  type="button"
                  data-testid={`hotspot-list-delete-${hs.id}`}
                  aria-label={`删除交互点 ${hs.name}`}
                  onClick={(e) => handleDelete(hs.id, e)}
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

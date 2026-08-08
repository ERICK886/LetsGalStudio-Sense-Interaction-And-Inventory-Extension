/**
 * property-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 编辑器右侧属性面板：按选中场景 / 交互点渲染 schema 表单与动作列表。
 */

import React, { useCallback, useMemo } from "react";
import { defaultHotspotLabel } from "../../domain/hotspot-label";
import {
  normalizeLetterboxColor,
  normalizeLetterboxMode,
} from "../../domain/letterbox";
import { defaultElementMotion, normalizeElementMotion } from "../../domain/motion";
import type {
  HotspotElement,
  ItemDefinition,
  SceneDefinition,
} from "../../domain/types";
import { ActionListField } from "../../schema/action-list-field";
import { FormRenderer } from "../../schema/form-renderer";
import { hotspotFields } from "../../schema/hotspot-schema";
import { sceneFields } from "../../schema/scene-schema";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * PropertyPanel 组件属性。
 */
export interface PropertyPanelProps {
  /** 当前选中场景；无场景时为 null */
  scene: SceneDefinition | null;

  /** 当前选中交互点 id；null 表示编辑场景本身 */
  selectedHotspotId: string | null;

  /**
   * 场景定义变更（写回库，经 EditorShell.commitLibrary）。
   *
   * @param next - 更新后的 SceneDefinition
   */
  onSceneChange: (next: SceneDefinition) => void;

  /** 全部场景（openScene 下拉） */
  scenes: readonly SceneDefinition[];

  /** 物品库条目（giveItem 下拉） */
  items: readonly ItemDefinition[];
}

/**
 * 面板外壳样式。
 *
 * @param tokens - 主题
 * @returns CSSProperties
 */
function panelShellStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    background: tokens.bgElevated,
    color: tokens.textPrimary,
  };
}

/**
 * 确保 hotspot 带有可编辑的 label / motion 默认值（表单写入嵌套路径用）。
 *
 * @param hotspot - 原始交互点
 * @returns 补齐后的副本（不 mutate）
 */
function withHotspotFormDefaults(hotspot: HotspotElement): HotspotElement {
  return {
    ...hotspot,
    label: hotspot.label ?? defaultHotspotLabel(),
    motion: normalizeElementMotion(hotspot.motion),
    hoverShadow: hotspot.hoverShadow ?? { enabled: true },
    visual: {
      kind: "image",
      src: hotspot.visual?.src ?? "",
      width: hotspot.visual?.width,
      height: hotspot.visual?.height,
    },
  };
}

/**
 * 确保场景带有可编辑的 motion / letterbox 默认值。
 *
 * @param scene - 原始场景
 * @returns 补齐后的副本
 */
function withSceneFormDefaults(scene: SceneDefinition): SceneDefinition {
  return {
    ...scene,
    letterboxMode: normalizeLetterboxMode(scene.letterboxMode) ?? "black",
    letterboxColor: normalizeLetterboxColor(scene.letterboxColor) ?? "#000000",
    motion: normalizeElementMotion(scene.motion ?? defaultElementMotion()),
  };
}

/**
 * 右侧属性编辑面板。
 *
 * - 选中 hotspot → 交互点表单 + 动作列表
 * - 仅选中场景 → 场景表单
 * - 无场景 → 空状态
 *
 * @param props - PropertyPanelProps
 * @returns 属性面板 UI
 *
 * @example
 * ```tsx
 * <PropertyPanel
 *   scene={selectedScene}
 *   selectedHotspotId={selectedHotspotId}
 *   onSceneChange={handleSceneChange}
 *   scenes={library.scenes}
 *   items={itemsLibrary.items}
 * />
 * ```
 */
export function PropertyPanel({
  scene,
  selectedHotspotId,
  onSceneChange,
  scenes,
  items,
}: PropertyPanelProps): React.ReactElement {
  const { tokens } = useTheme();

  const selectedHotspot = useMemo((): HotspotElement | null => {
    if (scene === null || selectedHotspotId === null) {
      return null;
    }

    return scene.hotspots.find((hs) => hs.id === selectedHotspotId) ?? null;
  }, [scene, selectedHotspotId]);

  const panelTitle = useMemo(() => {
    if (scene === null) {
      return "属性";
    }

    if (selectedHotspot !== null) {
      return "交互点属性";
    }

    return "场景属性";
  }, [scene, selectedHotspot]);

  /**
   * 更新场景基础字段并规范化 letterbox / motion。
   *
   * @param next - 表单写出的场景
   */
  const handleSceneFormChange = useCallback(
    (next: SceneDefinition) => {
      onSceneChange({
        ...next,
        letterboxMode: normalizeLetterboxMode(next.letterboxMode) ?? "black",
        letterboxColor: normalizeLetterboxColor(next.letterboxColor),
        motion: normalizeElementMotion(next.motion),
      });
    },
    [onSceneChange],
  );

  /**
   * 更新选中交互点并写回场景。
   *
   * @param next - 新 HotspotElement
   */
  const handleHotspotChange = useCallback(
    (next: HotspotElement) => {
      if (scene === null) {
        return;
      }

      const hotspots = scene.hotspots.map((hs) =>
        hs.id === next.id
          ? {
              ...next,
              motion: normalizeElementMotion(next.motion),
              label: next.label
                ? {
                    ...next.label,
                    motion: normalizeElementMotion(next.label.motion),
                  }
                : next.label,
            }
          : hs,
      );

      onSceneChange({ ...scene, hotspots });
    },
    [scene, onSceneChange],
  );

  const formScene = useMemo(
    () => (scene !== null ? withSceneFormDefaults(scene) : null),
    [scene],
  );

  const formHotspot = useMemo(
    () =>
      selectedHotspot !== null
        ? withHotspotFormDefaults(selectedHotspot)
        : null,
    [selectedHotspot],
  );

  return (
    <div data-testid="property-panel" style={panelShellStyle(tokens)}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
            color: tokens.textPrimary,
          }}
        >
          {panelTitle}
        </span>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: scene === null ? 0 : 14,
          minHeight: 0,
        }}
      >
        {scene === null && (
          <div
            data-testid="property-panel-empty"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              padding: 16,
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            从左侧新建或选择场景后，可在此编辑属性。
          </div>
        )}

        {formScene !== null && formHotspot === null && (
          <FormRenderer
            schema={sceneFields(formScene)}
            value={formScene as SceneDefinition & Record<string, unknown>}
            onChange={(next) => {
              handleSceneFormChange(next as SceneDefinition);
            }}
          />
        )}

        {formScene !== null && formHotspot !== null && (
          <>
            <FormRenderer
              schema={hotspotFields(formHotspot)}
              value={formHotspot as HotspotElement & Record<string, unknown>}
              onChange={(next) => {
                handleHotspotChange(next as HotspotElement);
              }}
            />
            <ActionListField
              value={formHotspot.actions}
              onChange={(actions) => {
                handleHotspotChange({ ...formHotspot, actions });
              }}
              items={items}
              scenes={scenes}
            />
          </>
        )}
      </div>
    </div>
  );
}

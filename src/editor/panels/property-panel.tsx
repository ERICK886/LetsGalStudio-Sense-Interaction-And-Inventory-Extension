/**
 * property-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.0
 *
 * 编辑器右侧属性面板：按选中场景 / 交互点渲染 schema 表单与动作列表；
 * 无场景时提供物品栏 HUD（inventoryHudJson）最小编辑区，
 * 读写目标为 `backpack-hud` 模块 settings（见 store/hud-settings）。
 */

import React, { useCallback, useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import { defaultHotspotLabel } from "../../domain/hotspot-label";
import {
  normalizeLetterboxColor,
  normalizeLetterboxMode,
} from "../../domain/letterbox";
import { defaultElementMotion, normalizeElementMotion } from "../../domain/motion";
import { normalizeInventoryHud } from "../../domain/inventory-hud";
import {
  parseInventoryHudJson,
  stringifyInventoryHud,
} from "../../domain/serialize";
import type {
  HotspotElement,
  InventoryHudConfig,
  ItemDefinition,
  SceneDefinition,
} from "../../domain/types";
import { ActionListField } from "../../schema/action-list-field";
import { FormRenderer } from "../../schema/form-renderer";
import { hotspotFields } from "../../schema/hotspot-schema";
import { inventoryHudFields } from "../../schema/inventory-hud-schema";
import { sceneFields } from "../../schema/scene-schema";
import {
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
  writeHudSetting,
} from "../../store/hud-settings";
import { notifySettingsField } from "../../store/settings-sync";
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
  const ctx = useExtensionContext();
  /**
   * HUD JSON 声明在 backpack-hud；编辑器内经 hud-settings 读写。
   * 用本地 state + 写回同步，避免跨模块 useValue 不可用。
   */
  const [hudJsonRaw, setHudJsonRaw] = useState<string>(() => {
    const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);

    return typeof raw === "string" ? raw : String(raw ?? "");
  });

  const selectedHotspot = useMemo((): HotspotElement | null => {
    if (scene === null || selectedHotspotId === null) {
      return null;
    }

    return scene.hotspots.find((hs) => hs.id === selectedHotspotId) ?? null;
  }, [scene, selectedHotspotId]);

  /**
   * 无场景时展示的 HUD 表单值（来自 backpack-hud.settings.inventoryHudJson）。
   */
  const hudFormValue = useMemo((): InventoryHudConfig => {
    return parseInventoryHudJson(hudJsonRaw);
  }, [hudJsonRaw]);

  /**
   * 写回 inventoryHudJson（→ backpack-hud）并广播进程内订阅。
   *
   * @param next - 表单写出的 HUD 配置
   */
  const handleHudChange = useCallback(
    (next: InventoryHudConfig) => {
      const normalized = normalizeInventoryHud(next);
      const json = stringifyInventoryHud(normalized);

      writeHudSetting(ctx, INVENTORY_HUD_JSON_KEY, json);
      setHudJsonRaw(json);
      notifySettingsField(INVENTORY_HUD_JSON_KEY);
    },
    [ctx],
  );

  const panelTitle = useMemo(() => {
    if (scene === null) {
      return "物品栏 UI";
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
          padding: 14,
          minHeight: 0,
        }}
      >
        {scene === null && (
          <div data-testid="property-panel-hud-editor">
            <p
              style={{
                margin: "0 0 12px",
                color: tokens.textMuted,
                fontSize: FONT_SIZE_DEFAULT,
                lineHeight: 1.45,
              }}
            >
              未选场景时可编辑快捷栏外观（写入 inventoryHudJson）。也可从左侧选择场景编辑场景属性。
            </p>
            <FormRenderer
              schema={inventoryHudFields()}
              value={hudFormValue as InventoryHudConfig & Record<string, unknown>}
              onChange={(next) => {
                handleHudChange(next as InventoryHudConfig);
              }}
            />
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

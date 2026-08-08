/**
 * ui-editor-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.5.0
 *
 * 编辑器「UI」分区：快捷栏 HUD / 全屏背包可视化编辑。
 * 配置写入 backpack-hud.settings（inventoryHudJson / backpackScreenJson）。
 * 右侧属性：未选中 → 全局字段；选中节点 → 节点字段；支持重置此节点 / 全部重置。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  defaultBackpackScreen,
  resetBackpackScreenNode,
} from "../../domain/backpack-screen-config";
import {
  defaultInventoryHud,
  resetInventoryHudNode,
} from "../../domain/inventory-hud";
import {
  parseBackpackScreenJson,
  parseInventoryHudJson,
  stringifyBackpackScreen,
  stringifyInventoryHud,
} from "../../domain/serialize";
import type {
  BackpackNodeId,
  BackpackScreenConfig,
  InventoryHudConfig,
} from "../../domain/types";
import {
  backpackScreenGlobalFields,
  backpackScreenNodeFields,
} from "../../schema/backpack-screen-schema";
import {
  inventoryHudGlobalFields,
  inventoryHudNodeFields,
  type HudNodeId,
} from "../../schema/inventory-hud-schema";
import { FormRenderer } from "../../schema/form-renderer";
import {
  BACKPACK_SCREEN_JSON_KEY,
  INVENTORY_HUD_JSON_KEY,
  readHudSetting,
  writeHudSetting,
} from "../../store/hud-settings";
import { notifySettingsField } from "../../store/settings-sync";
import { useDesignSize } from "../../store/use-design-size";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";
import { BackpackVisualCanvas } from "./backpack-visual-canvas";
import { HudVisualCanvas } from "./hud-visual-canvas";

/** UI 子分区 */
type UiSubSection = "hud" | "backpack";

/**
 * 从 settings 读取并解析 HUD 配置。
 *
 * @param ctx - 上下文
 * @returns InventoryHudConfig
 */
function loadHud(ctx: ReturnType<typeof useExtensionContext>): InventoryHudConfig {
  const raw = readHudSetting(ctx, INVENTORY_HUD_JSON_KEY);

  return parseInventoryHudJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
  );
}

/**
 * @param ctx - 上下文
 * @returns BackpackScreenConfig
 */
function loadBackpackScreen(
  ctx: ReturnType<typeof useExtensionContext>,
): BackpackScreenConfig {
  const raw = readHudSetting(ctx, BACKPACK_SCREEN_JSON_KEY);

  return parseBackpackScreenJson(
    typeof raw === "string" ? raw : String(raw ?? ""),
  );
}

/**
 * 右侧重置按钮的基础样式。
 *
 * @param tokens - 主题
 * @param primary - 是否强调色描边（全部重置）
 * @returns CSSProperties
 */
function resetButtonStyle(
  tokens: ThemeTokens,
  primary: boolean,
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${primary ? tokens.accent : tokens.borderStrong}`,
    background: primary ? `${tokens.accent}18` : tokens.bgSunken,
    color: tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
    textAlign: "left" as const,
  };
}

/**
 * 编辑器 UI 可视化主面板（占满左中右中的中+右，或整栏）。
 *
 * @returns UI 编辑器
 *
 * @example
 * ```tsx
 * {editorSection === "ui" ? <UiEditorPanel /> : null}
 * ```
 */
export function UiEditorPanel(): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();

  const [sub, setSub] = useState<UiSubSection>("hud");
  const [hud, setHud] = useState<InventoryHudConfig>(() => loadHud(ctx));
  const [bag, setBag] = useState<BackpackScreenConfig>(() =>
    loadBackpackScreen(ctx),
  );

  /**
   * HUD 画布选中节点；决定右侧展示 nodeFields 或 globalFields。
   */
  const [selectedHudNodeId, setSelectedHudNodeId] =
    useState<HudNodeId | null>(null);

  /**
   * 全屏背包画布选中节点；与 selectedHudNodeId 对称。
   */
  const [selectedBagNodeId, setSelectedBagNodeId] =
    useState<BackpackNodeId | null>(null);

  /** 进入分区 / 外部写入时刷新 */
  useEffect(() => {
    setHud(loadHud(ctx));
    setBag(loadBackpackScreen(ctx));
  }, [ctx]);

  const persistHud = useCallback(
    (next: InventoryHudConfig): void => {
      setHud(next);
      writeHudSetting(ctx, INVENTORY_HUD_JSON_KEY, stringifyInventoryHud(next));
      notifySettingsField(INVENTORY_HUD_JSON_KEY);
    },
    [ctx],
  );

  const persistBag = useCallback(
    (next: BackpackScreenConfig): void => {
      setBag(next);
      writeHudSetting(
        ctx,
        BACKPACK_SCREEN_JSON_KEY,
        stringifyBackpackScreen(next),
      );
      notifySettingsField(BACKPACK_SCREEN_JSON_KEY);
    },
    [ctx],
  );

  const hudFormValue = useMemo(
    () => hud as unknown as Record<string, unknown>,
    [hud],
  );

  const bagFormValue = useMemo(
    () => bag as unknown as Record<string, unknown>,
    [bag],
  );

  /**
   * 当前右侧 schema：有选中 → 节点字段，否则全局字段。
   */
  const hudSchema = useMemo(() => {
    return selectedHudNodeId !== null
      ? inventoryHudNodeFields(selectedHudNodeId)
      : inventoryHudGlobalFields();
  }, [selectedHudNodeId]);

  const bagSchema = useMemo(() => {
    return selectedBagNodeId !== null
      ? backpackScreenNodeFields(selectedBagNodeId)
      : backpackScreenGlobalFields();
  }, [selectedBagNodeId]);

  /**
   * 将选中 HUD 节点重置为 defaultInventoryHud 对应节点。
   */
  const handleResetHudNode = useCallback((): void => {
    if (selectedHudNodeId === null) {
      return;
    }

    persistHud(resetInventoryHudNode(hud, selectedHudNodeId));
  }, [hud, persistHud, selectedHudNodeId]);

  /**
   * 将整份 HUD 配置重置为默认。
   */
  const handleResetHudAll = useCallback((): void => {
    persistHud(defaultInventoryHud());
    setSelectedHudNodeId(null);
  }, [persistHud]);

  /**
   * 将选中背包节点重置为 defaultBackpackScreen 对应节点（按设计分辨率）。
   */
  const handleResetBagNode = useCallback((): void => {
    if (selectedBagNodeId === null) {
      return;
    }

    persistBag(
      resetBackpackScreenNode(
        bag,
        selectedBagNodeId,
        designSize.width,
        designSize.height,
      ),
    );
  }, [bag, designSize.height, designSize.width, persistBag, selectedBagNodeId]);

  /**
   * 将整份背包配置重置为默认（按设计分辨率）。
   */
  const handleResetBagAll = useCallback((): void => {
    persistBag(defaultBackpackScreen(designSize.width, designSize.height));
    setSelectedBagNodeId(null);
  }, [designSize.height, designSize.width, persistBag]);

  const tabBtn = (id: UiSubSection, label: string): React.ReactElement => {
    const active = sub === id;

    return (
      <button
        key={id}
        type="button"
        data-testid={`ui-editor-tab-${id}`}
        onClick={() => {
          setSub(id);
          setSelectedHudNodeId(null);
          setSelectedBagNodeId(null);
        }}
        style={{
          appearance: "none",
          border: `1px solid ${active ? tokens.accent : tokens.borderStrong}`,
          background: active ? `${tokens.accent}22` : tokens.bgSunken,
          color: tokens.textPrimary,
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: FONT_SIZE_DEFAULT,
          fontFamily: "inherit",
          fontWeight: active ? 650 : 500,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  };

  const selectedLabel =
    sub === "hud"
      ? selectedHudNodeId ?? "全局"
      : selectedBagNodeId ?? "全局";

  return (
    <div
      data-testid="ui-editor-panel"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <aside
        data-testid="ui-editor-left"
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: `1px solid ${tokens.border}`,
          background: tokens.bgElevated,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            letterSpacing: "0.08em",
            marginBottom: 4,
          }}
        >
          界面
        </div>
        {tabBtn("hud", "快捷栏 HUD")}
        {tabBtn("backpack", "全屏背包")}
        <p
          style={{
            marginTop: 12,
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.55,
          }}
        >
          {sub === "hud"
            ? "在画布上拖拽快捷栏调整位置；右侧可改槽位尺寸与文案。"
            : "在画布上选中并拖拽背包节点；合成钮竖直拖改 offsetY。"}
        </p>
      </aside>

      <main
        data-testid="ui-editor-center"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          borderRight: `1px solid ${tokens.border}`,
          background: tokens.bgSunken,
        }}
      >
        {sub === "hud" ? (
          <HudVisualCanvas
            designWidth={designSize.width}
            designHeight={designSize.height}
            hud={hud}
            selectedNodeId={selectedHudNodeId}
            onSelectNode={setSelectedHudNodeId}
            onHudChange={persistHud}
          />
        ) : (
          <BackpackVisualCanvas
            designWidth={designSize.width}
            designHeight={designSize.height}
            config={bag}
            selectedNodeId={selectedBagNodeId}
            onSelectNode={setSelectedBagNodeId}
            onConfigChange={persistBag}
          />
        )}
      </main>

      <aside
        data-testid="ui-editor-right"
        style={{
          width: 300,
          flexShrink: 0,
          minHeight: 0,
          overflow: "auto",
          background: tokens.bgElevated,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.45,
          }}
        >
          编辑目标：{selectedLabel}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {sub === "hud" ? (
            <>
              {selectedHudNodeId !== null ? (
                <button
                  type="button"
                  data-testid="ui-editor-reset-hud-node"
                  onClick={handleResetHudNode}
                  style={resetButtonStyle(tokens, false)}
                >
                  重置此节点
                </button>
              ) : null}
              <button
                type="button"
                data-testid="ui-editor-reset-hud-all"
                onClick={handleResetHudAll}
                style={resetButtonStyle(tokens, true)}
              >
                全部重置为默认
              </button>
            </>
          ) : (
            <>
              {selectedBagNodeId !== null ? (
                <button
                  type="button"
                  data-testid="ui-editor-reset-bag-node"
                  onClick={handleResetBagNode}
                  style={resetButtonStyle(tokens, false)}
                >
                  重置此节点
                </button>
              ) : null}
              <button
                type="button"
                data-testid="ui-editor-reset-bag-all"
                onClick={handleResetBagAll}
                style={resetButtonStyle(tokens, true)}
              >
                全部重置为默认
              </button>
            </>
          )}
        </div>

        {sub === "hud" ? (
          <FormRenderer
            schema={hudSchema}
            value={hudFormValue}
            onChange={(next) => {
              persistHud(next as unknown as InventoryHudConfig);
            }}
          />
        ) : (
          <FormRenderer
            schema={bagSchema}
            value={bagFormValue}
            onChange={(next) => {
              persistBag(
                parseBackpackScreenJson(JSON.stringify(next)),
              );
            }}
          />
        )}
      </aside>
    </div>
  );
}

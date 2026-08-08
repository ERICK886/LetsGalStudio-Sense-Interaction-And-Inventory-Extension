/**
 * ui-editor-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.3.9
 *
 * 编辑器「UI」分区：快捷栏 HUD / 全屏背包可视化编辑。
 * 配置写入 backpack-hud.settings（inventoryHudJson / backpackScreenJson）。
 * HUD 选中态（selectedHudNodeId）供画布自由布局；按节点表单接线见 Task 10。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  parseBackpackScreenJson,
  parseInventoryHudJson,
  stringifyBackpackScreen,
  stringifyInventoryHud,
} from "../../domain/serialize";
import type {
  BackpackScreenConfig,
  InventoryHudConfig,
} from "../../domain/types";
import { backpackScreenFields } from "../../schema/backpack-screen-schema";
import {
  inventoryHudFields,
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
   * HUD 画布选中节点；Task 10 将据此切换右侧 node/global 表单。
   */
  const [selectedHudNodeId, setSelectedHudNodeId] =
    useState<HudNodeId | null>(null);

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
            : "预览全屏背包分区比例与边距；右侧参数实时生效。"}
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
        }}
      >
        {sub === "hud" ? (
          <FormRenderer
            schema={inventoryHudFields()}
            value={hudFormValue}
            onChange={(next) => {
              persistHud(next as unknown as InventoryHudConfig);
            }}
          />
        ) : (
          <FormRenderer
            schema={backpackScreenFields()}
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

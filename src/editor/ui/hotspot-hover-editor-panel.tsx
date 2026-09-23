/**
 * hotspot-hover-editor-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 全局交互点悬停预设（`SceneUiConfig.hotspotHover`）的表单编辑器。
 * - 读取 / 写入 `editor.sceneUiJson` 的 `hotspotHover` 段（经 readSceneUiConfig / writeSceneUiConfig）
 * - 字段复用 `hotspotHoverPresetFields()`（不含 useGlobal）
 * - 顶部展示说明文案：「未勾选自定义的交互点将使用此预设」
 */

import { chakra } from "@chakra-ui/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  defaultHotspotHoverShadow,
  normalizeHotspotHoverShadow,
} from "../../domain/hover-shadow";
import type { HotspotHoverShadow } from "../../domain/types";
import { FormRenderer } from "../../schema/form-renderer";
import { hotspotHoverPresetFields } from "../../schema/hotspot-schema";
import {
  readSceneUiConfig,
  writeSceneUiConfig,
} from "../../store/scene-ui-settings";
import { notifyUiHistoryTick } from "../../store/ui-edit-history-bridge";
import { FONT_SIZE_DEFAULT, useTheme } from "../../theme/theme-provider";

/**
 * 从场景 UI 预设中读取 hotspotHover 段。
 *
 * @param ctx - 扩展上下文
 * @returns 规范化后的全局悬停阴影配置（不含 useGlobal）
 */
function loadHotspotHover(
  ctx: ReturnType<typeof useExtensionContext>,
): HotspotHoverShadow {
  return readSceneUiConfig(ctx).hotspotHover;
}

/**
 * 将 hotspotHover 段写回场景 UI 预设并通知刷新。
 *
 * 读整包 → 替换 hotspotHover 段 → 写整包，避免覆盖 itemToast 段。
 *
 * @param ctx - 扩展上下文
 * @param next - 新的全局悬停阴影配置
 */
function persistHotspotHover(
  ctx: ReturnType<typeof useExtensionContext>,
  next: HotspotHoverShadow,
): void {
  const ui = readSceneUiConfig(ctx);

  writeSceneUiConfig(ctx, { ...ui, hotspotHover: next });
  notifyUiHistoryTick();
}

/**
 * 全局交互点悬停预设编辑器面板。
 *
 * @returns 编辑器 React 元素
 */
export function HotspotHoverEditorPanel(): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();

  const [config, setConfig] = useState<HotspotHoverShadow>(() =>
    loadHotspotHover(ctx),
  );

  /**
   * 上下文切换后重新加载配置。
   */
  useEffect(() => {
    setConfig(loadHotspotHover(ctx));
  }, [ctx]);

  const formValue = useMemo(
    () => config as unknown as Record<string, unknown>,
    [config],
  );

  /**
   * 表单字段变更回调。
   *
   * @param next - FormRenderer 返回的下一个扁平对象
   */
  const handleChange = useCallback(
    (next: Record<string, unknown>): void => {
      // normalize 会自动剥离 useGlobal（全局段不使用该决策字段）
      const parsed = normalizeHotspotHoverShadow(next);

      setConfig(parsed);
      persistHotspotHover(ctx, parsed);
    },
    [ctx],
  );

  /**
   * 全部重置为默认悬停效果。
   */
  const handleResetAll = useCallback((): void => {
    const next = defaultHotspotHoverShadow();

    // 全局段不携带 useGlobal
    const { useGlobal: _omit, ...withoutUseGlobal } = next;

    setConfig(withoutUseGlobal);
    persistHotspotHover(ctx, withoutUseGlobal);
  }, [ctx]);

  return (
    <chakra.div
      data-testid="hotspot-hover-editor-panel"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <chakra.main
        data-testid="hotspot-hover-info-area"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: tokens.bgSunken,
          borderRight: `1px solid ${tokens.border}`,
          padding: 24,
        }}
      >
        <chakra.div
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            marginBottom: 8,
          }}
        >
          说明
        </chakra.div>
        <chakra.p
          style={{
            margin: 0,
            fontSize: FONT_SIZE_DEFAULT,
            color: tokens.textPrimary,
            lineHeight: 1.6,
            textAlign: "center",
            maxWidth: 360,
          }}
        >
          未勾选自定义的交互点将使用此预设。
        </chakra.p>
      </chakra.main>

      <chakra.aside
        data-testid="hotspot-hover-form-aside"
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
        <chakra.div
          style={{
            fontSize: 12,
            color: tokens.textMuted,
            lineHeight: 1.45,
          }}
        >
          编辑目标：全局
        </chakra.div>

        <chakra.button
          type="button"
          data-testid="hotspot-hover-reset-all"
          onClick={handleResetAll}
          style={{
            appearance: "none",
            border: `1px solid ${tokens.accent}`,
            background: `${tokens.accent}18`,
            color: tokens.textPrimary,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: FONT_SIZE_DEFAULT,
            fontFamily: "inherit",
            fontWeight: 500,
            cursor: "pointer",
            width: "100%",
            textAlign: "left" as const,
          }}
        >
          全部重置为默认
        </chakra.button>

        <FormRenderer
          schema={hotspotHoverPresetFields()}
          value={formValue}
          onChange={handleChange}
        />
      </chakra.aside>
    </chakra.div>
  );
}

/**
 * hotspot-label-editor-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.1.0
 *
 * 全局交互点提示文本外观（`SceneUiConfig.hotspotLabel`）的表单编辑器。
 */

import { Button, chakra } from "@chakra-ui/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  defaultHotspotLabelStyleConfigForDesign,
  normalizeHotspotLabelStyleConfig,
} from "../../domain/hotspot-label";
import type { HotspotLabelStyleConfig } from "../../domain/types";
import {
  applyUiBoxStyle,
  applyUiTextStyle,
} from "../../domain/ui-style";
import { FormRenderer } from "../../schema/form-renderer";
import { hotspotLabelPresetFields } from "../../schema/hotspot-schema";
import {
  readSceneUiConfig,
  writeSceneUiConfig,
} from "../../store/scene-ui-settings";
import { notifyUiHistoryTick } from "../../store/ui-edit-history-bridge";
import { useDesignSize } from "../../store/use-design-size";
import { FONT_SIZE_DEFAULT, useTheme } from "../../theme/theme-provider";

/**
 * 从场景 UI 预设中读取 hotspotLabel 段。
 *
 * @param ctx - 扩展上下文
 * @param designW - 设计宽
 * @param designH - 设计高
 * @returns 规范化后的全局提示外观
 */
function loadHotspotLabel(
  ctx: ReturnType<typeof useExtensionContext>,
  designW: number,
  designH: number,
): HotspotLabelStyleConfig {
  return readSceneUiConfig(ctx, designW, designH).hotspotLabel;
}

/**
 * 将 hotspotLabel 段写回场景 UI 预设并通知刷新。
 *
 * @param ctx - 扩展上下文
 * @param next - 新的全局提示外观
 * @param designW - 设计宽
 * @param designH - 设计高
 */
function persistHotspotLabel(
  ctx: ReturnType<typeof useExtensionContext>,
  next: HotspotLabelStyleConfig,
  designW: number,
  designH: number,
): void {
  const ui = readSceneUiConfig(ctx, designW, designH);

  writeSceneUiConfig(ctx, { ...ui, hotspotLabel: next });
  notifyUiHistoryTick();
}

/**
 * 全局交互点提示文本外观编辑器面板。
 *
 * @returns 编辑器 React 元素
 */
export function HotspotLabelEditorPanel(): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();

  const [config, setConfig] = useState<HotspotLabelStyleConfig>(() =>
    loadHotspotLabel(ctx, designSize.width, designSize.height),
  );

  useEffect(() => {
    setConfig(loadHotspotLabel(ctx, designSize.width, designSize.height));
  }, [ctx, designSize.height, designSize.width]);

  const formValue = useMemo(
    () => config as unknown as Record<string, unknown>,
    [config],
  );

  const handleChange = useCallback(
    (next: Record<string, unknown>): void => {
      const parsed = normalizeHotspotLabelStyleConfig(
        next,
        designSize.width,
        designSize.height,
      );

      setConfig(parsed);
      persistHotspotLabel(
        ctx,
        parsed,
        designSize.width,
        designSize.height,
      );
    },
    [ctx, designSize.height, designSize.width],
  );

  const handleResetAll = useCallback((): void => {
    const next = defaultHotspotLabelStyleConfigForDesign(
      designSize.width,
      designSize.height,
    );

    setConfig(next);
    persistHotspotLabel(ctx, next, designSize.width, designSize.height);
  }, [ctx, designSize.height, designSize.width]);

  const previewStyle: React.CSSProperties = useMemo(
    () => ({
      display: "inline-block",
      padding: `${config.paddingY}px ${config.paddingX}px`,
      maxWidth: config.maxWidth,
      whiteSpace: "nowrap" as const,
      overflow: "hidden",
      textOverflow: "ellipsis",
      lineHeight: 1.3,
      ...applyUiBoxStyle(config.style),
      ...applyUiTextStyle(config.style),
    }),
    [config],
  );

  return (
    <chakra.div
      data-testid="hotspot-label-editor-panel"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <chakra.main
        data-testid="hotspot-label-preview-area"
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
          预览
        </chakra.div>
        <chakra.div style={previewStyle}>交互点提示</chakra.div>
        <chakra.p
          style={{
            margin: 0,
            fontSize: FONT_SIZE_DEFAULT,
            color: tokens.textMuted,
            lineHeight: 1.6,
            textAlign: "center",
            maxWidth: 360,
          }}
        >
          未关闭「跟随全局提示样式」的交互点将使用此外观。
        </chakra.p>
      </chakra.main>

      <chakra.aside
        data-testid="hotspot-label-form-aside"
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

        <Button size="xs" variant="plain"
          type="button"
          data-testid="hotspot-label-reset-all"
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
        </Button>

        <FormRenderer
          schema={hotspotLabelPresetFields()}
          value={formValue}
          onChange={handleChange}
        />
      </chakra.aside>
    </chakra.div>
  );
}

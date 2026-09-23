/**
 * scene-return-editor-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景返回按钮（SceneUiConfig.sceneReturn）的表单编辑器与静态预览。
 * - 读取 / 写入 `editor.sceneUiJson` 的 `sceneReturn` 段（经 readSceneUiConfig / writeSceneUiConfig）
 * - 使用 `FormRenderer` 绑定扁平 / 嵌套值（`rect.x`、`style.background` 等）
 * - 左侧展示一块使用 `applyUiBoxStyle` / `applyUiTextStyle` 渲染的静态按钮（非运行时栈）
 */

import { Button, chakra } from "@chakra-ui/react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  defaultSceneReturnButtonConfig,
  normalizeSceneReturnButtonConfig,
} from "../../domain/scene-return-button-config";
import { applyUiBoxStyle, applyUiTextStyle } from "../../domain/ui-style";
import type { SceneReturnButtonConfig } from "../../domain/types";
import { FormRenderer } from "../../schema/form-renderer";
import { sceneReturnFields } from "../../schema/scene-return-schema";
import {
  readSceneUiConfig,
  writeSceneUiConfig,
} from "../../store/scene-ui-settings";
import { notifyUiHistoryTick } from "../../store/ui-edit-history-bridge";
import { useDesignSize } from "../../store/use-design-size";
import { FONT_SIZE_DEFAULT, useTheme } from "../../theme/theme-provider";

/**
 * 从场景 UI 预设中读取 sceneReturn 段。
 *
 * @param ctx - 扩展上下文
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 * @returns 规范化后的 `SceneReturnButtonConfig`
 */
function loadSceneReturn(
  ctx: ReturnType<typeof useExtensionContext>,
  designW: number,
  designH: number,
): SceneReturnButtonConfig {
  return readSceneUiConfig(ctx, designW, designH).sceneReturn;
}

/**
 * 将 sceneReturn 段写回场景 UI 预设并通知刷新。
 *
 * 读整包 → 替换 sceneReturn 段 → 写整包，避免覆盖 itemToast / hotspotHover 段。
 *
 * @param ctx - 扩展上下文
 * @param next - 新的返回按钮配置
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 */
function persistSceneReturn(
  ctx: ReturnType<typeof useExtensionContext>,
  next: SceneReturnButtonConfig,
  designW: number,
  designH: number,
): void {
  const ui = readSceneUiConfig(ctx, designW, designH);

  writeSceneUiConfig(ctx, { ...ui, sceneReturn: next });
  notifyUiHistoryTick();
}

/**
 * 场景返回按钮编辑器面板。
 *
 * @returns 编辑器 React 元素
 *
 * @example
 * ```tsx
 * <SceneReturnEditorPanel />
 * ```
 */
export function SceneReturnEditorPanel(): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();

  const [config, setConfig] = useState<SceneReturnButtonConfig>(() =>
    loadSceneReturn(ctx, designSize.width, designSize.height),
  );

  /**
   * 上下文 / 设计分辨率切换后重新加载配置。
   */
  useEffect(() => {
    setConfig(loadSceneReturn(ctx, designSize.width, designSize.height));
  }, [ctx, designSize.height, designSize.width]);

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
      const parsed = normalizeSceneReturnButtonConfig(
        next,
        designSize.width,
        designSize.height,
      );

      setConfig(parsed);
      persistSceneReturn(ctx, parsed, designSize.width, designSize.height);
    },
    [ctx, designSize.height, designSize.width],
  );

  /**
   * 全部重置为默认返回按钮配置。
   */
  const handleResetAll = useCallback((): void => {
    const next = defaultSceneReturnButtonConfig(
      designSize.width,
      designSize.height,
    );

    setConfig(next);
    persistSceneReturn(ctx, next, designSize.width, designSize.height);
  }, [ctx, designSize.height, designSize.width]);

  /**
   * 静态预览按钮样式：合并矩形、盒样式、文本样式与可选背景图。
   */
  const previewStyle: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: config.rect.w,
      height: config.rect.h,
      boxSizing: "border-box",
      ...applyUiBoxStyle(config.style),
      ...applyUiTextStyle(config.style),
    };

    if (config.imageSrc) {
      base.backgroundImage = `url(${config.imageSrc})`;
      base.backgroundSize = "cover";
      base.backgroundPosition = "center";
      base.backgroundRepeat = "no-repeat";
    }

    if (!config.enabled) {
      base.opacity = 0.45;
    }

    return base;
  }, [config]);

  return (
    <chakra.div
      data-testid="scene-return-editor-panel"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <chakra.main
        data-testid="scene-return-preview-area"
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
        <chakra.div style={previewStyle}>{config.label}</chakra.div>
        {!config.enabled ? (
          <chakra.p
            style={{
              margin: 0,
              fontSize: 12,
              color: tokens.textMuted,
            }}
          >
            已禁用（运行时不会显示）
          </chakra.p>
        ) : null}
      </chakra.main>

      <chakra.aside
        data-testid="scene-return-form-aside"
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
          data-testid="scene-return-reset-all"
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
          schema={sceneReturnFields()}
          value={formValue}
          onChange={handleChange}
        />
      </chakra.aside>
    </chakra.div>
  );
}

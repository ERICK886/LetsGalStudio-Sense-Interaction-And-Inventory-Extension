/**
 * item-toast-editor-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 获得物品 Toast 的表单编辑器与静态预览。
 * - 读取 / 写入 `editor.sceneUiJson` 的 `itemToast` 段（经 readSceneUiConfig / writeSceneUiConfig）
 * - 首次挂载时若 editor 键为空且旧 `backpack-hud.itemToastJson` 迁入成功，写回一次以落盘
 * - 使用 `FormRenderer` 绑定扁平 / 嵌套值（`style.background` 等）
 * - 右侧展示一条使用 `applyUiBoxStyle` / `applyUiTextStyle` 渲染的示例气泡
 */

import { chakra } from "@chakra-ui/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useExtensionContext } from "@avg-studio/sdk";
import {
  defaultItemToastConfig,
  parseItemToastJson,
} from "../../domain/item-toast-config";
import { applyUiBoxStyle, applyUiTextStyle } from "../../domain/ui-style";
import type { ItemToastConfig } from "../../domain/types";
import { FormRenderer } from "../../schema/form-renderer";
import { itemToastGlobalFields } from "../../schema/item-toast-schema";
import {
  readAuthorSetting,
} from "../../store/author-settings";
import {
  ITEM_TOAST_JSON_KEY,
  readHudSetting,
} from "../../store/hud-settings";
import {
  readSceneUiConfig,
  SCENE_UI_JSON_KEY,
  writeSceneUiConfig,
} from "../../store/scene-ui-settings";
import { notifySettingsField } from "../../store/settings-sync";
import { notifyUiHistoryTick } from "../../store/ui-edit-history-bridge";
import { useDesignSize } from "../../store/use-design-size";
import { FONT_SIZE_DEFAULT, useTheme } from "../../theme/theme-provider";

/**
 * 从场景 UI 预设中读取 itemToast 段。
 *
 * @param ctx - 扩展上下文
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 * @returns 规范化后的 `ItemToastConfig`
 */
function loadItemToast(
  ctx: ReturnType<typeof useExtensionContext>,
  designW: number,
  designH: number,
): ItemToastConfig {
  return readSceneUiConfig(ctx, designW, designH).itemToast;
}

/**
 * 将 itemToast 段写回场景 UI 预设并通知刷新。
 *
 * 读整包 → 替换 itemToast 段 → 写整包，避免覆盖 hotspotHover 段。
 *
 * @param ctx - 扩展上下文
 * @param next - 新的 Toast 配置
 * @param designW - 当前设计宽
 * @param designH - 当前设计高
 */
function persistItemToast(
  ctx: ReturnType<typeof useExtensionContext>,
  next: ItemToastConfig,
  designW: number,
  designH: number,
): void {
  const ui = readSceneUiConfig(ctx, designW, designH);

  writeSceneUiConfig(ctx, { ...ui, itemToast: next });
  notifyUiHistoryTick();
}

/**
 * 判断是否需要将旧 `backpack-hud.itemToastJson` 迁移结果落盘到 editor 键。
 *
 * 条件：editor `sceneUiJson` 为空 且 旧 `itemToastJson` 非空。
 * 此时 readSceneUiConfig 返回的是迁移态（未持久化），需写回一次。
 *
 * @param ctx - 扩展上下文
 * @returns true 表示需要落盘迁移结果
 */
function shouldPersistMigration(
  ctx: ReturnType<typeof useExtensionContext>,
): boolean {
  const editorRaw = readAuthorSetting(ctx, SCENE_UI_JSON_KEY);
  const editorStr = typeof editorRaw === "string" ? editorRaw.trim() : "";

  if (editorStr.length > 0) {
    return false;
  }

  const legacy = readHudSetting(ctx, ITEM_TOAST_JSON_KEY);
  const legacyStr = typeof legacy === "string" ? legacy.trim() : "";

  return legacyStr.length > 0;
}

/**
 * 获得物品 Toast 编辑器面板。
 *
 * @returns 编辑器 React 元素
 */
export function ItemToastEditorPanel(): React.ReactElement {
  const { tokens } = useTheme();
  const ctx = useExtensionContext();
  const { size: designSize } = useDesignSize();

  const [config, setConfig] = useState<ItemToastConfig>(() =>
    loadItemToast(ctx, designSize.width, designSize.height),
  );

  /** 标记迁移落盘是否已执行（避免重复写入） */
  const migrationPersistedRef = useRef(false);

  /**
   * 上下文 / 设计分辨率切换后重新加载配置；首次挂载若处于迁移态则写回一次。
   */
  useEffect(() => {
    setConfig(loadItemToast(ctx, designSize.width, designSize.height));
  }, [ctx, designSize.height, designSize.width]);

  useEffect(() => {
    if (migrationPersistedRef.current) {
      return;
    }

    if (shouldPersistMigration(ctx)) {
      // 迁移态：将 readSceneUiConfig 的迁移结果完整落盘到 editor 键
      const ui = readSceneUiConfig(
        ctx,
        designSize.width,
        designSize.height,
      );

      writeSceneUiConfig(ctx, ui);
      notifySettingsField(SCENE_UI_JSON_KEY);
      migrationPersistedRef.current = true;
    }
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
      const parsed = parseItemToastJson(
        JSON.stringify(next),
        designSize.width,
        designSize.height,
      );

      setConfig(parsed);
      persistItemToast(ctx, parsed, designSize.width, designSize.height);
    },
    [ctx, designSize.height, designSize.width],
  );

  /**
   * 全部重置为默认配置。
   */
  const handleResetAll = useCallback((): void => {
    const next = defaultItemToastConfig(designSize.width, designSize.height);

    setConfig(next);
    persistItemToast(ctx, next, designSize.width, designSize.height);
  }, [ctx, designSize.height, designSize.width]);

  /**
   * 示例气泡样式：合并盒样式与文本样式，并补充内边距与 flex 居中。
   */
  const previewStyle: React.CSSProperties = useMemo(
    () => ({
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 16px",
      ...applyUiBoxStyle(config.style),
      ...applyUiTextStyle(config.style),
    }),
    [config.style],
  );

  return (
    <chakra.div
      data-testid="item-toast-editor-panel"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <chakra.main
        data-testid="item-toast-preview-area"
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
        <chakra.div style={previewStyle}>获得物品：旧钥匙 x1</chakra.div>
      </chakra.main>

      <chakra.aside
        data-testid="item-toast-form-aside"
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
          data-testid="item-toast-reset-all"
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
          schema={itemToastGlobalFields()}
          value={formValue}
          onChange={handleChange}
        />
      </chakra.aside>
    </chakra.div>
  );
}

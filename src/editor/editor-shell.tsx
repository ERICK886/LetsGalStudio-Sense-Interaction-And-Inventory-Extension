/**
 * editor-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互编辑器主壳（占位）：顶栏 + 左 / 中 / 右三栏空布局。
 * 顶栏提供「场景 / 物品库」分区切换与「运行预览」写入 save.isEditMode。
 */

import React from "react";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

/** 编辑器顶部分区：场景编辑或物品库。 */
export type EditorSection = "scenes" | "items";

/**
 * EditorShell 组件属性。
 */
export interface EditorShellProps {
  /** 当前编辑分区 */
  editorSection: EditorSection;

  /**
   * 切换编辑分区。
   *
   * @param section - `"scenes"` 或 `"items"`
   */
  onEditorSectionChange: (section: EditorSection) => void;

  /**
   * 切换编辑/运行模式（写入 save.isEditMode）。
   *
   * @param enabled - true 进入编辑；false 运行预览
   */
  onSetEditMode: (enabled: boolean) => void;
}

/**
 * 顶栏按钮样式工厂（轻量 chrome，后续可抽到共用模块）。
 *
 * @param tokens - 主题 token
 * @param options.disabled - 是否禁用
 * @param options.variant - `"default"` | `"primary"` | `"active"`
 * @param options.active - 是否为选中态（分区 Tab）
 * @returns 可直接赋给 style 的 CSSProperties
 */
function topBarButtonStyle(
  tokens: ThemeTokens,
  options: {
    disabled?: boolean;
    variant?: "default" | "primary" | "active";
  } = {},
): React.CSSProperties {
  const { disabled = false, variant = "default" } = options;
  const isPrimary = variant === "primary";
  const isActive = variant === "active";

  return {
    appearance: "none",
    border: `1px solid ${
      isPrimary || isActive ? tokens.accent : tokens.borderStrong
    }`,
    background: isPrimary
      ? tokens.accent
      : isActive
        ? `${tokens.accent}22`
        : tokens.bgSunken,
    color: isPrimary ? "#0B1210" : tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: isPrimary || isActive ? 600 : 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    lineHeight: 1.2,
  };
}

/**
 * 面板占位块样式。
 *
 * @param tokens - 主题 token
 * @returns CSSProperties
 */
function panelPlaceholderStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
    background: tokens.bgElevated,
    color: tokens.textMuted,
    fontSize: FONT_SIZE_DEFAULT,
    borderRight: `1px solid ${tokens.border}`,
  };
}

/**
 * 编辑器主壳：顶栏工具 + 空左中右布局。
 *
 * @param props.editorSection - 当前分区（场景 / 物品库）
 * @param props.onEditorSectionChange - 分区切换回调
 * @param props.onSetEditMode - 退出编辑模式回调
 * @returns 完整编辑器占位 UI
 *
 * @example
 * ```tsx
 * <EditorShell
 *   editorSection="scenes"
 *   onEditorSectionChange={setSection}
 *   onSetEditMode={(v) => save.set("isEditMode", v)}
 * />
 * ```
 */
export function EditorShell({
  editorSection,
  onEditorSectionChange,
  onSetEditMode,
}: EditorShellProps): React.ReactElement {
  const { tokens } = useTheme();

  const sectionLabel = editorSection === "scenes" ? "场景" : "物品库";

  return (
    <div
      data-testid="editor-shell"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: tokens.bgBase,
        color: tokens.textPrimary,
      }}
    >
      {/* 顶栏：品牌 + 分区 Tab + 运行预览 */}
      <header
        data-testid="editor-top-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px",
          borderBottom: `1px solid ${tokens.border}`,
          background: tokens.bgElevated,
          flexShrink: 0,
          boxShadow: "0 1px 0 rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginRight: 4,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: tokens.accent,
              boxShadow: `0 0 0 3px ${tokens.accent}33`,
            }}
          />
          <span
            style={{
              fontSize: FONT_SIZE_TITLE,
              fontWeight: 650,
              color: tokens.textPrimary,
              letterSpacing: "0.02em",
            }}
          >
            场景交互
          </span>
        </div>

        <div
          role="tablist"
          aria-label="编辑分区"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <button
            type="button"
            role="tab"
            data-testid="editor-section-scenes"
            aria-selected={editorSection === "scenes"}
            onClick={() => onEditorSectionChange("scenes")}
            style={topBarButtonStyle(tokens, {
              variant: editorSection === "scenes" ? "active" : "default",
            })}
          >
            场景
          </button>
          <button
            type="button"
            role="tab"
            data-testid="editor-section-items"
            aria-selected={editorSection === "items"}
            onClick={() => onEditorSectionChange("items")}
            style={topBarButtonStyle(tokens, {
              variant: editorSection === "items" ? "active" : "default",
            })}
          >
            物品库
          </button>
        </div>

        <button
          type="button"
          data-testid="editor-mode-toggle"
          onClick={() => onSetEditMode(false)}
          style={topBarButtonStyle(tokens, { variant: "primary" })}
        >
          运行预览
        </button>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: FONT_SIZE_DEFAULT, color: tokens.textMuted }}>
          {sectionLabel}编辑（占位）
        </span>
      </header>

      {/* 左中右三栏占位 */}
      <div
        data-testid="editor-body"
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <aside
          data-testid="editor-panel-left"
          style={{
            ...panelPlaceholderStyle(tokens),
            width: 260,
            flexShrink: 0,
          }}
        >
          左栏
        </aside>

        <main
          data-testid="editor-panel-center"
          style={{
            ...panelPlaceholderStyle(tokens),
            flex: 1,
            background: tokens.bgSunken,
            borderRight: `1px solid ${tokens.border}`,
          }}
        >
          画布区
        </main>

        <aside
          data-testid="editor-panel-right"
          style={{
            ...panelPlaceholderStyle(tokens),
            width: 300,
            flexShrink: 0,
            borderRight: "none",
          }}
        >
          属性面板
        </aside>
      </div>
    </div>
  );
}

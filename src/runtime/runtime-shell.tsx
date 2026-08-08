/**
 * runtime-shell.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 场景交互运行时壳（占位）：全屏深色背景 + 顶栏。
 * allowEdit 为 true 时显示「编辑」按钮，写入 save.isEditMode。
 */

import React from "react";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../theme/theme-provider";
import type { ThemeTokens } from "../theme/tokens";

/**
 * RuntimeShell 组件属性。
 */
export interface RuntimeShellProps {
  /**
   * 是否允许进入编辑器。
   * true 时顶栏显示「编辑」按钮。
   */
  allowEdit: boolean;

  /**
   * 切回编辑模式（仅 allowEdit 时使用）。
   *
   * @param enabled - true 进入编辑
   */
  onSetEditMode: (enabled: boolean) => void;
}

/**
 * 顶栏按钮样式。
 *
 * @param tokens - 主题 token
 * @param variant - 按钮变体
 * @returns CSSProperties
 */
function topBarButtonStyle(
  tokens: ThemeTokens,
  variant: "default" | "primary" = "default",
): React.CSSProperties {
  const isPrimary = variant === "primary";

  return {
    appearance: "none",
    border: `1px solid ${isPrimary ? tokens.accent : tokens.borderStrong}`,
    background: isPrimary ? tokens.accent : tokens.bgSunken,
    color: isPrimary ? "#0B1210" : tokens.textPrimary,
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: isPrimary ? 600 : 500,
    cursor: "pointer",
    lineHeight: 1.2,
  };
}

/**
 * 玩家 / 预览运行时壳（占位）。
 *
 * @param props.allowEdit - 是否显示编辑入口
 * @param props.onSetEditMode - 切换编辑模式
 * @returns 全屏运行时占位 UI
 *
 * @example
 * ```tsx
 * <RuntimeShell
 *   allowEdit={allowEdit}
 *   onSetEditMode={(v) => save.set("isEditMode", v)}
 * />
 * ```
 */
export function RuntimeShell({
  allowEdit,
  onSetEditMode,
}: RuntimeShellProps): React.ReactElement {
  const { tokens } = useTheme();

  return (
    <div
      data-testid="runtime-shell"
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
      <header
        data-testid="runtime-top-bar"
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

        {allowEdit ? (
          <button
            type="button"
            data-testid="runtime-mode-toggle"
            onClick={() => onSetEditMode(true)}
            style={topBarButtonStyle(tokens, "primary")}
          >
            编辑
          </button>
        ) : null}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: FONT_SIZE_DEFAULT, color: tokens.textMuted }}>
          运行时（占位）
        </span>
      </header>

      <main
        data-testid="runtime-body"
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
          color: tokens.textMuted,
          fontSize: FONT_SIZE_DEFAULT,
        }}
      >
        场景运行区
      </main>
    </div>
  );
}

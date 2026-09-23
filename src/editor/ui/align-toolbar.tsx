/**
 * align-toolbar.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 多选显式对齐工具条（左/右/顶/底/水平居中/垂直居中）。
 */

import { chakra } from "@chakra-ui/react";
import React from "react";
import { FaIcon } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";
import type { AlignMode } from "./align-nodes";

/**
 * AlignToolbar 属性。
 */
export interface AlignToolbarProps {
  /**
   * 选择对齐模式。
   *
   * @param mode - AlignMode
   */
  onAlign: (mode: AlignMode) => void;

  /** 选中数量；&lt; 2 时禁用全部按钮 */
  selectedCount: number;
}

const MODES: Array<{ mode: AlignMode; label: string; icon: string }> = [
  { mode: "left", label: "左对齐", icon: "align-left" },
  { mode: "right", label: "右对齐", icon: "align-right" },
  { mode: "top", label: "顶对齐", icon: "arrow-up" },
  { mode: "bottom", label: "底对齐", icon: "arrow-down" },
  { mode: "centerX", label: "水平居中", icon: "arrows-left-right" },
  { mode: "centerY", label: "垂直居中", icon: "arrows-up-down" },
];

/**
 * @param tokens - 主题
 * @param disabled - 是否禁用
 */
function btnStyle(
  tokens: ThemeTokens,
  disabled: boolean,
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${tokens.borderStrong}`,
    background: tokens.bgSunken,
    color: tokens.textPrimary,
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 12,
    fontFamily: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

/**
 * 对齐工具条。
 *
 * @param props - AlignToolbarProps
 * @returns 工具条
 *
 * @example
 * ```tsx
 * <AlignToolbar selectedCount={2} onAlign={(m) => applyAlign(m)} />
 * ```
 */
export function AlignToolbar({
  onAlign,
  selectedCount,
}: AlignToolbarProps): React.ReactElement {
  const { tokens } = useTheme();
  const disabled = selectedCount < 2;

  return (
    <div
      data-testid="align-toolbar"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: tokens.textMuted,
          lineHeight: 1.4,
        }}
      >
        对齐{disabled ? "（需多选 ≥2）" : `（已选 ${selectedCount}）`}
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {MODES.map(({ mode, label, icon }) => (
          <chakra.button
            key={mode}
            type="button"
            data-testid={`align-${mode}`}
            disabled={disabled}
            onClick={() => onAlign(mode)}
            title={label}
            style={btnStyle(tokens, disabled)}
          >
            <FaIcon name={icon} css={{ fontSize: 12 }} />
            <span>{label}</span>
          </chakra.button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: tokens.textMuted }}>
        字号基准 {FONT_SIZE_DEFAULT}；对齐基于选中包围盒
      </div>
    </div>
  );
}

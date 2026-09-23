/**
 * overlay-palette.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-09
 * 版本: 0.2.0
 *
 * UI 区块「添加组件」工具条：基础 + 控件（Font Awesome 图标）。
 */

import { chakra } from "@chakra-ui/react";
import React from "react";
import type { UiOverlayKind } from "../../domain/types";
import {
  UI_OVERLAY_KIND_ICONS,
  UI_OVERLAY_KIND_LABELS,
} from "../../domain/ui-overlay";
import { FaIcon } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  useTheme,
} from "../../theme/theme-provider";

const BASIC: readonly UiOverlayKind[] = [
  "text",
  "image",
  "button",
  "rect",
  "line",
  "mask",
];

const CONTROLS: readonly UiOverlayKind[] = [
  "select",
  "switch",
  "slider",
  "checkbox",
  "input",
  "tabs",
];

/**
 * OverlayPalette 属性。
 */
export interface OverlayPaletteProps {
  /**
   * 添加指定种类图层。
   *
   * @param kind - 图层种类
   */
  onAdd: (kind: UiOverlayKind) => void;

  /**
   * 删除当前选中图层（无选中时禁用）。
   */
  onDelete?: () => void;

  /** 是否可删除 */
  canDelete?: boolean;
}

/**
 * @param props - OverlayPaletteProps
 * @returns 工具条
 */
export function OverlayPalette({
  onAdd,
  onDelete,
  canDelete = false,
}: OverlayPaletteProps): React.ReactElement {
  const { tokens } = useTheme();

  const btn = (kind: UiOverlayKind): React.ReactElement => (
    <chakra.button
      key={kind}
      type="button"
      data-testid={`ui-overlay-add-${kind}`}
      onClick={() => onAdd(kind)}
      title={UI_OVERLAY_KIND_LABELS[kind]}
      style={{
        appearance: "none",
        border: `1px solid ${tokens.borderStrong}`,
        background: tokens.bgSunken,
        color: tokens.textPrimary,
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 12,
        fontFamily: "inherit",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <FaIcon name={UI_OVERLAY_KIND_ICONS[kind]} css={{ fontSize: 13 }} />
      <chakra.span>{UI_OVERLAY_KIND_LABELS[kind]}</chakra.span>
    </chakra.button>
  );

  return (
    <chakra.div
      data-testid="ui-overlay-palette"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 0",
        borderBottom: `1px solid ${tokens.border}`,
        marginBottom: 8,
      }}
    >
      <chakra.div style={{ fontSize: 12, color: tokens.textMuted }}>基础</chakra.div>
      <chakra.div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {BASIC.map(btn)}
      </chakra.div>
      <chakra.div style={{ fontSize: 12, color: tokens.textMuted }}>控件</chakra.div>
      <chakra.div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CONTROLS.map(btn)}
      </chakra.div>
      {onDelete ? (
        <chakra.button
          type="button"
          data-testid="ui-overlay-delete"
          disabled={!canDelete}
          onClick={onDelete}
          style={{
            appearance: "none",
            alignSelf: "flex-start",
            border: `1px solid ${tokens.borderStrong}`,
            background: canDelete ? "rgba(200,80,80,0.18)" : tokens.bgSunken,
            color: canDelete ? tokens.textPrimary : tokens.textMuted,
            borderRadius: 6,
            padding: "5px 10px",
            fontSize: FONT_SIZE_DEFAULT,
            fontFamily: "inherit",
            cursor: canDelete ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <FaIcon name="trash" css={{ fontSize: 12 }} />
          删除选中图层
        </chakra.button>
      ) : null}
    </chakra.div>
  );
}

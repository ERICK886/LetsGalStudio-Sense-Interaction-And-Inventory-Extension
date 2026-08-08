/**
 * node-list.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 自由布局编辑器节点侧栏：展示固定角色节点列表，点击等同画布选中。
 * 供 HUD / 全屏背包可视化画布左侧复用。
 */

import React from "react";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * 节点列表单项。
 */
export interface NodeListItem {
  /** 节点 id（如 quickbarRoot、panelChrome） */
  id: string;

  /** 侧栏展示文案 */
  label: string;
}

/**
 * NodeList 组件属性。
 */
export interface NodeListProps {
  /** 可编辑节点条目 */
  items: readonly NodeListItem[];

  /** 当前选中节点 id；无选中时为 null */
  selectedId: string | null;

  /**
   * 选中节点。
   *
   * @param id - 节点 id
   */
  onSelect: (id: string) => void;
}

/**
 * 列表行样式。
 *
 * @param tokens - 主题 token
 * @param selected - 是否选中
 * @returns CSSProperties
 */
function rowStyle(
  tokens: ThemeTokens,
  selected: boolean,
): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 6,
    border: `1px solid ${selected ? tokens.accent : "transparent"}`,
    background: selected ? `${tokens.accent}18` : "transparent",
    color: tokens.textPrimary,
    cursor: "pointer",
    fontSize: FONT_SIZE_DEFAULT,
    textAlign: "left",
    width: "100%",
    boxSizing: "border-box",
  };
}

/**
 * 节点列表侧栏。
 *
 * @param props - NodeListProps
 * @returns 节点列表 UI
 *
 * @example
 * ```tsx
 * <NodeList
 *   items={[
 *     { id: "quickbarRoot", label: "快捷栏" },
 *     { id: "openBagButton", label: "打开背包" },
 *   ]}
 *   selectedId={selectedNodeId}
 *   onSelect={onSelectNode}
 * />
 * ```
 */
export function NodeList({
  items,
  selectedId,
  onSelect,
}: NodeListProps): React.ReactElement {
  const { tokens } = useTheme();

  return (
    <div
      data-testid="node-list"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        background: tokens.bgElevated,
        color: tokens.textPrimary,
        borderRight: `1px solid ${tokens.border}`,
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
          fontSize: FONT_SIZE_TITLE,
          fontWeight: 650,
        }}
      >
        节点
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "8px 8px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {items.length === 0 ? (
          <div
            data-testid="node-list-empty"
            style={{
              padding: 16,
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            暂无节点
          </div>
        ) : (
          items.map((item) => {
            const selected = item.id === selectedId;

            return (
              <button
                key={item.id}
                type="button"
                data-testid={`node-list-item-${item.id}`}
                aria-selected={selected}
                onClick={() => onSelect(item.id)}
                style={rowStyle(tokens, selected)}
              >
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/**
 * item-property-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.1.0
 *
 * 物品库编辑器右栏：基于 item-schema 的属性表单。
 */

import React, { useCallback, useMemo } from "react";
import type { ItemDefinition } from "../../domain/types";
import { FormRenderer } from "../../schema/form-renderer";
import { itemFields } from "../../schema/item-schema";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * ItemPropertyPanel 组件属性。
 */
export interface ItemPropertyPanelProps {
  /** 当前选中物品；无选中时为 null */
  item: ItemDefinition | null;

  /**
   * 物品定义变更（写回库）。
   *
   * @param next - 更新后的 ItemDefinition
   */
  onItemChange: (next: ItemDefinition) => void;
}

/**
 * 面板外壳样式。
 *
 * @param tokens - 主题
 * @returns CSSProperties
 */
function panelShellStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    background: tokens.bgElevated,
    color: tokens.textPrimary,
  };
}

/**
 * 规范化表单写出的物品字段（maxStack 取整、非堆叠时去掉 maxStack）。
 *
 * @param next - 表单原始值
 * @returns 规范化后的 ItemDefinition
 */
function normalizeItemForm(next: ItemDefinition): ItemDefinition {
  const stackable = Boolean(next.stackable);

  const result: ItemDefinition = {
    id: typeof next.id === "string" ? next.id.trim() || next.id : String(next.id),
    name: typeof next.name === "string" ? next.name : "",
    description: typeof next.description === "string" ? next.description : "",
    icon: typeof next.icon === "string" ? next.icon : "",
    detailImage: typeof next.detailImage === "string" ? next.detailImage : "",
    stackable,
  };

  if (stackable) {
    const raw = next.maxStack;

    if (typeof raw === "number" && Number.isFinite(raw)) {
      result.maxStack = Math.max(1, Math.floor(raw));
    }
  }

  return result;
}

/**
 * 右侧物品属性编辑面板。
 *
 * @param props - ItemPropertyPanelProps
 * @returns 属性面板 UI
 *
 * @example
 * ```tsx
 * <ItemPropertyPanel item={selectedItem} onItemChange={handleItemChange} />
 * ```
 */
export function ItemPropertyPanel({
  item,
  onItemChange,
}: ItemPropertyPanelProps): React.ReactElement {
  const { tokens } = useTheme();

  const formItem = useMemo(() => {
    if (item === null) {
      return null;
    }

    return {
      ...item,
      maxStack: item.stackable ? (item.maxStack ?? 99) : item.maxStack,
    };
  }, [item]);

  /**
   * 表单变更 → 规范化后回写。
   *
   * @param next - FormRenderer 写出的对象
   */
  const handleChange = useCallback(
    (next: ItemDefinition) => {
      onItemChange(normalizeItemForm(next));
    },
    [onItemChange],
  );

  return (
    <div data-testid="item-property-panel" style={panelShellStyle(tokens)}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
            color: tokens.textPrimary,
          }}
        >
          物品属性
        </span>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: formItem === null ? 0 : 14,
          minHeight: 0,
        }}
      >
        {formItem === null ? (
          <div
            data-testid="item-property-panel-empty"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              padding: 16,
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            从左侧新建或选择物品后，可在此编辑属性。
          </div>
        ) : (
          <FormRenderer
            schema={itemFields(formItem)}
            value={formItem as ItemDefinition & Record<string, unknown>}
            onChange={(next) => {
              handleChange(next as ItemDefinition);
            }}
          />
        )}
      </div>
    </div>
  );
}

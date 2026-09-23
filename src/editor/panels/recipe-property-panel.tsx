/**
 * recipe-property-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.1
 *
 * 配方编辑器右栏：名称 / 描述 + 原料 / 产物行编辑（select 物品 + count）。
 * 不依赖独立 recipe-schema；列表 UI 直接写在本面板。
 * count 使用 DeferredNumberInput，失焦后再 normalizeCount。
 */

import { chakra } from "@chakra-ui/react";
import React, { useCallback } from "react";
import type {
  ItemDefinition,
  RecipeDefinition,
  RecipeItemAmount,
} from "../../domain/types";
import { DeferredNumberInput } from "../../schema/deferred-number-input";
import { IconLabel } from "../../shared/fa-icon";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";
import type { ThemeTokens } from "../../theme/tokens";

/**
 * RecipePropertyPanel 组件属性。
 */
export interface RecipePropertyPanelProps {
  /** 当前选中配方；无选中时为 null */
  recipe: RecipeDefinition | null;

  /** 物品库条目，用于原料 / 产物下拉 */
  items: ItemDefinition[];

  /**
   * 配方定义变更（写回库）。
   *
   * @param next - 更新后的 RecipeDefinition
   */
  onRecipeChange: (next: RecipeDefinition) => void;
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
 * 文本输入框样式。
 *
 * @param tokens - 主题
 * @returns CSSProperties
 */
function fieldInputStyle(tokens: ThemeTokens): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: tokens.bgSunken,
    color: tokens.textPrimary,
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    outline: "none",
  };
}

/**
 * 小按钮样式。
 *
 * @param tokens - 主题
 * @param options.danger - 危险操作
 * @returns CSSProperties
 */
function smallButtonStyle(
  tokens: ThemeTokens,
  options: { danger?: boolean } = {},
): React.CSSProperties {
  return {
    appearance: "none",
    border: `1px solid ${options.danger ? "#C45C5C" : tokens.borderStrong}`,
    background: tokens.bgSunken,
    color: options.danger ? "#E8A0A0" : tokens.textPrimary,
    borderRadius: 6,
    padding: "4px 10px",
    fontSize: FONT_SIZE_DEFAULT,
    fontFamily: "inherit",
    fontWeight: 500,
    cursor: "pointer",
    lineHeight: 1.2,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

/**
 * 规范化数量：有限数字取整后至少为 1；非法时回退 1。
 *
 * @param raw - 原始 count
 * @returns 合法 count（>= 1）
 */
function normalizeCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(1, Math.floor(raw));
  }

  return 1;
}

/**
 * 默认原料/产物行：优先选物品库第一项，否则空 itemId。
 *
 * @param items - 物品列表
 * @returns RecipeItemAmount
 */
function createDefaultLine(items: ItemDefinition[]): RecipeItemAmount {
  return {
    itemId: items[0]?.id ?? "",
    count: 1,
  };
}

/**
 * 右侧配方属性编辑面板。
 *
 * @param props - RecipePropertyPanelProps
 * @returns 属性面板 UI
 *
 * @example
 * ```tsx
 * <RecipePropertyPanel
 *   recipe={selectedRecipe}
 *   items={itemsLibrary.items}
 *   onRecipeChange={handleRecipeChange}
 * />
 * ```
 */
export function RecipePropertyPanel({
  recipe,
  items,
  onRecipeChange,
}: RecipePropertyPanelProps): React.ReactElement {
  const { tokens } = useTheme();

  /**
   * 更新名称。
   *
   * @param name - 新名称
   */
  const handleNameChange = useCallback(
    (name: string) => {
      if (recipe === null) {
        return;
      }

      onRecipeChange({ ...recipe, name });
    },
    [recipe, onRecipeChange],
  );

  /**
   * 更新描述（空串时清除可选字段）。
   *
   * @param description - 新描述
   */
  const handleDescriptionChange = useCallback(
    (description: string) => {
      if (recipe === null) {
        return;
      }

      if (description.trim() === "") {
        onRecipeChange({
          id: recipe.id,
          name: recipe.name,
          ingredients: recipe.ingredients,
          products: recipe.products,
        });

        return;
      }

      onRecipeChange({ ...recipe, description });
    },
    [recipe, onRecipeChange],
  );

  /**
   * 替换原料或产物整列。
   *
   * @param key - `"ingredients"` | `"products"`
   * @param lines - 新行数组
   */
  const replaceLines = useCallback(
    (key: "ingredients" | "products", lines: RecipeItemAmount[]) => {
      if (recipe === null) {
        return;
      }

      onRecipeChange({ ...recipe, [key]: lines });
    },
    [recipe, onRecipeChange],
  );

  /**
   * 更新某一行的 itemId 或 count。
   *
   * @param key - 列键
   * @param index - 行下标
   * @param patch - 局部字段
   */
  const updateLine = useCallback(
    (
      key: "ingredients" | "products",
      index: number,
      patch: Partial<RecipeItemAmount>,
    ) => {
      if (recipe === null) {
        return;
      }

      const lines = recipe[key].map((line, i) => {
        if (i !== index) {
          return line;
        }

        return {
          itemId:
            typeof patch.itemId === "string" ? patch.itemId : line.itemId,
          count:
            patch.count !== undefined
              ? normalizeCount(patch.count)
              : line.count,
        };
      });

      replaceLines(key, lines);
    },
    [recipe, replaceLines],
  );

  /**
   * 删除某一行。
   *
   * @param key - 列键
   * @param index - 行下标
   */
  const removeLine = useCallback(
    (key: "ingredients" | "products", index: number) => {
      if (recipe === null) {
        return;
      }

      replaceLines(
        key,
        recipe[key].filter((_, i) => i !== index),
      );
    },
    [recipe, replaceLines],
  );

  /**
   * 追加一行。
   *
   * @param key - 列键
   */
  const addLine = useCallback(
    (key: "ingredients" | "products") => {
      if (recipe === null) {
        return;
      }

      replaceLines(key, [...recipe[key], createDefaultLine(items)]);
    },
    [recipe, items, replaceLines],
  );

  /**
   * 渲染原料或产物列表块。
   *
   * @param key - `"ingredients"` | `"products"`
   * @param title - 区块标题
   * @param testIdPrefix - data-testid 前缀
   * @returns 列表块
   */
  const renderLinesBlock = (
    key: "ingredients" | "products",
    title: string,
    testIdPrefix: string,
  ): React.ReactElement => {
    const lines = recipe![key];

    return (
      <div
        data-testid={`${testIdPrefix}-block`}
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: FONT_SIZE_DEFAULT,
              fontWeight: 600,
              color: tokens.textPrimary,
            }}
          >
            {title}
          </span>
          <chakra.button
            type="button"
            data-testid={`${testIdPrefix}-add`}
            onClick={() => addLine(key)}
            style={smallButtonStyle(tokens)}
          >
            <IconLabel icon="plus">添加</IconLabel>
          </chakra.button>
        </div>

        {lines.length === 0 ? (
          <div
            style={{
              color: tokens.textMuted,
              fontSize: 12,
              padding: "4px 0",
            }}
          >
            暂无条目，点击「添加」
          </div>
        ) : (
          lines.map((line, index) => (
            <div
              key={`${key}-${index}`}
              data-testid={`${testIdPrefix}-row-${index}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <chakra.select
                data-testid={`${testIdPrefix}-item-${index}`}
                value={line.itemId}
                onChange={(e) =>
                  updateLine(key, index, { itemId: e.target.value })
                }
                style={{
                  ...fieldInputStyle(tokens),
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {items.length === 0 ? (
                  <option value="">（无物品）</option>
                ) : null}
                {line.itemId &&
                !items.some((item) => item.id === line.itemId) ? (
                  <option value={line.itemId}>
                    （缺失）{line.itemId}
                  </option>
                ) : null}
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name || item.id}
                  </option>
                ))}
              </chakra.select>
              <DeferredNumberInput
                testId={`${testIdPrefix}-count-${index}`}
                value={line.count}
                min={1}
                step={1}
                fallback={1}
                ariaLabel={`${title}第 ${index + 1} 行数量`}
                onCommit={(n) =>
                  updateLine(key, index, {
                    count: n ?? 1,
                  })
                }
                style={{
                  ...fieldInputStyle(tokens),
                  width: 64,
                  flexShrink: 0,
                }}
              />
              <chakra.button
                type="button"
                data-testid={`${testIdPrefix}-remove-${index}`}
                aria-label={`删除${title}第 ${index + 1} 行`}
                onClick={() => removeLine(key, index)}
                style={smallButtonStyle(tokens, { danger: true })}
              >
                <IconLabel icon="trash" />
              </chakra.button>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div data-testid="recipe-property-panel" style={panelShellStyle(tokens)}>
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
          配方属性
        </span>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: recipe === null ? 0 : 14,
          minHeight: 0,
        }}
      >
        {recipe === null ? (
          <div
            data-testid="recipe-property-panel-empty"
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
            从左侧新建或选择配方后，可在此编辑属性。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: tokens.textMuted,
                  fontWeight: 550,
                }}
              >
                名称
              </span>
              <chakra.input
                data-testid="recipe-property-name"
                type="text"
                value={recipe.name}
                onChange={(e) => handleNameChange(e.target.value)}
                style={fieldInputStyle(tokens)}
              />
            </label>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: tokens.textMuted,
                  fontWeight: 550,
                }}
              >
                描述
              </span>
              <chakra.textarea
                data-testid="recipe-property-description"
                value={recipe.description ?? ""}
                rows={3}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                style={{
                  ...fieldInputStyle(tokens),
                  resize: "vertical",
                  minHeight: 64,
                }}
              />
            </label>

            {renderLinesBlock("ingredients", "原料", "recipe-ingredient")}
            {renderLinesBlock("products", "产物", "recipe-product")}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * recipe-preview-panel.tsx
 * 作者: 池水三两升
 * 日期: 2026-08-08
 * 版本: 0.2.0
 *
 * 配方编辑器中栏：用物品 name 解析 itemId，展示配方公式文案。
 * 示例：`草药 x2 + 水 x1 → 药水 x1`
 */

import React, { useMemo } from "react";
import type {
  ItemDefinition,
  RecipeDefinition,
  RecipeItemAmount,
} from "../../domain/types";
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_TITLE,
  useTheme,
} from "../../theme/theme-provider";

/**
 * RecipePreviewPanel 组件属性。
 */
export interface RecipePreviewPanelProps {
  /** 当前选中配方；无选中时为 null */
  recipe: RecipeDefinition | null;

  /** 物品库，用于 itemId → name */
  items: ItemDefinition[];
}

/**
 * 将一行 RecipeItemAmount 格式化为「名称 x数量」。
 *
 * @param line - 原料或产物行
 * @param items - 物品定义列表
 * @returns 展示文案；找不到物品时回退 itemId
 *
 * @example
 * ```ts
 * formatRecipeLine({ itemId: "herb", count: 2 }, items); // "草药 x2"
 * ```
 */
export function formatRecipeLine(
  line: RecipeItemAmount,
  items: readonly ItemDefinition[],
): string {
  const item = items.find((entry) => entry.id === line.itemId);
  const name = item?.name?.trim() || line.itemId || "（空）";

  return `${name} x${line.count}`;
}

/**
 * 将配方格式化为「原料 → 产物」预览串。
 *
 * @param recipe - 配方定义
 * @param items - 物品定义列表
 * @returns 完整预览文案
 *
 * @example
 * ```ts
 * formatRecipePreview(recipe, items);
 * // "草药 x2 + 水 x1 → 药水 x1"
 * ```
 */
export function formatRecipePreview(
  recipe: RecipeDefinition,
  items: readonly ItemDefinition[],
): string {
  const left =
    recipe.ingredients.length === 0
      ? "（无原料）"
      : recipe.ingredients
          .map((line) => formatRecipeLine(line, items))
          .join(" + ");

  const right =
    recipe.products.length === 0
      ? "（无产物）"
      : recipe.products
          .map((line) => formatRecipeLine(line, items))
          .join(" + ");

  return `${left} → ${right}`;
}

/**
 * 中栏配方公式预览。
 *
 * @param props - RecipePreviewPanelProps
 * @returns 预览面板 UI
 *
 * @example
 * ```tsx
 * <RecipePreviewPanel recipe={selectedRecipe} items={items} />
 * ```
 */
export function RecipePreviewPanel({
  recipe,
  items,
}: RecipePreviewPanelProps): React.ReactElement {
  const { tokens } = useTheme();

  const formula = useMemo(() => {
    if (recipe === null) {
      return null;
    }

    return formatRecipePreview(recipe, items);
  }, [recipe, items]);

  return (
    <div
      data-testid="recipe-preview-panel"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        background: tokens.bgSunken,
        color: tokens.textPrimary,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 14px",
          borderBottom: `1px solid ${tokens.border}`,
          flexShrink: 0,
          background: tokens.bgElevated,
        }}
      >
        <span
          style={{
            fontSize: FONT_SIZE_TITLE,
            fontWeight: 650,
            color: tokens.textPrimary,
          }}
        >
          配方预览
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        {recipe === null || formula === null ? (
          <div
            data-testid="recipe-preview-empty"
            style={{
              color: tokens.textMuted,
              fontSize: FONT_SIZE_DEFAULT,
              textAlign: "center",
            }}
          >
            请选择配方
          </div>
        ) : (
          <div
            data-testid="recipe-preview-formula"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
              maxWidth: 520,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: FONT_SIZE_TITLE,
                fontWeight: 650,
                color: tokens.textPrimary,
              }}
            >
              {recipe.name || "（未命名）"}
            </div>
            <div
              style={{
                fontSize: 16,
                lineHeight: 1.5,
                color: tokens.textPrimary,
                wordBreak: "break-word",
              }}
            >
              {formula}
            </div>
            {recipe.description ? (
              <div
                data-testid="recipe-preview-description"
                style={{
                  fontSize: FONT_SIZE_DEFAULT,
                  color: tokens.textMuted,
                  lineHeight: 1.45,
                }}
              >
                {recipe.description}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
